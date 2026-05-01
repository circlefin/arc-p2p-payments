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
import { createSupabaseServerClient } from "@/lib/supabase/server-client";
import { SupabaseClient } from "@supabase/supabase-js";

const baseUrl = process.env.NEXT_PUBLIC_VERCEL_URL
  ? process.env.NEXT_PUBLIC_VERCEL_URL
  : "http://localhost:3000";

const ARC_CHAIN_ID = 5042002;
const ARC_NETWORK_NAME = "Arc Testnet";

// Type definitions
interface Wallet {
  id: string;
  wallet_address: string;
  balance?: number;
  profile_id: string;
  [key: string]: any;
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

// Find wallet by address
async function findWalletByAddress(
  address: string
): Promise<Wallet | null> {
  if (!address) {
    console.error("Attempted to find wallet with empty address");
    return null;
  }

  const supabase = await createSupabaseServerClient();

  const normalizedAddress = address.trim().toLowerCase();

  const { data: allWallets, error: allWalletsError } = await supabase
    .from("wallets")
    .select("*")
    .limit(50);

  if (allWalletsError) {
    console.error("Error fetching wallets:", allWalletsError);
    return null;
  }

  if (allWallets && allWallets.length > 0) {
    // Exact match with ARC blockchain
    const exactMatch = allWallets.find(
      (wallet) =>
        wallet.wallet_address.toLowerCase() === normalizedAddress &&
        wallet.blockchain === "ARC"
    );

    if (exactMatch) {
      return exactMatch;
    }

    // Try without 0x prefix if original has it
    if (normalizedAddress.startsWith("0x")) {
      const withoutPrefix = normalizedAddress.substring(2);
      const prefixMatch = allWallets.find(
        (wallet) => wallet.wallet_address.toLowerCase() === withoutPrefix
      );

      if (prefixMatch) {
        return prefixMatch;
      }
    } else {
      const withPrefix = "0x" + normalizedAddress;
      const prefixMatch = allWallets.find(
        (wallet) => wallet.wallet_address.toLowerCase() === withPrefix
      );

      if (prefixMatch) {
        return prefixMatch;
      }
    }

    // Fuzzy match as last resort
    const cleanedAddress = normalizedAddress.replace(/[^a-f0-9]/g, "");
    const fuzzyMatch = allWallets.find(
      (wallet) =>
        wallet.wallet_address.toLowerCase().replace(/[^a-f0-9]/g, "") ===
        cleanedAddress
    );

    if (fuzzyMatch) {
      return fuzzyMatch;
    }
  }
  return null;
}

// Update wallet balance after transactions
async function updateWalletBalance(
  walletAddress: string
): Promise<void> {
  if (!walletAddress) return;

  try {
    const wallet = await findWalletByAddress(walletAddress);
    if (!wallet) {
      return;
    }

    const supabase = await createSupabaseServerClient();

    // Call wallet balance API
    const response = await fetch(`${baseUrl}/api/wallet/balance`, {
      method: "POST",
      body: JSON.stringify({
        walletId: wallet.wallet_address,
        blockchain: "arc",
      }),
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      console.error(`Balance API error: ${response.status}`);
      return;
    }

    const { balance } = await response.json();

    // Update wallet balance in database
    await supabase
      .from("wallets")
      .update({ balance })
      .eq("wallet_address", wallet.wallet_address)
      .eq("blockchain", "ARC");
  } catch (error) {
    console.error("Failed to update wallet balance:", error);
  }
}

// Process transaction once wallet is found
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
    .select("id, amount, circle_contract_address")
    .eq("circle_transaction_id", txHash)
    .eq("wallet_id", wallet.id)
    .single();

  if (existing) {
    // Update existing record with better data when available
    const updates: Record<string, any> = {};
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

// Handle webhook notification
async function handleWebhookNotification(
  notification:
    | TransfersNotification
    | ModularWalletNotification
    | UserOperationNotification,
  notificationType: NotificationType
): Promise<void> {
  const supabase = await createSupabaseServerClient();

  try {
    // Handle Circle transfers
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

      // Update balance for completed transactions
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

    // Handle modular wallet user operations
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

    // Handle modular wallet transfers (inbound/outbound)
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

      // The counterparty is who we sent to (outbound) or received from (inbound)
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

// Verify Circle's signature
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

// Get Circle's public key
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

// Main webhook handler
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

    const body = await req.json();
    const bodyString = JSON.stringify(body);

    const isVerified = await verifyCircleSignature(
      bodyString,
      signature,
      keyId
    );
    if (!isVerified) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
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

// Handle HEAD requests
export async function HEAD() {
  return NextResponse.json({}, { status: 200 });
}
