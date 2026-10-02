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

import { type NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";
import { z } from "zod";

const CredentialSchema = z.object({
  // A serialized passkey credential: JSON, and small.
  credential: z
    .string()
    .max(16_384)
    .refine((value) => {
      try {
        JSON.parse(value);
        return true;
      } catch {
        return false;
      }
    }, "credential must be JSON"),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parseResult = CredentialSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid credential format" },
        { status: 400 }
      );
    }

    const { credential } = parseResult.data;

    const supabase = await createSupabaseServerClient();

    // getSession() only reads the cookie, so verify against the auth server.
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized - No valid session" },
        { status: 401 }
      );
    }

    const authUserId = user.id;

    if (!authUserId) {
      return NextResponse.json(
        { error: "User ID not found in session" },
        { status: 400 }
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("auth_user_id", authUserId)
      .single();

    if (profileError || !profile) {
      console.error("Error fetching profile:", profileError);
      return NextResponse.json(
        { error: "Profile not found for user" },
        { status: 404 }
      );
    }

    const profileId = profile.id;

    const { data, error } = await supabase
      .from("wallets")
      .update({ passkey_credential: credential })
      .eq("profile_id", profileId)
      .select();

    if (error) {
      console.error("Error updating wallet credential:", error);
      return NextResponse.json(
        { error: "Failed to update credential in database" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in update-login-credential endpoint:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
