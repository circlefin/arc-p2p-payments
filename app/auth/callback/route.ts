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

import { createSupabaseServerClient } from "@/lib/supabase/server-client";
import { NextResponse } from "next/server";
import { resolveBaseUrl } from "@/lib/utils/base-url";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { STORED_BLOCKCHAIN, createWalletSetWithWallet } from "@/lib/circle/wallets";
import { normalizeAddress } from "@/lib/wallets/address";

// Only same-origin paths are honoured: the redirect target is user-controlled.
function safeRedirectPath(searchParams: URLSearchParams): string {
  const requested = searchParams.get("redirect_to") ?? searchParams.get("next");
  if (!requested?.startsWith("/")) return "/";
  if (requested.startsWith("//") || requested.startsWith("/\\")) return "/";
  return requested;
}

export async function GET(request: Request) {
  // Read off the inbound request so redirects land on the origin the user reached.
  const baseUrl = await resolveBaseUrl();
  const { searchParams } = new URL(request.url);

  const code = searchParams.get("code");

  // Resolved against baseUrl so the path is normalised instead of concatenated.
  const redirectUrl = new URL(safeRedirectPath(searchParams), baseUrl).toString();

  if (code) {
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // `email` identifies a user to everyone else, so users cannot write it. Sync it
      // from the verified auth user with the secret key.
      const { data: user, error: userIdError } = await createSupabaseAdminClient()
        .from("profiles")
        .update({ email: data.user.email })
        .eq("auth_user_id", data.user.id)
        .select("id")
        .single();

      if (userIdError) {
        console.error("Could not find an user with such auth_user_id", userIdError);
        return NextResponse.json(
          { message: "Could not find an user with such auth_user_id" },
          { status: 500 }
        );
      }

      const { data: walletAlreadyExists } = await supabase
        .from("wallets")
        .select()
        .eq("profile_id", user.id)
        .single();

      if (walletAlreadyExists) {
        return NextResponse.redirect(redirectUrl);
      }

      // Called directly rather than through /api/wallet-set and /api/wallet: those had
      // no authentication (anyone could mint wallets on our Circle account) and this
      // was their only caller.
      let createdWallet;
      try {
        createdWallet = await createWalletSetWithWallet(data.user.email ?? data.user.id);
      } catch (walletError) {
        console.error("Wallet creation failed", walletError);
        return NextResponse.redirect(`${baseUrl}/auth/auth-error`);
      }

      const { error: walletInsertError } = await supabase.from("wallets").insert({
        profile_id: user.id,
        circle_wallet_id: createdWallet.id,
        wallet_type: createdWallet.custodyType,
        wallet_set_id: createdWallet.walletSetId,
        wallet_address: normalizeAddress(createdWallet.address),
        account_type: createdWallet.accountType,
        blockchain: STORED_BLOCKCHAIN,
        currency: "USDC",
      });

      if (walletInsertError) {
        console.error("Could not save the new wallet:", walletInsertError);
        return NextResponse.redirect(`${baseUrl}/auth/auth-error`);
      }

      return NextResponse.redirect(redirectUrl);
    }
  }

  return NextResponse.redirect(`${baseUrl}/auth/auth-error`);
}