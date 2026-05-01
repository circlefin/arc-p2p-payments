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


import { NextResponse } from "next/server";
import { createClient } from "@/lib/utils/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();

    // Get user data
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Get all profiles
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("*");

    if (profilesError) {
      return NextResponse.json(
        { error: "Error fetching profiles", details: profilesError },
        { status: 500 }
      );
    }

    // Get all wallets
    const { data: wallets, error: walletsError } = await supabase
      .from("wallets")
      .select("*");

    if (walletsError) {
      return NextResponse.json(
        { error: "Error fetching wallets", details: walletsError },
        { status: 500 }
      );
    }

    // Check if tables have the expected columns
    const { data: walletsColumns, error: walletsColumnsError } =
      await supabase.rpc("get_table_columns", { table_name: "wallets" });

    if (walletsColumnsError) {
      return NextResponse.json(
        { error: "Error checking table columns", details: walletsColumnsError },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        currentUser: user,
        profilesCount: profiles.length,
        profiles: profiles,
        walletsCount: wallets.length,
        wallets: wallets,
        walletsColumns: walletsColumns,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error in debug endpoint:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Debug error: ${message}` },
      { status: 500 }
    );
  }
}
