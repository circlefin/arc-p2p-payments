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

import axios from "axios";

/**
 * USDC balance of an Arc wallet, as a decimal string ("0" if it holds none).
 * Throws when Circle cannot be reached, so callers can decide how to degrade.
 */
export async function getUsdcBalanceByAddress(address: string): Promise<string> {
  const response = await axios.get(
    `https://api.circle.com/v1/w3s/buidl/wallets/ARC-TESTNET/${address}/balances`,
    {
      headers: {
        "X-Request-Id": crypto.randomUUID(),
        Authorization: `Bearer ${process.env.CIRCLE_API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );

  return (
    response.data?.data?.tokenBalances?.find(
      (balance: { token?: { symbol?: string } }) => balance.token?.symbol === "USDC"
    )?.amount || "0"
  );
}
