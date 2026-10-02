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
import { NextRequest } from "next/server";
import { queryBuilder } from "../helpers/supabase-mock";
import { ALICE, BOB, signedInAs, signedOut } from "../helpers/scenario";

const user = vi.hoisted(() => ({ from: vi.fn(), auth: { getUser: vi.fn() } }));
const admin = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabase/server-client", () => ({ createSupabaseServerClient: async () => user }));
vi.mock("@/lib/supabase/admin-client", () => ({ createSupabaseAdminClient: () => admin }));

import { GET } from "@/app/api/wallet/transactions/[id]/route";

const HASH = "0x" + "ab".repeat(32);
const UUID = "0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e";

const get = (id: string) =>
  GET(new NextRequest(`http://localhost/api/wallet/transactions/${id}`), {
    params: Promise.resolve({ id }),
  });

const localRow = {
  id: UUID, wallet_id: ALICE.id, profile_id: ALICE.profile_id, transaction_type: "USDC_TRANSFER_OUT",
  amount: 5, currency: "USDC", status: "COMPLETE", circle_transaction_id: HASH,
  created_at: "2026-09-18T00:00:00Z", description: "Sent",
  circle_contract_address: null, network_id: 5042002, network_name: "Arc Testnet",
  wallets: [{ wallet_address: ALICE.wallet_address }],
};

const circleTransfer = (over: Record<string, unknown> = {}) => ({
  id: "t-9", amount: "7", state: "COMPLETE", createDate: "2026-09-18", transferType: "OUTBOUND",
  txHash: HASH, from: ALICE.wallet_address, to: BOB.wallet_address, ...over,
});

const circleReturns = (body: unknown, ok = true) =>
  vi.mocked(fetch).mockResolvedValueOnce({ ok, json: async () => body } as Response);

beforeEach(() => {
  user.from.mockReset();
  user.auth.getUser.mockReset();
  admin.from.mockReset();
  vi.stubGlobal("fetch", vi.fn());
});

describe("GET /api/wallet/transactions/[id]", () => {
  it("refuses a signed-out caller before reading anything (it used the secret key)", async () => {
    signedOut(user);
    expect((await get(HASH)).status).toBe(401);
    expect(admin.from).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("never touches the secret-key client", async () => {
    signedInAs(user, ALICE, { transactions: [queryBuilder({ data: localRow })] });
    await get(HASH);
    expect(admin.from).not.toHaveBeenCalled();
  });

  it("refuses a caller who has no wallet", async () => {
    signedInAs(user, null);
    expect((await get(HASH)).status).toBe(403);
  });

  it("returns the caller's own stored transaction, scoped to their profile", async () => {
    const lookup = queryBuilder({ data: localRow });
    signedInAs(user, ALICE, { transactions: [lookup] });

    const res = await get(HASH);

    expect(res.status).toBe(200);
    expect((await res.json()).transaction).toMatchObject({ walletAddress: ALICE.wallet_address, state: "complete" });
    expect(lookup.eq).toHaveBeenCalledWith("profile_id", ALICE.profile_id);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not join the owner's profile into the query (email, name, company)", async () => {
    const lookup = queryBuilder({ data: localRow });
    signedInAs(user, ALICE, { transactions: [lookup] });
    await get(HASH);
    expect(String(lookup.select.mock.calls[0][0])).not.toContain("profiles");
  });

  it("does not disclose a transfer between two other people", async () => {
    signedInAs(user, ALICE, { transactions: [queryBuilder({ data: null })] });
    const stranger = "0x" + "cc".repeat(20);
    circleReturns({ data: { transfer: circleTransfer({ from: stranger, to: "0x" + "dd".repeat(20) }) } });
    circleReturns({ data: { transfers: [] } });
    circleReturns({}, false);

    expect((await get(UUID)).status).toBe(404);
  });

  it("returns a Circle transfer that involves the caller, and caches it on their own wallet", async () => {
    const cache = queryBuilder({});
    signedInAs(user, ALICE, { transactions: [queryBuilder({ data: null }), cache] });
    circleReturns({ data: { transfer: circleTransfer() } });

    const res = await get(UUID);

    expect(res.status).toBe(200);
    expect((await res.json()).transaction).toMatchObject({ id: "t-9", from: ALICE.wallet_address });
    expect(cache.insert.mock.calls[0][0]).toMatchObject({
      wallet_id: ALICE.id,
      profile_id: ALICE.profile_id,
    });
  });

  it("caches a transfer the caller received against the CALLER's wallet, not the sender's", async () => {
    const cache = queryBuilder({});
    signedInAs(user, BOB, { transactions: [queryBuilder({ data: null }), cache] });
    // Alice sent to Bob. Bob is looking at it.
    circleReturns({ data: { transfer: circleTransfer() } });

    await get(UUID);

    expect(cache.insert.mock.calls[0][0]).toMatchObject({ wallet_id: BOB.id, profile_id: BOB.profile_id });
  });

  it("only returns a hash-lookup result that involves the caller", async () => {
    signedInAs(user, ALICE, { transactions: [queryBuilder({ data: null }), queryBuilder({})] });
    circleReturns({}, false); // direct lookup: not found
    circleReturns({
      data: {
        transfers: [
          circleTransfer({ id: "other", from: "0x" + "cc".repeat(20), to: "0x" + "dd".repeat(20) }),
          circleTransfer({ id: "mine" }),
        ],
      },
    });

    const res = await get(HASH);

    expect(res.status).toBe(200);
    expect((await res.json()).transaction.id).toBe("mine");
  });
});
