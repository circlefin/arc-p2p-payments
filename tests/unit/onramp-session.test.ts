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
import { ALICE, BOB, signedInAs, signedOut } from "../helpers/scenario";

vi.hoisted(() => {
  process.env.CIRCLE_API_KEY = "TEST_API_KEY:x:y";
});

const user = vi.hoisted(() => ({ from: vi.fn(), auth: { getUser: vi.fn() } }));
const sdkHandler = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server-client", () => ({ createSupabaseServerClient: async () => user }));
vi.mock("@/lib/onramp/server-environment", () => ({ API_BASE_URL: undefined, ENVIRONMENT: "sandbox" }));
vi.mock("@/lib/onramp/environment", () => ({ WIDGET_BASE_URL: undefined }));
vi.mock("@crcl-main/onramp-kit/server", () => ({
  createOnrampServerKit: () => ({}),
  createSessionRouteHandler: () => sdkHandler,
}));

import { POST } from "@/app/api/onramp/session/route";

const post = (body: unknown, raw = false) =>
  POST(
    new NextRequest("http://localhost/api/onramp/session", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": "999" },
      body: raw ? (body as string) : JSON.stringify(body),
    })
  );

const asked = (over: Record<string, unknown> = {}) => ({
  userId: ALICE.wallet_address,
  destinationAddress: ALICE.wallet_address,
  destinationChain: "arc",
  assets: { tokens: ["USDC"] },
  ...over,
});

beforeEach(() => {
  user.from.mockReset();
  user.auth.getUser.mockReset();
  sdkHandler.mockReset();
  sdkHandler.mockResolvedValue(new Response(JSON.stringify({ token: "session-1" }), { status: 200 }));
});

describe("POST /api/onramp/session", () => {
  it("does not mint a session for a signed-out caller", async () => {
    signedOut(user);
    expect((await post(asked())).status).toBe(401);
    expect(sdkHandler).not.toHaveBeenCalled();
  });

  it("does not mint a session for a user with no wallet", async () => {
    signedInAs(user, null);
    expect((await post(asked())).status).toBe(403);
    expect(sdkHandler).not.toHaveBeenCalled();
  });

  it("refuses a session that would deliver funds to someone else's address", async () => {
    signedInAs(user, ALICE);
    const res = await post(asked({ destinationAddress: BOB.wallet_address }));
    expect(res.status).toBe(403);
    expect(sdkHandler).not.toHaveBeenCalled();
  });

  it.each([
    ["no destination", asked({ destinationAddress: undefined })],
    ["a non-string destination", asked({ destinationAddress: 42 })],
  ])("refuses a request with %s", async (_name, body) => {
    signedInAs(user, ALICE);
    expect((await post(body)).status).toBe(403);
    expect(sdkHandler).not.toHaveBeenCalled();
  });

  it("refuses a body that is not JSON", async () => {
    signedInAs(user, ALICE);
    expect((await post("not json", true)).status).toBe(403);
    expect(sdkHandler).not.toHaveBeenCalled();
  });

  it("hands the kit the caller's own wallet and leaves the rest of the request alone", async () => {
    signedInAs(user, ALICE);

    const res = await post(asked({ destinationAddress: ALICE.wallet_address.toUpperCase().replace("0X", "0x") }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ token: "session-1" });
    const forwarded: Request = sdkHandler.mock.calls[0][0];
    expect(forwarded.headers.get("content-length")).toBeNull();
    expect(await forwarded.json()).toEqual(asked({ destinationAddress: ALICE.wallet_address }));
  });
});
