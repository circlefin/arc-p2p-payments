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
import { type MouseEventHandler, useEffect, useMemo, useState } from "react";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User } from "@supabase/supabase-js";
import { History, Wallet } from "lucide-react";
import { createClient } from "@/lib/utils/supabase/client";
import millify from "millify";
import { useWeb3 } from "@/components/web3-provider";
import { usePathname, useRouter } from "next/navigation";
import { useBalance } from "@/contexts/balanceContext";
import { toast } from "sonner";

export default function BottomTabNavigation() {
  const supabase = createClient();
  const [user, setUser] = useState<User | null>();
  const { account } = useWeb3();
  const { balance: web3Balance, refreshBalances, isRefreshing } = useBalance();
  const router = useRouter();
  const pathname = usePathname();

  const handleTabChange: MouseEventHandler<HTMLButtonElement> = (event) => {
    const transactionDetailsRouteRegex =
      /^\/dashboard\/transaction\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    const isOnTransactionDetailsRoute =
      transactionDetailsRouteRegex.test(pathname);
    if (!isOnTransactionDetailsRoute) return;
    router.push("/dashboard");
  };

  // Simplified balance loading effect
  useEffect(() => {
    const loadInitialBalances = async () => {
      if (account.address && !isRefreshing) {
        try {
          await refreshBalances();
        } catch (error) {
          toast.error("Failed to refresh balances");
        }
      }
    };

    loadInitialBalances();
  }, [account.address]);

  const preciseMillify = (number: number, options?: { precision: number }) => {
    const result = millify(number, {
      ...options,
    });

    const [numberPart, unit] = result.split(/([a-zA-Z]+)/);
    const [intPart, decimalPart = ''] = numberPart.split('.');

    const hasDecimal = numberPart.includes('.');

    if (hasDecimal) {
      const desiredPrecision = options?.precision || 0;
      const paddedDecimal = decimalPart.padEnd(desiredPrecision, '0');
      const formattedNumber = `${intPart}.${paddedDecimal}`;
      return unit ? `${formattedNumber}${unit}` : formattedNumber;
    }

    return result;
  }

  // Memoized balance formatting
  const formattedWalletBalance = useMemo(() => {
    const chainBalance = web3Balance?.token || 0;

    if (isNaN(chainBalance)) return "0";

    try {
      return preciseMillify(chainBalance, { precision: 2 });
    } catch (error) {
      console.error("Error formatting balance:", error);
      return "0";
    }
  }, [web3Balance]);

  const getUser = async () => {
    const {
      data: { user: loggedUser },
    } = await supabase.auth.getUser();
    setUser(loggedUser);
  };

  useEffect(() => {
    if (user?.user_metadata.wallet_setup_complete) return;
    getUser();
  }, [user]);

  if (!user?.user_metadata.wallet_setup_complete) return null;

  return (
    <TabsList className="absolute bottom-0 left-0 grid w-full grid-cols-3 h-auto p-2">
      <TabsTrigger onClick={handleTabChange} value="balance">
        <p className="text-lg">${formattedWalletBalance}</p>
      </TabsTrigger>
      <TabsTrigger value="wallet">
        <Wallet />
      </TabsTrigger>
      <TabsTrigger value="transactions">
        <History />
      </TabsTrigger>
    </TabsList>
  );
}
