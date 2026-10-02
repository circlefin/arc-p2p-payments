/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { SupabaseClient } from "@supabase/supabase-js";
import { refreshWalletBalance } from "@/lib/wallets/refresh-balance";
import { normalizeAddress } from "@/lib/wallets/address";

const ARC_CHAIN_ID = 5042002;
const ARC_NETWORK_NAME = "Arc Testnet";

interface Wallet {
  id: string;
  wallet_address: string;
  balance?: number;
  profile_id: string;
  [key: string]: unknown;
}

interface BaseNotification {
  state: string;
  walletId?: string;
  walletAddress?: string;
  amount?: string;
  tokenAddress?: string;
  blockchain?: string;
  txHash?: string;
}

interface TransfersNotification extends BaseNotification {
  id: string;
  source?: { address: string };
  destination?: { address: string };
}

interface ModularWalletNotification extends BaseNotification {
  from: string;
  to: string;
}

interface UserOperationNotification extends BaseNotification {
  id: string;
  sender: string;
  to: string;
  userOpHash: string;
}

type NotificationType =
  | "transfers"
  | "modularWallet.inboundTransfer"
  | "modularWallet.outboundTransfer"
  | "modularWallet.userOperation"
  | string;

type TransactionType = "USDC_TRANSFER_IN" | "USDC_TRANSFER_OUT";

// A 20-byte address, with or without the 0x prefix. Checked before it goes near a
// query, because ilike treats % and _ as wildcards.
const ADDRESS = /^(0x)?[0-9a-f]{40}$/;

// Find wallet by address. Queries for the one wallet rather than reading a page of
// them: the old version fetched the first 50 wallets (passkey credentials included)
// and searched those in memory, so once there were more than 50, most wallets were
// never found and their transactions and balances were silently dropped.
async function findWalletByAddress(
  address: string
): Promise<Wallet | null> {
  if (!address) {
    console.error("Attempted to find wallet with empty address");
    return null;
  }

  const normalizedAddress = normalizeAddress(address);
  if (!ADDRESS.test(normalizedAddress)) {
    console.error("Ignoring a malformed wallet address in a notification");
    return null;
  }

  const supabase = createSupabaseAdminClient();

  // Some notifications omit or add the 0x prefix.
  const bare = normalizedAddress.replace(/^0x/, "");
  for (const candidate of [`0x${bare}`, bare]) {
    const { data, error } = await supabase
      .from("wallets")
      .select("id, wallet_address, profile_id, balance")
      .ilike("wallet_address", candidate)
      .eq("blockchain", "ARC")
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Error looking up wallet:", error);
      return null;
    }
    if (data) return data as Wallet;
  }

  return null;
}

async function updateWalletBalance(
  walletAddress: string
): Promise<void> {
  if (!walletAddress) return;

  try {
    const wallet = await findWalletByAddress(walletAddress);
    if (!wallet) {
      return;
    }

    // Read straight from Circle. This used to call our own /api/wallet/balance over
    // HTTP, which is why that route had to be open to unauthenticated callers.
    await refreshWalletBalance(wallet);
  } catch (error) {
    console.error("Failed to update wallet balance:", error);
  }
}

async function processTransaction(
  wallet: Wallet,
  transactionType: TransactionType,
  notification: BaseNotification,
  supabase: SupabaseClient,
  counterpartyAddress?: string
): Promise<void> {
  const { state, tokenAddress, amount, txHash } = notification;

  if (!txHash) {
    console.error("Missing txHash in notification");
    return;
  }

  const parsedAmount = amount ? parseFloat(amount) : 0;

  const record = {
    transaction_type: transactionType,
    amount: parsedAmount,
    status: state,
    currency: "USDC",
    wallet_id: wallet.id,
    profile_id: wallet.profile_id,
    circle_transaction_id: txHash,
    created_at: new Date().toISOString(),
    network_name: ARC_NETWORK_NAME,
    network_id: ARC_CHAIN_ID,
    circle_contract_address: counterpartyAddress || tokenAddress,
    description: `${transactionType === "USDC_TRANSFER_IN" ? "Received" : "Sent"} USDC via ${ARC_NETWORK_NAME}`,
  };

  const { data: existing } = await supabase
    .from("transactions")
    .select("id, amount, status, circle_contract_address")
    .eq("circle_transaction_id", txHash)
    .eq("wallet_id", wallet.id)
    .single();

  if (existing) {
    const updates: Record<string, unknown> = {};
    if (existing.status !== state) updates.status = state;
    if (parsedAmount > 0 && Number(existing.amount) === 0) updates.amount = parsedAmount;
    if (counterpartyAddress && existing.circle_contract_address !== counterpartyAddress) {
      updates.circle_contract_address = counterpartyAddress;
    }
    if (Object.keys(updates).length > 0) {
      await supabase.from("transactions").update(updates).eq("id", existing.id);
    }
  } else {
    const { error: insertError } = await supabase
      .from("transactions")
      .insert(record);
    if (insertError) {
      console.error("Error inserting transaction:", insertError);
    }
  }

  // Update balance for COMPLETE transactions (Arc skips CONFIRMED, goes PENDING → COMPLETE)
  if (state === "COMPLETE") {
    let walletAddress = notification.walletAddress;

    if (!walletAddress) {
      if ("sender" in notification) {
        walletAddress = (notification as UserOperationNotification).sender;
      } else if ("from" in notification && "to" in notification) {
        walletAddress =
          transactionType === "USDC_TRANSFER_IN"
            ? (notification as ModularWalletNotification).to
            : (notification as ModularWalletNotification).from;
      }
    }

    if (walletAddress) {
      await updateWalletBalance(walletAddress);
    }
  }
}

