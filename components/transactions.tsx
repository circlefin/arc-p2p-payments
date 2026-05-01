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

"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Wallet } from "@/types/database.types";
import { useEffect, useMemo, useState, type FunctionComponent } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { Badge } from "@/components/ui/badge";
import { arcTestnet } from "@/components/web3-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";

const ARC_CHAIN_ID = arcTestnet.id;

// Simple transaction format from API
interface SimpleTransaction {
  hash: string;
  from: string;
  to: string;
  toAddress?: string;
  fromAddress?: string;
  amount: string;
  timestamp: string;
  networkId: number;
  networkName: string;
  state: string;
  transactionType: string;
  id: string;
}

// Response type for the transfers API
interface TransfersResponse {
  transactions: SimpleTransaction[];
  pagination: {
    hasMore: boolean;
    pageAfter?: string;
    pageBefore?: string;
  };
  error?: string;
}

// Database transaction type
interface Transaction {
  id: string;
  status: string;
  created_at: string;
  circle_transaction_id: string;
  circle_contract_address: string;
  transaction_type: string;
  amount: string;
  network_id: number;
  network_name: string;
}

interface Props {
  wallet: Wallet;
  profile: {
    id: any;
  } | null;
}

async function syncTransactions(
  supabase: SupabaseClient,
  walletId: string,
  profileId: string,
  circleWalletId: string
) {
  try {
    // Fetch transactions from Arc
    const arcResponse = await fetch(
      `${baseUrl}/api/wallet/transactions`,
      {
        method: "POST",
        body: JSON.stringify({
          walletId: circleWalletId,
          networkId: ARC_CHAIN_ID,
          pageSize: 50
        }),
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    let arcTransactions: SimpleTransaction[] = [];

    if (arcResponse.ok) {
      const data: TransfersResponse = await arcResponse.json();
      arcTransactions = data.transactions || [];
    } else {
      console.error("Arc API response error:", await arcResponse.json());
    }

    // Deduplicate by hash (Circle may return multiple transfer records per on-chain tx)
    if (arcTransactions.length > 0) {
      const seenHashes = new Set<string>();
      const records = arcTransactions
        .filter((tx) => {
          if (seenHashes.has(tx.hash)) return false;
          seenHashes.add(tx.hash);
          return true;
        })
        .map((tx) => {
          const toAddress = tx.to || tx.toAddress || "";
          const fromAddress = tx.from || tx.fromAddress || "";
          const isReceived = toAddress && circleWalletId
            ? toAddress.toLowerCase() === circleWalletId.toLowerCase()
            : false;

          return {
            wallet_id: walletId,
            profile_id: profileId,
            circle_transaction_id: tx.hash,
            transaction_type: isReceived ? "USDC_TRANSFER_IN" : "USDC_TRANSFER_OUT",
            amount: parseFloat(tx.amount) || 0,
            currency: "USDC",
            status: tx.state || "COMPLETE",
            created_at: tx.timestamp,
            network_id: ARC_CHAIN_ID,
            network_name: "Arc Testnet",
            circle_contract_address: isReceived ? fromAddress : toAddress,
          };
        });

      const { data: existing } = await supabase
        .from("transactions")
        .select("circle_transaction_id")
        .eq("wallet_id", walletId);

      const existingIds = new Set(
        existing?.map((t: any) => t.circle_transaction_id) || []
      );

      const newRecords = records.filter(
        (r) => !existingIds.has(r.circle_transaction_id)
      );

      if (newRecords.length > 0) {
        const { error: insertError } = await supabase
          .from("transactions")
          .insert(newRecords);
        if (insertError) {
          console.error("Error inserting transactions:", insertError);
        }
      }
    }

    // Return all transactions from database
    const { data: allTransactions, error: fetchError } = await supabase
      .from("transactions")
      .select("*")
      .eq("wallet_id", walletId)
      .order("created_at", { ascending: false });

    if (fetchError) {
      console.error("Error fetching transactions:", fetchError);
      return [];
    }

    return allTransactions || [];
  } catch (error) {
    console.error("Error in syncTransactions:", error);
    return [];
  }
}

const baseUrl = process.env.NEXT_PUBLIC_VERCEL_URL
  ? process.env.NEXT_PUBLIC_VERCEL_URL
  : "http://localhost:3000";

const supabase = createSupabaseBrowserClient();

export const Transactions: FunctionComponent<Props> = (props) => {
  const router = useRouter();
  const [data, setData] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const formattedData = useMemo(
    () =>
      data.map((transaction) => ({
        ...transaction,
        created_at: new Date(transaction.created_at).toISOString(),
        formattedDate: "",
      })),
    [data]
  );

  const searchedData = useMemo(() => {
    if (!searchQuery) return formattedData;
    const query = searchQuery.toLowerCase();
    return formattedData.filter(tx =>
      tx.circle_transaction_id.toLowerCase().includes(query)
    );
  }, [formattedData, searchQuery]);

  // Group transactions by month
  const groupedTransactions = useMemo(() => {
    const groups: Record<string, typeof formattedData> = {};
    const now = new Date();

    searchedData.forEach((transaction) => {
      const date = new Date(transaction.created_at);

      let monthKey: string;
      if (date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()) {
        monthKey = "This month";
      } else {
        monthKey = date.toLocaleString('default', { month: 'long', year: 'numeric' });
      }

      const diffTime = Math.abs(now.getTime() - date.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      transaction.formattedDate = diffDays <= 7
        ? date.toLocaleDateString('en-US', { weekday: 'long' })
        : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      if (!groups[monthKey]) groups[monthKey] = [];
      groups[monthKey]!.push(transaction);
    });

    const sortedKeys = Object.keys(groups).sort((a, b) => {
      const dateA = a === "This month" ? now : new Date(a);
      const dateB = b === "This month" ? now : new Date(b);
      return dateB.getTime() - dateA.getTime();
    });

    const sortedGroups: Record<string, typeof formattedData> = {};
    sortedKeys.forEach(key => sortedGroups[key] = groups[key]!);
    return sortedGroups;
  }, [searchedData]);

  // Transaction type display mapping
  const getTransactionTypeDisplay = (type: string) => {
    if (type === "USDC_TRANSFER_IN" || type === "received") {
      return "Payment received"
    }

    if (type === "USDC_TRANSFER_OUT" || type === "sent") {
      return "Payment sent"
    }

    return type
  };

  const updateTransactions = async () => {
    try {
      setLoading(true);
      setRefreshing(true);
      setError(null);

      if (!props.wallet?.id || !props.profile?.id || !props.wallet?.circle_wallet_id) {
        setError("Missing wallet or profile information");
        return;
      }

      const transactions = await syncTransactions(
        supabase,
        props.wallet.id,
        props.profile.id,
        props.wallet.circle_wallet_id
      );

      setData(transactions);
    } catch (error) {
      console.error("Failed to fetch transactions:", error);
      setError(error instanceof Error ? error.message : "Unknown error occurred");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!props.wallet?.id || !props.profile?.id) {
      return;
    }

    const transactionSubscription = supabase
      .channel("transactions")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "transactions",
          filter: `profile_id=eq.${props.profile?.id}`,
        },
        () => updateTransactions()
      )
      .subscribe();

    updateTransactions();

    return () => {
      supabase.removeChannel(transactionSubscription);
    };
  }, [props.wallet?.id, props.profile?.id, props.wallet?.circle_wallet_id]);

  if (loading) {
    return <Skeleton className="w-full h-[30px] rounded-md" />;
  }

  if (error) {
    return (
      <div className="p-4 border border-red-300 bg-red-50 rounded-md text-red-800">
        <p>Error loading transactions: {error}</p>
        <button
          onClick={updateTransactions}
          className="mt-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <>
        <div className="flex flex-col justify-between mb-4">
          <Input
            placeholder="Search transactions..."
            className="w-full mb-2"
            value={searchQuery}
            onChange={event => setSearchQuery(event.target.value)}
          />
        </div>
        <p className="text-xl text-muted-foreground">
          No transactions found
        </p>
      </>
    );
  }

  return (
    <>
      <Input
        placeholder="Search transactions..."
        className="w-full mb-2"
        value={searchQuery}
        onChange={event => setSearchQuery(event.target.value)}
      />

      <div className="space-y-8">
        {Object.entries(groupedTransactions).map(([month, transactions]) => (
          <div key={month}>
            <h2 className="text-xl font-bold mb-2">{month}</h2>
            <div className="space-y-4">
              {transactions.map((transaction) => {
                // Arc goes PENDING → COMPLETE directly, no CONFIRMED state
                const statusClass = transaction.status === "COMPLETE"
                  ? "bg-green-100 text-green-800"
                  : transaction.status === "PENDING"
                    ? "bg-yellow-100 text-yellow-800"
                    : transaction.status === "FAILED"
                      ? "bg-red-100 text-red-800"
                      : "bg-gray-100 text-gray-800";

                return (
                  <div
                    key={transaction.id}
                    className="p-4 pl-0 hover:bg-gray-50 dark:hover:bg-white/5"
                    onClick={() => router.push(
                      `/dashboard/transaction/${transaction.circle_transaction_id}`
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1">
                        <div className="flex items-center">
                          <span className="font-medium">
                            {transaction.circle_transaction_id ?
                              `${transaction.circle_transaction_id.slice(0, 6)}...${transaction.circle_transaction_id.slice(-4)}` :
                              'Unknown address'}
                          </span>
                          <Badge className={`ml-2 ${statusClass}`}>
                            {transaction.status}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          {getTransactionTypeDisplay(transaction.transaction_type)}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {transaction.formattedDate}
                        </div>
                      </div>
                      <div className="ml-auto font-medium">
                        {(transaction.transaction_type === 'USDC_TRANSFER_IN' ||
                          transaction.transaction_type === 'received') ? '+' : '-'}
                        {parseFloat(transaction.amount).toFixed(2)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  );
};
