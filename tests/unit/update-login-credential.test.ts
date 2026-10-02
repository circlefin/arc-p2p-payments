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
import { queryBuilder, queueTables } from "../helpers/supabase-mock";
import { ALICE, signedOut, type UserClient } from "../helpers/scenario";

const user = vi.hoisted(() => ({ from: vi.fn(), auth: { getUser: vi.fn() } }));
vi.mock("@/lib/supabase/server-client", () => ({ createSupabaseServerClient: async () => user }));

import { POST } from "@/app/api/update-login-credential/route";

const post = (body: unknown) =>
  POST(
    new NextRequest("http://localhost/api/update-login-credential", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );

beforeEach(() => {
  user.from.mockReset();
  user.auth.getUser.mockReset();
});

describe("POST /api/update-login-credential", () => {
  it("refuses a signed-out caller", async () => {
    signedOut(user as UserClient);
    expect((await post({ credential: "{}" })).status).toBe(401);
  });

  it.each([
    ["not JSON", { credential: "{nope" }],
    ["not a string", { credential: { id: "x" } }],
    ["missing", {}],
    ["huge", { credential: JSON.stringify({ blob: "x".repeat(20_000) }) }],
  ])("rejects a credential that is %s", async (_name, body) => {
    expect((await post(body)).status).toBe(400);
  });

  it("stores the credential on the caller's own wallet", async () => {
    user.auth.getUser.mockResolvedValue({ data: { user: { id: "auth-alice" } } });
    const write = queryBuilder({ data: [{ id: ALICE.id }] });
    queueTables(user, {
      profiles: [queryBuilder({ data: { id: ALICE.profile_id } })],
      wallets: [write],
    });

    const credential = JSON.stringify({ id: "cred-2", publicKey: "0x" + "12".repeat(32) });
    const res = await post({ credential });

    expect(res.status).toBe(200);
    expect(write.update).toHaveBeenCalledWith({ passkey_credential: credential });
    expect(write.eq).toHaveBeenCalledWith("profile_id", ALICE.profile_id);
  });
});
