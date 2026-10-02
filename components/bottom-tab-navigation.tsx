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
import { createSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import millify from "millify";
import { useWeb3 } from "@/components/web3-provider";
import { usePathname, useRouter } from "next/navigation";
import { useBalance } from "@/contexts/balanceContext";
import { toast } from "sonner";

/** One nav pill: fixed-width column, icon over label, tinted when active. */
const triggerClass =
  "flex w-[100px] flex-col items-center gap-0.5 rounded-[40px] px-0 py-2 transition-colors duration-200 data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-none";

export default function BottomTabNavigation() {
  const supabase = createSupabaseBrowserClient();
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
    // Floating pill nav: the trigger classes restate the defaults so tailwind-merge drops the docked treatment.
    <div className="absolute inset-x-0 bottom-0 z-10 flex justify-center px-5 pt-3 pb-6">
      <TabsList className="flex h-auto items-center gap-2 rounded-full rounded-t-full bg-card/80 p-0 px-2 py-2 text-muted-foreground/50 shadow-[0_8px_24px_rgba(0,0,0,0.35)] ring-1 ring-border backdrop-blur-lg">
        <TabsTrigger
          onClick={handleTabChange}
          value="balance"
          className={triggerClass}
        >
          <span className="flex h-6 items-center text-lg leading-none tabular-nums">
            ${formattedWalletBalance}
          </span>
          <span className="text-xs font-medium tracking-tight">Balance</span>
        </TabsTrigger>
        <TabsTrigger value="wallet" className={triggerClass}>
          <Wallet className="size-6" />
          <span className="text-xs font-medium tracking-tight">Wallet</span>
        </TabsTrigger>
        <TabsTrigger value="transactions" className={triggerClass}>
          <History className="size-6" />
          <span className="text-xs font-medium tracking-tight">Activity</span>
        </TabsTrigger>
      </TabsList>
    </div>
  );
}
