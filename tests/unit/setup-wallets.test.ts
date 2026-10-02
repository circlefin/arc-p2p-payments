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
import { ALICE, signedOut, type UserClient } from "../helpers/scenario";
import { queueTables } from "../helpers/supabase-mock";

const user = vi.hoisted(() => ({ from: vi.fn(), auth: { getUser: vi.fn(), updateUser: vi.fn() } }));
vi.mock("@/lib/supabase/server-client", () => ({ createSupabaseServerClient: async () => user }));

import { POST } from "@/app/api/setup-wallets/route";

const ADDRESS = "0x" + "aB".repeat(20);

const post = (body: unknown) =>
  POST(
    new NextRequest("http://localhost/api/setup-wallets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );

const credential = (publicKey = "0x" + "12".repeat(32)) => JSON.stringify({ id: "cred-1", publicKey });

/** Signed in with a profile; `wallets` queues: the existing-wallets read, then the write. */
function signedIn(existing: unknown[], write = queryBuilder({})) {
  user.auth.getUser.mockResolvedValue({ data: { user: { id: "auth-alice" } } });
  user.auth.updateUser.mockResolvedValue({ error: null });
  queueTables(user as UserClient, {
    profiles: [queryBuilder({ data: { id: ALICE.profile_id } })],
    wallets: [queryBuilder({ data: existing }), write],
  });
  return write;
}

beforeEach(() => {
  user.from.mockReset();
  user.auth.getUser.mockReset();
});

describe("POST /api/setup-wallets", () => {
  it("refuses a signed-out caller", async () => {
    signedOut(user as UserClient);
    expect((await post({ credential: credential() })).status).toBe(401);
  });

  it("requires a credential", async () => {
    signedIn([]);
    expect((await post({})).status).toBe(400);
  });

  it("rejects a credential that is not JSON (was a 500)", async () => {
    signedIn([]);
    expect((await post({ credential: "{not json" })).status).toBe(400);
  });

  it.each(["0x123", "not-an-address", "javascript:alert(1)", " ", 42])(
    "rejects circleAddress %j: it becomes the address other people pay",
    async (circleAddress) => {
      signedIn([]);
      const res = await post({ credential: credential(), circleAddress });
      expect(res.status).toBe(400);
    }
  );

  it("rejects a public key that is not address-shaped", async () => {
    signedIn([]);
    expect((await post({ credential: credential("0x12") })).status).toBe(400);
  });

  it("rejects a credential with no public key", async () => {
    signedIn([]);
    expect((await post({ credential: JSON.stringify({ id: "x" }) })).status).toBe(400);
  });

  it("stores a new wallet with a lower-cased address", async () => {
    const write = signedIn([]);
    const res = await post({ credential: credential(), circleAddress: ADDRESS });

    expect(res.status).toBe(201);
    expect(write.insert.mock.calls[0][0]).toMatchObject({
      profile_id: ALICE.profile_id,
      wallet_address: ADDRESS.toLowerCase(),
      circle_wallet_id: ADDRESS.toLowerCase(),
      blockchain: "ARC",
    });
  });

  it("derives the address from the credential's public key when none is given", async () => {
    const write = signedIn([]);
    const publicKey = "0x" + "CD".repeat(32);
    await post({ credential: credential(publicKey) });
    expect(write.insert.mock.calls[0][0].wallet_address).toBe(publicKey.slice(0, 42).toLowerCase());
  });

  it("updates the existing Arc wallet instead of adding another", async () => {
    const write = signedIn([{ id: ALICE.id, blockchain: "ARC" }]);
    const res = await post({ credential: credential(), circleAddress: ADDRESS });

    expect(res.status).toBe(201);
    expect(write.update.mock.calls[0][0]).toMatchObject({ wallet_address: ADDRESS.toLowerCase() });
    expect(write.insert).not.toHaveBeenCalled();
  });

  it("answers 409 when the address already belongs to another account", async () => {
    signedIn([], queryBuilder({ error: { message: "duplicate key", code: "23505" } }));
    const res = await post({ credential: credential(), circleAddress: ADDRESS });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/already registered/);
  });

  it("adds an Arc wallet for a user who only has wallets on an old chain", async () => {
    const write = signedIn([{ id: "old", blockchain: "ETH" }]);
    const res = await post({ credential: credential(), circleAddress: ADDRESS });
    expect(res.status).toBe(201);
    expect(write.insert.mock.calls[0][0]).toMatchObject({ blockchain: "ARC" });
  });

  it("answers 409 on a duplicate when only old-chain wallets exist (was silently ignored)", async () => {
    signedIn(
      [{ id: "old", blockchain: "ETH" }],
      queryBuilder({ error: { message: "duplicate key", code: "23505" } })
    );
    expect((await post({ credential: credential(), circleAddress: ADDRESS })).status).toBe(409);
  });

  it("answers 409 on a duplicate when updating too (was silently ignored)", async () => {
    signedIn(
      [{ id: ALICE.id, blockchain: "ARC" }],
      queryBuilder({ error: { message: "duplicate key", code: "23505" } })
    );
    expect((await post({ credential: credential(), circleAddress: ADDRESS })).status).toBe(409);
  });
});
