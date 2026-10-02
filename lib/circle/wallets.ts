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

import { circleDeveloperSdk } from "@/lib/utils/developer-controlled-wallets-client";

// The network the rest of the app is pinned to.
const BLOCKCHAIN = "ARC-TESTNET";

// What goes in the database. Circle reports "ARC-TESTNET", but every read in this
// app filters on .eq("blockchain", "ARC"), so the stored value is normalised here.
export const STORED_BLOCKCHAIN = "ARC";

export interface CreatedWallet {
  id: string;
  address: string;
  custodyType?: string;
  accountType?: string;
  walletSetId: string;
}

/**
 * Creates a wallet set and one SCA wallet in it. Server-side only. The auth callback
 * calls this directly; there is deliberately no HTTP route for it, since an open one
 * lets anyone mint wallets on the app's Circle account.
 */
export async function createWalletSetWithWallet(name: string): Promise<CreatedWallet> {
  const walletSetResponse = await circleDeveloperSdk.createWalletSet({ name });
  const walletSet = walletSetResponse.data?.walletSet;
  if (!walletSet) throw new Error("Circle did not return a wallet set");

  const walletsResponse = await circleDeveloperSdk.createWallets({
    walletSetId: walletSet.id,
    blockchains: [BLOCKCHAIN],
    accountType: "SCA",
    count: 1,
  });
  const wallet = walletsResponse.data?.wallets?.[0];
  if (!wallet) throw new Error("Circle did not return a wallet");

  return {
    id: wallet.id,
    address: wallet.address,
    custodyType: wallet.custodyType,
    accountType: wallet.accountType,
    walletSetId: walletSet.id,
  };
}
