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

import crypto from "crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { queryBuilder, queueTables } from "../helpers/supabase-mock";
import { ALICE } from "../helpers/scenario";

const admin = vi.hoisted(() => ({ from: vi.fn() }));
const refresh = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/admin-client", () => ({ createSupabaseAdminClient: () => admin }));
vi.mock("@/lib/wallets/refresh-balance", () => ({ refreshWalletBalance: refresh }));

import { POST } from "@/app/api/webhooks/circle/route";

// A real key pair: the route verifies real signatures against the key Circle serves.
const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
const publicKeyBase64 = publicKey.export({ type: "spki", format: "der" }).toString("base64");

function signed(rawBody: string, signWith = rawBody) {
  const signature = crypto.createSign("SHA256").update(signWith).sign(privateKey).toString("base64");
  return new NextRequest("http://localhost/api/webhooks/circle", {
    method: "POST",
    headers: { "x-circle-signature": signature, "x-circle-key-id": "key-1" },
    body: rawBody,
  });
}

const TX = "0x" + "ab".repeat(32);
const wallet = { ...ALICE, balance: 0 };

const inbound = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    subscriptionId: "s",
    notificationId: "n",
    notificationType: "modularWallet.inboundTransfer",
    notification: {
      state: "COMPLETE", txHash: TX, amount: "5",
      from: "0x" + "b2".repeat(20), to: ALICE.wallet_address, walletAddress: ALICE.wallet_address,
      ...over,
    },
  });

/** Wallet lookups, then: no existing transaction row, and the insert. */
function queueInbound(walletLookups: ReturnType<typeof queryBuilder>[]) {
  const insert = queryBuilder({});
  queueTables(admin, {
    wallets: walletLookups,
    transactions: [queryBuilder({ data: null }), insert],
  });
  return insert;
}

beforeAll(() => {
  vi.stubEnv("CIRCLE_API_KEY", "test-key");
});

beforeEach(() => {
  admin.from.mockReset();
  refresh.mockReset();
  refresh.mockResolvedValue("5");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ data: { publicKey: publicKeyBase64 } }) }))
  );
});

describe("POST /api/webhooks/circle — authenticity", () => {
  it("rejects requests without signature headers", async () => {
    const res = await POST(new NextRequest("http://localhost/x", { method: "POST", body: "{}" }));
    expect(res.status).toBe(400);
  });

  it("rejects a payload whose signature does not match, touching nothing", async () => {
    const body = inbound();
    expect((await POST(signed(body, body + " "))).status).toBe(403);
    expect(admin.from).not.toHaveBeenCalled();
  });

  it("verifies the exact bytes received, not a re-serialization of them", async () => {
    const pretty = JSON.stringify(JSON.parse(inbound()), null, 4);
    queueInbound([queryBuilder({ data: wallet }), queryBuilder({ data: wallet })]);
    expect((await POST(signed(pretty))).status).toBe(200);
  });

  it("answers 400 to a validly signed body that is not JSON", async () => {
    expect((await POST(signed("not json"))).status).toBe(400);
  });
});

describe("POST /api/webhooks/circle — wallet lookup", () => {
  it("looks the wallet up by address instead of scanning the first 50 wallets", async () => {
    const lookup = queryBuilder({ data: wallet });
    queueInbound([lookup, queryBuilder({ data: wallet })]);

    await POST(signed(inbound()));

    expect(lookup.ilike).toHaveBeenCalledWith("wallet_address", ALICE.wallet_address);
    expect(lookup.eq).toHaveBeenCalledWith("blockchain", "ARC");
    expect(lookup.limit).toHaveBeenCalledWith(1);
  });

  it("does not load whole wallet rows (they include passkey credentials)", async () => {
    const lookup = queryBuilder({ data: wallet });
    queueInbound([lookup, queryBuilder({ data: wallet })]);
    await POST(signed(inbound()));
    expect(String(lookup.select.mock.calls[0][0])).not.toContain("*");
  });

  it("finds a wallet whose notification address lacks the 0x prefix", async () => {
    const miss = queryBuilder({ data: null });
    const hit = queryBuilder({ data: wallet });
    queueInbound([miss, hit, queryBuilder({ data: wallet })]);

    await POST(signed(inbound({ walletAddress: ALICE.wallet_address.slice(2) })));

    expect(hit.ilike).toHaveBeenCalledWith("wallet_address", ALICE.wallet_address.slice(2));
  });

  it("ignores an address that is not an address, without querying with it", async () => {
    queueTables(admin, {});
    const res = await POST(signed(inbound({ walletAddress: "%", to: "%", from: "_" })));
    expect(res.status).toBe(200);
    expect(admin.from).not.toHaveBeenCalled();
  });
});

describe("POST /api/webhooks/circle — recording", () => {
  it("records an inbound transfer against the wallet's owner", async () => {
    const insert = queueInbound([queryBuilder({ data: wallet }), queryBuilder({ data: wallet })]);

    expect((await POST(signed(inbound()))).status).toBe(200);

    expect(insert.insert.mock.calls[0][0]).toMatchObject({
      wallet_id: ALICE.id,
      profile_id: ALICE.profile_id,
      transaction_type: "USDC_TRANSFER_IN",
      amount: 5,
      circle_transaction_id: TX,
    });
  });

  it("refreshes the balance directly, without calling our own API", async () => {
    queueInbound([queryBuilder({ data: wallet }), queryBuilder({ data: wallet })]);

    await POST(signed(inbound()));

    expect(refresh).toHaveBeenCalledWith(expect.objectContaining({ id: ALICE.id }));
    expect(fetch).toHaveBeenCalledTimes(1); // only Circle's public-key fetch
  });

  it("does not refresh the balance for a transfer that is not complete", async () => {
    queueTables(admin, {});
    await POST(signed(inbound({ state: "PENDING" })));
    expect(refresh).not.toHaveBeenCalled();
  });
});
