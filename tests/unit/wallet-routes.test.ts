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
const refresh = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server-client", () => ({ createSupabaseServerClient: async () => user }));
vi.mock("@/lib/wallets/refresh-balance", () => ({ refreshWalletBalance: refresh }));
// The transactions route reads a constant from the wallet provider component.
vi.mock("@/components/web3-provider", () => ({ arcTestnet: { id: 5042002 } }));

import { POST as balance } from "@/app/api/wallet/balance/route";
import { POST as transactions } from "@/app/api/wallet/transactions/route";

const post = (handler: (r: NextRequest) => Promise<Response>, body: unknown) =>
  handler(
    new NextRequest("http://localhost/api/wallet", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );

beforeEach(() => {
  user.from.mockReset();
  user.auth.getUser.mockReset();
  refresh.mockReset();
  vi.stubGlobal("fetch", vi.fn());
});

describe("POST /api/wallet/balance", () => {
  const ask = (walletId: string) => post(balance, { walletId, blockchain: "arc" });

  it("refuses a signed-out caller without touching Circle", async () => {
    signedOut(user);
    expect((await ask(ALICE.wallet_address)).status).toBe(401);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refuses to read (or cache) someone else's balance", async () => {
    signedInAs(user, ALICE);
    expect((await ask(BOB.wallet_address)).status).toBe(403);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refuses a caller who has no wallet yet", async () => {
    signedInAs(user, null);
    expect((await ask(ALICE.wallet_address)).status).toBe(403);
  });

  it("rejects a malformed body", async () => {
    signedInAs(user, ALICE);
    expect((await post(balance, { walletId: ALICE.wallet_address, blockchain: "eth" })).status).toBe(400);
  });

  it("returns the caller's own balance, matching the address in any case", async () => {
    signedInAs(user, ALICE);
    refresh.mockResolvedValue("12.5");
    const res = await ask(ALICE.wallet_address.toUpperCase().replace("0X", "0x"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ balance: "12.5" });
    expect(refresh).toHaveBeenCalledWith(expect.objectContaining({ id: ALICE.id }));
  });

  it("degrades to 0 when Circle is unreachable", async () => {
    signedInAs(user, ALICE);
    refresh.mockRejectedValue(new Error("circle down"));
    expect(await (await ask(ALICE.wallet_address)).json()).toEqual({ balance: "0" });
  });
});

describe("POST /api/wallet/transactions", () => {
  const ask = (walletId: string) => post(transactions, { walletId });

  it("refuses a signed-out caller without calling Circle", async () => {
    signedOut(user);
    expect((await ask(ALICE.wallet_address)).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses to list someone else's transfers", async () => {
    signedInAs(user, ALICE);
    expect((await ask(BOB.wallet_address)).status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a walletId that is not an address", async () => {
    signedInAs(user, ALICE);
    expect((await ask("../../etc/passwd")).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("lists the caller's own transfers, marking direction", async () => {
    signedInAs(user, ALICE);
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          transfers: [
            {
              id: "t1", txHash: "0xabc", fromAddress: ALICE.wallet_address, toAddress: BOB.wallet_address,
              amount: "5", createDate: "2026-09-18", state: "COMPLETE", tokenId: "x",
              transferType: "OUTBOUND", userOpHash: "0x", updateDate: "2026-09-18",
            },
          ],
          hasMore: false,
        },
      }),
    } as Response);

    const res = await ask(ALICE.wallet_address);

    expect(res.status).toBe(200);
    expect((await res.json()).transactions[0]).toMatchObject({ id: "t1", transactionType: "sent" });
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain(`walletAddresses=${ALICE.wallet_address}`);
  });
});

void queryBuilder;
