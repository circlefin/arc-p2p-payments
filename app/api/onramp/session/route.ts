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

import {
  createOnrampServerKit,
  createSessionRouteHandler,
} from "@crcl-main/onramp-kit/server";
import type { NextRequest } from "next/server";
import { API_BASE_URL, ENVIRONMENT } from "@/lib/onramp/server-environment";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";
import { forbidden, getAuthenticatedUser, getOwnWallet, unauthorized } from "@/lib/auth/session";
import { sameAddress } from "@/lib/wallets/address";
import { WIDGET_BASE_URL } from "@/lib/onramp/environment";

// server-environment already refuses to start on mismatched base URLs, so this only catches a missing key.
const apiKey = process.env.CIRCLE_API_KEY?.trim();
if (!apiKey) {
  throw new Error(
    `CIRCLE_API_KEY is not set. Add the ${ENVIRONMENT} API key from the Circle console.`,
  );
}

// Undefined leaves the kit on its mainnet defaults, which move real money.
const server = createOnrampServerKit({
  apiKey,
  baseUrl: API_BASE_URL,
  widgetBaseUrl: WIDGET_BASE_URL,
});

const sessionHandler = createSessionRouteHandler(server);

// The kit's handler takes the destination straight from the request body. Left as is,
// anyone could mint a session that delivers funds to any address, signed in or not.
// So: signed-in users only, and the destination must be the caller's own wallet.
// Everything else in the body is passed to the kit untouched.
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) return unauthorized();

  const ownWallet = await getOwnWallet(supabase, user.id);
  if (!ownWallet) return forbidden("You do not have a wallet yet");

  const body = await req.json().catch(() => null);
  if (
    !body ||
    typeof body !== "object" ||
    typeof body.destinationAddress !== "string" ||
    !sameAddress(body.destinationAddress, ownWallet.wallet_address)
  ) {
    return forbidden("Funds can only be delivered to your own wallet");
  }

  const headers = new Headers(req.headers);
  headers.delete("content-length"); // the body below is a different length

  return sessionHandler(
    new Request(req.url, {
      method: "POST",
      headers,
      body: JSON.stringify({ ...body, destinationAddress: ownWallet.wallet_address }),
    })
  );
}
