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

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";
import { isWalletAddress, normalizeAddress } from "@/lib/wallets/address";

/** 23505 = the address already belongs to another wallet (see migration 20260918120000). */
function walletWriteFailed(error: { code?: string }) {
  if (error.code === "23505") {
    return NextResponse.json(
      { error: "That wallet address is already registered to another account" },
      { status: 409 }
    );
  }
  return NextResponse.json({ error: "Could not create wallet" }, { status: 500 });
}

export async function POST(req: NextRequest) {
  try {
    const { credential, circleAddress } = await req.json();

    if (!credential) {
      return NextResponse.json(
        { error: "Credential is required" },
        { status: 400 }
      );
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select()
      .eq("auth_user_id", user.id)
      .single();

    if (profileError || !profileData) {
      console.error("Error fetching profile:", profileError);
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    // Parse the credential
    let parsedCredential;
    try {
      parsedCredential = JSON.parse(credential);
    } catch {
      return NextResponse.json({ error: "Credential must be valid JSON" }, { status: 400 });
    }

    // Determine which address to use. It becomes the address other people pay, so it
    // must be a real address, never free text.
    let walletAddress: string;

    if (circleAddress) {
      if (!isWalletAddress(circleAddress)) {
        return NextResponse.json({ error: "circleAddress is not a valid address" }, { status: 400 });
      }
      walletAddress = normalizeAddress(circleAddress);
    } else {
      const publicKey = parsedCredential?.publicKey;

      const isValidPublicKey =
        typeof publicKey === "string" &&
        publicKey.startsWith("0x") &&
        /^0x[0-9a-fA-F]{40,}$/.test(publicKey);

      if (!isValidPublicKey) {
        return NextResponse.json({ error: "Invalid public key format" }, { status: 400 });
      }

      walletAddress = normalizeAddress(publicKey.slice(0, 42));
    }

    const credentialString =
      typeof credential === "string" ? credential : JSON.stringify(credential);

    const { data: existingWallets } = await supabase
      .from("wallets")
      .select()
      .eq("profile_id", profileData.id);

    if (existingWallets && existingWallets.length > 0) {
      const arcWallet = existingWallets.find(
        (w) => w.blockchain === "ARC"
      );
      if (arcWallet) {
        const { error: updateError } = await supabase
          .from("wallets")
          .update({
            wallet_address: walletAddress,
            passkey_credential: credentialString,
            circle_wallet_id: walletAddress,
            updated_at: new Date().toISOString(),
          })
          .eq("id", arcWallet.id);

        if (updateError) {
          console.error("Error updating Arc wallet:", updateError);
          return walletWriteFailed(updateError);
        }
      } else {
        const { error: insertError } = await supabase.from("wallets").insert({
          profile_id: profileData.id,
          wallet_address: walletAddress,
          wallet_type: "modular",
          blockchain: "ARC",
          account_type: "SCA",
          currency: "USDC",
          passkey_credential: credentialString,
          circle_wallet_id: walletAddress,
        });

        if (insertError) {
          console.error("Error inserting Arc wallet:", insertError);
          return walletWriteFailed(insertError);
        }
      }
    } else {
      const { error: insertError } = await supabase.from("wallets").insert({
        profile_id: profileData.id,
        wallet_address: walletAddress,
        wallet_type: "modular",
        blockchain: "ARC",
        account_type: "SCA",
        currency: "USDC",
        passkey_credential: credentialString,
        circle_wallet_id: walletAddress,
      });

      if (insertError) {
        console.error("Error inserting new wallet:", insertError);
        return walletWriteFailed(insertError);
      }
    }

    const { error: updateUserError } = await supabase.auth.updateUser({
      data: {
        wallet_setup_complete: true,
        wallet_address: walletAddress,
      },
    });

    if (updateUserError) {
      console.error("Error updating user metadata:", updateUserError);
    }

    const headers = new Headers();
    headers.append(
      "Set-Cookie",
      `wallet_setup_complete=true; Path=/; HttpOnly; SameSite=Strict; Max-Age=3600`
    );

    return new NextResponse(
      JSON.stringify({
        message: "Wallet created successfully",
        walletAddress: walletAddress,
        success: true,
        redirectUrl: "/dashboard",
      }),
      {
        status: 201,
        headers,
      }
    );
  } catch (error) {
    console.error("Error setting up wallets:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to set up wallet: ${message}` },
      { status: 500 }
    );
  }
}
