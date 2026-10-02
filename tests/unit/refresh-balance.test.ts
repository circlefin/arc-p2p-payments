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

import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryBuilder, queueTables } from "../helpers/supabase-mock";

const admin = vi.hoisted(() => ({ from: vi.fn() }));
const axiosGet = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/admin-client", () => ({ createSupabaseAdminClient: () => admin }));
vi.mock("axios", () => ({ default: { get: axiosGet } }));

import { getUsdcBalanceByAddress } from "@/lib/circle/balance";
import { refreshWalletBalance } from "@/lib/wallets/refresh-balance";

const wallet = { id: "w-1", wallet_address: "0x" + "a1".repeat(20) };

beforeEach(() => {
  admin.from.mockReset();
  axiosGet.mockReset();
});

describe("getUsdcBalanceByAddress", () => {
  it("returns the USDC amount, ignoring other tokens", async () => {
    axiosGet.mockResolvedValue({
      data: { data: { tokenBalances: [
        { token: { symbol: "EURC" }, amount: "9" },
        { token: { symbol: "USDC" }, amount: "12.5" },
      ] } },
    });
    expect(await getUsdcBalanceByAddress(wallet.wallet_address)).toBe("12.5");
    expect(String(axiosGet.mock.calls[0][0])).toContain(`/ARC-TESTNET/${wallet.wallet_address}/balances`);
  });

  it("reports 0 for a wallet with no USDC", async () => {
    axiosGet.mockResolvedValue({ data: { data: { tokenBalances: [] } } });
    expect(await getUsdcBalanceByAddress(wallet.wallet_address)).toBe("0");
  });
});

describe("refreshWalletBalance", () => {
  it("caches the balance through the secret-key client", async () => {
    axiosGet.mockResolvedValue({ data: { data: { tokenBalances: [{ token: { symbol: "USDC" }, amount: "3" }] } } });
    const update = queryBuilder({});
    queueTables(admin, { wallets: [update] });

    expect(await refreshWalletBalance(wallet)).toBe("3");
    expect(update.update).toHaveBeenCalledWith({ balance: "3" });
    expect(update.eq).toHaveBeenCalledWith("id", "w-1");
  });

  it("still returns the balance if caching fails", async () => {
    axiosGet.mockResolvedValue({ data: { data: { tokenBalances: [{ token: { symbol: "USDC" }, amount: "3" }] } } });
    queueTables(admin, { wallets: [queryBuilder({ error: { message: "db down" } })] });
    expect(await refreshWalletBalance(wallet)).toBe("3");
  });

  it("propagates a Circle failure so callers can decide how to degrade", async () => {
    axiosGet.mockRejectedValue(new Error("circle down"));
    await expect(refreshWalletBalance(wallet)).rejects.toThrow("circle down");
    expect(admin.from).not.toHaveBeenCalled();
  });
});
