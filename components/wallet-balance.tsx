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

import { useCallback } from "react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useBalance } from "@/contexts/balanceContext";

const CIRCLE_FAUCET_URL = "https://faucet.circle.com/";

export function WalletBalance() {
  const { balance, isRefreshing, refreshBalances } = useBalance();

  const handleRefreshBalances = useCallback(async () => {
    try {
      await refreshBalances();
      toast.success("Balance refreshed");
    } catch (error) {
      console.error("Error refreshing balance:", error);
      toast.error("Failed to refresh balance");
    }
  }, [refreshBalances]);

  const formatBalance = (value: number, loading: boolean): React.ReactNode => {
    if (loading) {
      return <Skeleton className="h-8 w-24" />;
    }

    const formattedBalance = (isNaN(value) || value === 0) ? "0" : value.toFixed(2);

    return `${formattedBalance} USDC`;
  };

  return (
    <>
      <div className="w-full">
        <div className="mt-4">
          <div className="text-3xl font-bold">
            {formatBalance(balance.token, balance.loading)}
          </div>
        </div>
      </div>

      <button
        onClick={handleRefreshBalances}
        disabled={isRefreshing}
        className={`text-sm ${isRefreshing ? 'text-gray-400' : 'text-blue-500 hover:text-blue-700'} flex items-center gap-1`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={isRefreshing ? 'animate-spin' : ''}
        >
          <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
          <path d="M21 3v5h-5" />
          <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
          <path d="M8 16H3v5" />
        </svg>
        {isRefreshing ? 'Refreshing...' : 'Refresh Balance'}
      </button>
      <Button
        className="flex-1 py-3 text-lg font-semibold rounded-full"
        asChild
      >
        <a href={CIRCLE_FAUCET_URL} target="_blank" rel="noopener noreferrer">
          Fund Wallet
        </a>
      </Button>
    </>
  );
}
