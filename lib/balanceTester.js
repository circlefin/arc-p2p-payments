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

import { useState } from "react";
import { useWeb3 } from "@/components/web3-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser-client";

export function SimpleBalanceTester() {
  const { accounts, isConnected } = useWeb3();
  const [isUpdating, setIsUpdating] = useState(false);
  const [seconds, setSeconds] = useState(5);
  const [message, setMessage] = useState("");

  // Start updating balances with random values
  const startUpdates = async () => {
    if (!isConnected) {
      setMessage("Please connect your wallet first");
      return;
    }

    if (!accounts.polygon.address && !accounts.base.address) {
      setMessage("No wallet addresses found");
      return;
    }

    setIsUpdating(true);
    setMessage("Starting random balance updates...");

    // Create Supabase client
    const supabase = createSupabaseBrowserClient();

    // Function to update a single wallet
    const updateWallet = async (address, chain) => {
      try {
        // Generate random balance between 1-1000
        const newBalance = (Math.random() * 999 + 1).toFixed(2);

        // First check if wallet exists
        const { data: existingWallet, error: fetchError } = await supabase
          .from("wallets")
          .select("*")
          .eq("wallet_address", address.toLowerCase())
          .eq("blockchain", chain.toUpperCase())
          .maybeSingle();

        if (fetchError) {
          console.error(
            `Error checking if ${chain} wallet exists:`,
            fetchError
          );
          return false;
        }

        let updateResult;

        // If wallet exists, update it
        if (existingWallet) {
          updateResult = await supabase
            .from("wallets")
            .update({ balance: newBalance })
            .eq("wallet_address", address.toLowerCase())
            .eq("blockchain", chain.toUpperCase());
        } else {
          // Otherwise insert a new record
          updateResult = await supabase.from("wallets").insert({
            wallet_address: address.toLowerCase(),
            blockchain: chain.toUpperCase(),
            balance: newBalance,
          });
        }

        if (updateResult.error) {
          console.error(`Error updating ${chain} wallet:`, updateResult.error);
          return false;
        }

        setMessage(`Updated ${chain} wallet balance to ${newBalance}`);
        return true;
      } catch (e) {
        console.error(`Failed to update ${chain} wallet:`, e);
        return false;
      }
    };

    // Set interval for updates
    const intervalId = setInterval(async () => {
      // Update both chains if connected
      if (accounts.polygon.address) {
        await updateWallet(accounts.polygon.address, "polygon");
      }

      if (accounts.base.address) {
        // Add slight delay between updates
        setTimeout(async () => {
          await updateWallet(accounts.base.address, "base");
        }, 500);
      }
    }, seconds * 1000);

    // Store interval ID to be able to stop it later
    window.balanceUpdateInterval = intervalId;
  };

  // Stop updates
  const stopUpdates = () => {
    if (window.balanceUpdateInterval) {
      clearInterval(window.balanceUpdateInterval);
      window.balanceUpdateInterval = null;
      setIsUpdating(false);
      setMessage("Stopped balance updates");
    }
  };

  return (
    <div className="p-4 border rounded-lg bg-gray-50">
      <h2 className="text-lg font-semibold mb-3">Simple Balance Tester</h2>

      <div className="mb-3">
        <label className="block text-sm mb-1">
          Update interval (seconds):
          <input
            type="number"
            value={seconds}
            onChange={(e) =>
              setSeconds(Math.max(1, parseInt(e.target.value, 10)))
            }
            min="1"
            className="ml-2 p-1 border rounded w-16"
            disabled={isUpdating}
          />
        </label>
      </div>

      <div className="flex gap-2 mb-3">
        {!isUpdating ? (
          <button
            onClick={startUpdates}
            className="px-3 py-1 bg-green-500 text-white rounded"
            disabled={!isConnected}
          >
            Start Random Updates
          </button>
        ) : (
          <button
            onClick={stopUpdates}
            className="px-3 py-1 bg-red-500 text-white rounded"
          >
            Stop Updates
          </button>
        )}
      </div>

      {message && (
        <div className="mt-2 p-2 bg-gray-100 rounded text-sm">{message}</div>
      )}

      <div className="mt-3 text-sm">
        <p className="font-medium">Connected wallets:</p>
        <p>Polygon: {accounts.polygon.address || "Not connected"}</p>
        <p>Base: {accounts.base.address || "Not connected"}</p>
      </div>
    </div>
  );
}