async function handleWebhookNotification(
  notification:
    | TransfersNotification
    | ModularWalletNotification
    | UserOperationNotification,
  notificationType: NotificationType
): Promise<void> {
  const supabase = createSupabaseAdminClient();

  try {
    if (notificationType === "transfers") {
      const transferNotification = notification as TransfersNotification;
      const { id, state } = transferNotification;

      if (!id) {
        console.error("Missing ID in transfers notification");
        return;
      }

      const { data: tx, error: txError } = await supabase
        .from("transactions")
        .select()
        .eq("circle_transaction_id", id)
        .single();

      if (!txError && tx && tx.status !== state) {
        await supabase
          .from("transactions")
          .update({ status: state })
          .eq("id", tx.id);
      }

      if (state === "COMPLETE") {
        let walletAddress = notification.walletAddress;

        if (!walletAddress) {
          walletAddress =
            transferNotification.destination?.address ||
            transferNotification.source?.address;
        }

        if (walletAddress) {
          await updateWalletBalance(walletAddress);
        }
      }

      return;
    }

    if (notificationType === "modularWallet.userOperation") {
      const userOpNotification = notification as UserOperationNotification;
      const { state, sender } = userOpNotification;

      // Arc transactions go PENDING → COMPLETE directly
      if (state !== "COMPLETE") {
        return;
      }

      const wallet = await findWalletByAddress(sender);

      if (!wallet) {
        console.error(
          `Could not find a wallet for userOperation sender: ${sender}`
        );
        return;
      }

      const transactionType: TransactionType = "USDC_TRANSFER_OUT";

      await processTransaction(
        wallet,
        transactionType,
        userOpNotification,
        supabase
      );

      return;
    }

    if (notificationType.startsWith("modularWallet")) {
      const modularNotification = notification as ModularWalletNotification;
      const { state, from, to, walletAddress } = modularNotification;

      // Arc transactions go PENDING → COMPLETE directly
      if (state !== "COMPLETE") {
        return;
      }

      const isInbound = notificationType === "modularWallet.inboundTransfer";
      const transactionType: TransactionType = isInbound
        ? "USDC_TRANSFER_IN"
        : "USDC_TRANSFER_OUT";

      const counterpartyAddress = isInbound ? from : to;

      let relevantAddress = walletAddress;

      if (!relevantAddress) {
        relevantAddress = isInbound ? to : from;
      }

      if (!relevantAddress) {
        console.error(
          `No valid address found in notification for ${transactionType}`
        );
        return;
      }

      const wallet = await findWalletByAddress(relevantAddress);

      if (!wallet) {
        const fallbackAddresses = [
          isInbound ? from : to,
          walletAddress,
        ].filter((addr) => addr && addr !== relevantAddress);

        for (const fallbackAddress of fallbackAddresses) {
          if (!fallbackAddress) continue;

          const fallbackWallet = await findWalletByAddress(fallbackAddress);

          if (fallbackWallet) {
            await processTransaction(
              fallbackWallet,
              transactionType,
              modularNotification,
              supabase,
              counterpartyAddress
            );
            return;
          }
        }

        console.error(
          `Could not find a wallet for address: ${relevantAddress} or any fallbacks`
        );
        return;
      }

      await processTransaction(
        wallet,
        transactionType,
        modularNotification,
        supabase,
        counterpartyAddress
      );
    }
  } catch (error) {
    console.error("Error processing notification:", error);
  }
}

async function verifyCircleSignature(
  bodyString: string,
  signature: string,
  keyId: string
): Promise<boolean> {
  try {
    const publicKey = await getCirclePublicKey(keyId);

    const verifier = crypto.createVerify("SHA256");
    verifier.update(bodyString);
    verifier.end();

    const signatureBytes = Uint8Array.from(Buffer.from(signature, "base64"));
    return verifier.verify(publicKey, signatureBytes);
  } catch (error) {
    console.error("Signature verification error:", error);
    return false;
  }
}

async function getCirclePublicKey(keyId: string): Promise<string> {
  if (!process.env.CIRCLE_API_KEY) {
    throw new Error("Circle API key is not set");
  }

  const response = await fetch(
    `https://api.circle.com/v2/notifications/publicKey/${keyId}`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${process.env.CIRCLE_API_KEY}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch public key: ${response.statusText}`);
  }

  const data = await response.json();
  const rawPublicKey = data.data.publicKey;

  return `-----BEGIN PUBLIC KEY-----\n${rawPublicKey.match(/.{1,64}/g)?.join("\n")}\n-----END PUBLIC KEY-----`;
}

export async function POST(req: NextRequest) {
  try {
    const signature = req.headers.get("x-circle-signature");
    const keyId = req.headers.get("x-circle-key-id");

    if (!signature || !keyId) {
      return NextResponse.json(
        { error: "Missing signature or keyId" },
        { status: 400 }
      );
    }

    // Circle signs the exact bytes it sent, so verify those, not a re-serialization.
    const rawBody = await req.text();

    const isVerified = await verifyCircleSignature(
      rawBody,
      signature,
      keyId
    );
    if (!isVerified) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
    }

    let body;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    await handleWebhookNotification(body.notification, body.notificationType);

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error("Failed to process webhook:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to process notification: ${message}` },
      { status: 500 }
    );
  }
}

export async function HEAD() {
  return NextResponse.json({}, { status: 200 });
}
