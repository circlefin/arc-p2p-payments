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

// app/api/manual-wallet-setup/route.ts
// This is for debugging/testing - creates wallets manually for existing users

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/utils/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const { email, wallet_address, passkey_credential } =
      await req.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const supabase = await createClient();

    // Get the profile by email
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("email", email)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "Profile not found", details: profileError },
        { status: 404 }
      );
    }

    // Check if wallets exist
    const { data: existingWallets } = await supabase
      .from("wallets")
      .select("*")
      .eq("profile_id", profile.id);

    // If wallets exist, update them
    if (existingWallets && existingWallets.length > 0) {
      const arcWallet = existingWallets.find(
        (w) => w.blockchain === "ARC"
      );
      if (arcWallet) {
        await supabase
          .from("wallets")
          .update({
            wallet_address:
              wallet_address || "0x1234567890123456789012345678901234567890",
            passkey_credential: passkey_credential || null,
            circle_wallet_id:
              wallet_address || "0x1234567890123456789012345678901234567890",
          })
          .eq("id", arcWallet.id);
      }
    } else {
      // Create Arc wallet
      await supabase.from("wallets").insert({
        profile_id: profile.id,
        wallet_address:
          wallet_address || "0x1234567890123456789012345678901234567890",
        wallet_type: "modular",
        blockchain: "ARC",
        account_type: "SCA",
        currency: "USDC",
        passkey_credential: passkey_credential || null,
        circle_wallet_id:
          wallet_address || "0x1234567890123456789012345678901234567890",
      });
    }

    return NextResponse.json(
      { success: true, message: "Wallet created/updated for user" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error in manual wallet setup:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to set up wallet: ${message}` },
      { status: 500 }
    );
  }
}
