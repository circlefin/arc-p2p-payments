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

import React, { createContext, useContext, ReactNode } from "react";
import { useWalletBalances } from "@/hooks/use-wallet-balances";

interface BalanceContextType {
  balance: {
    native: number;
    token: number;
    loading: boolean;
  };
  isRefreshing: boolean;
  refreshBalances: () => Promise<void>;
}

const BalanceContext = createContext<BalanceContextType | undefined>(undefined);

export function useBalance() {
  const context = useContext(BalanceContext);
  if (context === undefined) {
    throw new Error("useBalance must be used within a BalanceProvider");
  }
  return context;
}

export function BalanceProvider({ children }: { children: ReactNode }) {
  const { balance, isRefreshing, refreshBalances } = useWalletBalances();

  const value = {
    balance,
    isRefreshing,
    refreshBalances,
  };

  return (
    <BalanceContext.Provider value={value}>
      {children}
    </BalanceContext.Provider>
  );
}
