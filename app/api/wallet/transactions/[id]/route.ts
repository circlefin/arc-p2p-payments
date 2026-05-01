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

import { type NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";

const ARC_BLOCKCHAIN = "ARC-TESTNET";
const ARC_NETWORK_NAME = "Arc Testnet";
const ARC_CHAIN_ID = 5042002;

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await props.params;
    const networkId = ARC_CHAIN_ID;

    // Initialize Supabase client
    const supabase = await createSupabaseServerClient();

    // First check if we have this transaction in our local database
    let localTransaction = null;

    if (id.startsWith("0x")) {
      const { data: txByHash, error: txByHashError } = await supabase
        .from("transactions")
        .select(
          `
          id,
          wallet_id,
          profile_id,
          transaction_type,
          amount,
          currency,
          status,
          circle_transaction_id,
          created_at,
          description,
          circle_contract_address,
          network_id,
          network_name,
          wallets (wallet_address),
          profiles (*)
        `
        )
        .eq("circle_transaction_id", id)
        .single();

      if (txByHashError && txByHashError.code !== "PGRST116") {
        console.error(
          "Database error when searching by txHash:",
          txByHashError
        );
      } else if (txByHash) {
        localTransaction = txByHash;
      }
    } else {
      try {
        const { data: txByUuid, error: txByUuidError } = await supabase
          .from("transactions")
          .select(
            `
            id,
            wallet_id,
            profile_id,
            transaction_type,
            amount,
            currency,
            status,
            circle_transaction_id,
            created_at,
            description,
            circle_contract_address,
            network_id,
            network_name,
            wallets (wallet_address),
            profiles (*)
          `
          )
          .eq("id", id)
          .single();

        if (txByUuidError && txByUuidError.code !== "PGRST116") {
          console.error(
            "Database error when searching by UUID:",
            txByUuidError
          );
        } else if (txByUuid) {
          localTransaction = txByUuid;
        }
      } catch (e) {
        console.error("Error parsing UUID:", e);
      }
    }

    // If we found the transaction in our database, return it
    if (localTransaction) {
      const transaction = {
        id: localTransaction.id,
        amounts: [localTransaction.amount?.toString() || "0"],
        state: (localTransaction.status || "unknown").toLowerCase(),
        createDate: localTransaction.created_at || new Date().toISOString(),
        blockchain: ARC_BLOCKCHAIN,
        transactionType: (
          localTransaction.transaction_type || "transfer"
        ).toLowerCase(),
        updateDate: localTransaction.created_at || new Date().toISOString(),
        description:
          localTransaction.description ||
          `${localTransaction.transaction_type || "Transfer"} on ${ARC_NETWORK_NAME}`,
        networkId: networkId,
        networkName: ARC_NETWORK_NAME,
        from: localTransaction.wallets?.[0]?.wallet_address || "Unknown",
        to: "Unknown",
        gasUsed: "N/A",
        gasPrice: "N/A",
        txHash: localTransaction.circle_transaction_id || "",
        walletId: localTransaction.wallet_id || "",
        walletAddress: localTransaction.wallets?.[0]?.wallet_address || "",
        tokenAddress: localTransaction.circle_contract_address || "",
      };

      return NextResponse.json({ transaction });
    }

    // If not found in database, proceed with Circle API calls
    const transferUrl = `https://api.circle.com/v1/w3s/buidl/transfers/${id}`;
    const transferResponse = await fetch(transferUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${process.env.CIRCLE_API_KEY}`,
      },
    });

    if (transferResponse.ok) {
      const transferData = await transferResponse.json();

      if (transferData.data && transferData.data.transfer) {
        const transfer = transferData.data.transfer;
        const transaction = {
          id: transfer.id,
          amounts: [transfer.amount || "0"],
          state: (transfer.state || "unknown").toLowerCase(),
          createDate: transfer.createDate || new Date().toISOString(),
          blockchain: transfer.blockchain || ARC_BLOCKCHAIN,
          transactionType: (transfer.transferType || "transfer").toLowerCase(),
          updateDate: transfer.updateDate || new Date().toISOString(),
          description: `${transfer.transferType || "Transfer"} on ${ARC_NETWORK_NAME}`,
          networkId: networkId,
          networkName: ARC_NETWORK_NAME,
          from: transfer.from || "Unknown",
          to: transfer.to || "Unknown",
          gasUsed: "N/A",
          gasPrice: "N/A",
          txHash: transfer.txHash || "",
          walletId: transfer.walletId || "",
          walletAddress: transfer.walletAddress || "",
          tokenAddress: transfer.tokenAddress || "",
        };

        // Try to store this transaction data in our database
        try {
          const { data: wallet } = await supabase
            .from("wallets")
            .select("id, profile_id")
            .eq("wallet_address", transfer.walletAddress || transfer.from)
            .maybeSingle();

          if (wallet) {
            const { error: insertError } = await supabase
              .from("transactions")
              .insert({
                id: transfer.id,
                wallet_id: wallet.id,
                profile_id: wallet.profile_id,
                transaction_type: transfer.transferType || "transfer",
                amount: parseFloat(transfer.amount || "0"),
                currency: "USDC",
                status: transfer.state || "unknown",
                circle_transaction_id: transfer.txHash || transfer.id,
                description: `${transfer.transferType || "Transfer"} on ${ARC_NETWORK_NAME}`,
                circle_contract_address: transfer.tokenAddress || "",
                network_id: networkId,
                network_name: ARC_NETWORK_NAME,
              });

            if (insertError) {
              console.warn(
                "Error inserting transaction to database:",
                insertError
              );
            }
          }
        } catch (dbError) {
          console.warn("Database error while storing transaction:", dbError);
        }

        return NextResponse.json({ transaction });
      }
    }

    // If not found by direct ID, try searching by txHash
    const txHashRegex = /^0x[a-fA-F0-9]{64}$/;
    const isTransactionHash = txHashRegex.test(id);

    if (isTransactionHash) {
      const transferByHashUrl = `https://api.circle.com/v1/w3s/buidl/transfers?txHash=${id}`;
      const transferByHashResponse = await fetch(transferByHashUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${process.env.CIRCLE_API_KEY}`,
        },
      });

      if (transferByHashResponse.ok) {
        const transfersData = await transferByHashResponse.json();

        if (
          transfersData.data &&
          transfersData.data.transfers &&
          transfersData.data.transfers.length > 0
        ) {
          const transfer = transfersData.data.transfers[0];
          const transaction = {
            id: transfer.id,
            amounts: [transfer.amount || "0"],
            state: (transfer.state || "unknown").toLowerCase(),
            createDate: transfer.createDate || new Date().toISOString(),
            blockchain: transfer.blockchain || ARC_BLOCKCHAIN,
            transactionType: (
              transfer.transferType || "transfer"
            ).toLowerCase(),
            updateDate: transfer.updateDate || new Date().toISOString(),
            description: `${transfer.transferType || "Transfer"} on ${ARC_NETWORK_NAME}`,
            networkId: networkId,
            networkName: ARC_NETWORK_NAME,
            from: transfer.from || transfer.fromAddress || "Unknown",
            to: transfer.to || transfer.toAddress || "Unknown",
            gasUsed: "N/A",
            gasPrice: "N/A",
            txHash: transfer.txHash || "",
            walletId: transfer.walletId || "",
            walletAddress: transfer.walletAddress || "",
            tokenAddress: transfer.tokenAddress || "",
          };

          try {
            const { data: wallet } = await supabase
              .from("wallets")
              .select("id, profile_id")
              .eq(
                "wallet_address",
                transfer.walletAddress || transfer.from || transfer.fromAddress
              )
              .maybeSingle();

            if (wallet) {
              const { error: insertError } = await supabase
                .from("transactions")
                .insert({
                  id: transfer.id,
                  wallet_id: wallet.id,
                  profile_id: wallet.profile_id,
                  transaction_type: transfer.transferType || "transfer",
                  amount: parseFloat(transfer.amount || "0"),
                  currency: "USDC",
                  status: transfer.state || "unknown",
                  circle_transaction_id: transfer.txHash || transfer.id,
                  description: `${transfer.transferType || "Transfer"} on ${ARC_NETWORK_NAME}`,
                  circle_contract_address: transfer.tokenAddress || "",
                  network_id: networkId,
                  network_name: ARC_NETWORK_NAME,
                });

              if (insertError) {
                console.warn(
                  "Error inserting transaction to database:",
                  insertError
                );
              }
            }
          } catch (dbError) {
            console.warn("Database error while storing transaction:", dbError);
          }

          return NextResponse.json({ transaction });
        }
      }

      // If not found, try transaction-receipt API as last resort
      const receiptUrl = `https://api.circle.com/v1/w3s/buidl/transactions/${ARC_BLOCKCHAIN}/${id}/receipt`;

      const receiptResponse = await fetch(receiptUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${process.env.CIRCLE_API_KEY}`,
        },
      });

      if (receiptResponse.ok) {
        const receiptData = await receiptResponse.json();

        if (receiptData.data) {
          const receipt = receiptData.data;
          const transaction = {
            id: receipt.transactionHash || id,
            amounts: ["0"],
            state: receipt.status === "0x1" ? "complete" : "failed",
            createDate: new Date().toISOString(),
            blockchain: ARC_BLOCKCHAIN,
            transactionType: "contract_interaction",
            updateDate: new Date().toISOString(),
            description: `Transaction on ${ARC_NETWORK_NAME}`,
            networkId: networkId,
            networkName: ARC_NETWORK_NAME,
            from: receipt.from || "Unknown",
            to: receipt.to || "Unknown",
            gasUsed: receipt.gasUsed || "N/A",
            gasPrice: receipt.effectiveGasPrice || "N/A",
            txHash: receipt.transactionHash || id,
          };

          try {
            const { data: wallet } = await supabase
              .from("wallets")
              .select("id, profile_id")
              .eq("wallet_address", receipt.from)
              .maybeSingle();

            if (wallet) {
              const { error: insertError } = await supabase
                .from("transactions")
                .insert({
                  id: receipt.transactionHash || id,
                  wallet_id: wallet.id,
                  profile_id: wallet.profile_id,
                  transaction_type: "contract_interaction",
                  amount: 0,
                  currency: "UNKNOWN",
                  status: receipt.status === "0x1" ? "COMPLETE" : "FAILED",
                  circle_transaction_id: receipt.transactionHash || id,
                  description: `Transaction on ${ARC_NETWORK_NAME}`,
                  network_id: networkId,
                  network_name: ARC_NETWORK_NAME,
                });

              if (insertError) {
                console.warn(
                  "Error inserting minimal transaction to database:",
                  insertError
                );
              }
            }
          } catch (dbError) {
            console.warn(
              "Database error while storing minimal transaction:",
              dbError
            );
          }

          return NextResponse.json({ transaction });
        }
      }
    }

    return NextResponse.json(
      { error: "Transaction not found" },
      { status: 404 }
    );
  } catch (error) {
    console.error("Error fetching transaction:", error);

    if (error instanceof Error) {
      console.error("API Error in transaction fetch:", error.message);

      let userError = "Network request failed";

      if (error.message.includes("timeout")) {
        userError = "Request timed out. The service may be congested.";
      } else if (error.message.includes("not found")) {
        return NextResponse.json(
          { error: "Transaction not found" },
          { status: 404 }
        );
      }

      return NextResponse.json({ error: userError }, { status: 503 });
    }

    return NextResponse.json(
      { error: "Internal server error while fetching transaction" },
      { status: 500 }
    );
  }
}
