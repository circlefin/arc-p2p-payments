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

import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { getUsdcBalanceByAddress } from "@/lib/circle/balance";

/**
 * Reads a wallet's USDC balance from Circle and caches it on its `wallets` row.
 * `balance` is not writable by users (only this server code, with the secret key),
 * so the cached figure cannot be set by the wallet's owner.
 *
 * Throws if Circle cannot be reached; callers decide how to degrade.
 */
export async function refreshWalletBalance(wallet: {
  id: string;
  wallet_address: string;
}): Promise<string> {
  const balance = await getUsdcBalanceByAddress(wallet.wallet_address);

  const { error } = await createSupabaseAdminClient()
    .from("wallets")
    .update({ balance })
    .eq("id", wallet.id);

  if (error) {
    console.error(`Could not cache the balance of wallet ${wallet.id}:`, error);
  }
  return balance;
}
