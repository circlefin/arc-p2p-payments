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

// Define the shape of our balance context
interface BalanceContextType {
  balance: {
    native: number;
    token: number;
    loading: boolean;
  };
  isRefreshing: boolean;
  refreshBalances: () => Promise<void>;
}

// Create the context with a default value
const BalanceContext = createContext<BalanceContextType | undefined>(undefined);

// Custom hook for using the balance context
export function useBalance() {
  const context = useContext(BalanceContext);
  if (context === undefined) {
    throw new Error("useBalance must be used within a BalanceProvider");
  }
  return context;
}

// Balance Provider component
export function BalanceProvider({ children }: { children: ReactNode }) {
  // Use the existing hook
  const { balance, isRefreshing, refreshBalances } = useWalletBalances();

  // Create the value object once
  const value = {
    balance,
    isRefreshing,
    refreshBalances,
  };

  // Provide the balance context to all children
  return (
    <BalanceContext.Provider value={value}>
      {children}
    </BalanceContext.Provider>
  );
}
