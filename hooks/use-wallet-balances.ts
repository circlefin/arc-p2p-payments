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

import { useState, useEffect, useCallback, useRef } from "react";
import { useWeb3 } from "@/components/web3-provider";
import { toast } from "sonner";
import axios from "axios";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser-client";

export function useWalletBalances() {
  const { account, isConnected, isInitialized } = useWeb3();
  // Create Supabase client once per hook instance
  const supabaseRef = useRef(createSupabaseBrowserClient());

  const [balance, setBalance] = useState({
    native: 0,
    token: 0,
    loading: true,
  });

  // Use refs to track if balances have been loaded and prevent infinite loops
  const balancesLoadedRef = useRef(false);
  const prevAddressRef = useRef<string | null>(null);
  const isRefreshingRef = useRef(false);
  const realtimeChannelRef = useRef<any>(null);

  interface BalanceResponse {
    balance: string;
  }

  // Fetch balance directly from Supabase
  const fetchBalanceFromDB = useCallback(
    async (address: string): Promise<string> => {
      if (!address) return "0";

      try {
        // Query the database directly
        const { data, error } = await supabaseRef.current
          .from("wallets")
          .select("balance")
          .eq("wallet_address", address.toLowerCase())
          .eq("blockchain", "ARC")
          .single();

        if (error) {
          console.error("Error fetching balance from DB:", error);
          return "0";
        }

        return data?.balance || "0";
      } catch (error) {
        console.error("Error fetching balance from DB:", error);
        return "0";
      }
    },
    [],
  );

  // Fetch balance from API
  const fetchBalanceFromAPI = useCallback(
    async (address: string): Promise<string> => {
      if (!address) return "0";

      try {
        const response = await axios.post<BalanceResponse>(
          "/api/wallet/balance",
          {
            walletId: address,
            blockchain: "arc",
          },
        );

        return response.data.balance || "0";
      } catch (error) {
        console.error("Error fetching balance from API:", error);
        return "0";
      }
    },
    [],
  );

  // Load initial balances from DB, then refresh from API
  const loadBalances = useCallback(async () => {
    if (!isConnected || isRefreshingRef.current) return;

    if (!account.address) {
      setBalance((prev) => ({ ...prev, loading: false }));
      return;
    }

    isRefreshingRef.current = true;

    // First set loading state
    setBalance((prev) => ({
      ...prev,
      loading: true,
    }));

    try {
      // STEP 1: Try to get balance from DB first (fast)
      const dbBalance = await fetchBalanceFromDB(account.address);

      // Update state with DB value immediately (faster UX)
      setBalance((prev) => ({
        native: prev.native,
        token: parseFloat(dbBalance) || 0,
        loading: true, // Keep loading while we fetch from API
      }));

      // STEP 2: Then fetch from API to ensure latest value (slower but accurate)
      const apiBalance = await fetchBalanceFromAPI(account.address);

      // Update state with API value and finish loading
      const finalBalance = parseFloat(apiBalance) || 0;
      prevBalanceRef.current = finalBalance;
      setBalance((prev) => ({
        native: prev.native,
        token: finalBalance || prev.token,
        loading: false,
      }));

      balancesLoadedRef.current = true;
    } catch (error) {
      console.error("Error refreshing balances:", error);
      toast.error("Failed to refresh balances");

      setBalance((prev) => ({ ...prev, loading: false }));
    } finally {
      isRefreshingRef.current = false;
    }
  }, [account, fetchBalanceFromDB, fetchBalanceFromAPI, isConnected]);

  // Helper to check if account has changed
  const hasAccountChanged = useCallback(() => {
    const prev = prevAddressRef.current;
    const current = account.address;

    prevAddressRef.current = current;

    return prev !== current;
  }, [account]);

  // Track previous balance for realtime toast dedup
  const prevBalanceRef = useRef<number | null>(null);

  // Handle realtime balance updates
  const updateWalletBalance = useCallback(
    (payload: any) => {
      const newBalance = Number(payload.new.balance);

      if (isNaN(newBalance)) {
        console.error(
          "Invalid balance update received:",
          payload.new.balance,
        );
        return;
      }

      const prevBalance = prevBalanceRef.current;
      if (prevBalance !== null && newBalance === prevBalance) {
        return;
      }

      prevBalanceRef.current = newBalance;
      toast.info(`Balance: ${newBalance} USDC`);

      setBalance((prev) => ({
        ...prev,
        token: newBalance,
      }));
    },
    [],
  );

  // Initialize balances when account changes or on first load
  useEffect(() => {
    if (!isInitialized) return;

    const accountChanged = hasAccountChanged();
    const isFirstLoad = !balancesLoadedRef.current;

    const freshInitialization =
      typeof window !== "undefined" &&
      localStorage.getItem("wallet_just_initialized");

    if (freshInitialization) {
      localStorage.removeItem("wallet_just_initialized");
      balancesLoadedRef.current = false;

      const timeoutId = setTimeout(() => {
        loadBalances();
      }, 1000);

      return () => clearTimeout(timeoutId);
    } else if (isFirstLoad || accountChanged) {
      loadBalances();
    }
  }, [isConnected, isInitialized, loadBalances, hasAccountChanged]);

  // Set up realtime subscription for wallet updates
  useEffect(() => {
    if (realtimeChannelRef.current) {
      supabaseRef.current.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }

    if (!account.address) return;

    const walletChannel = supabaseRef.current
      .channel("wallet-updates")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "wallets",
        },
        (payload) => {
          const address = payload.new.wallet_address.toLowerCase();
          const blockchain = payload.new.blockchain;

          if (
            blockchain === "ARC" &&
            address === account.address?.toLowerCase()
          ) {
            updateWalletBalance(payload);
          }
        },
      )
      .subscribe();

    realtimeChannelRef.current = walletChannel;

    return () => {
      if (realtimeChannelRef.current) {
        supabaseRef.current.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }
    };
  }, [account.address, updateWalletBalance]);

  return {
    balance,
    refreshBalances: loadBalances,
    isRefreshing: isRefreshingRef.current,
  };
}
