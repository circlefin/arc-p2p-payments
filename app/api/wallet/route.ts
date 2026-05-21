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
import { circleDeveloperSdk } from "@/lib/utils/developer-controlled-wallets-client";

export async function POST(req: NextRequest) {
  try {
    const { walletSetId } = await req.json();

    if (!walletSetId) {
      return NextResponse.json(
        { error: "walletSetId is required" },
        { status: 400 }
      );
    }

    const response = await circleDeveloperSdk.createWallets({
      walletSetId: walletSetId,
      blockchains: ["ARC-TESTNET"],
      count: 1,
      accountType: "SCA",
    });

    if (!response.data || !response.data.wallets || response.data.wallets.length === 0) {
      return NextResponse.json(
        { error: "The response did not include any created wallets" },
        { status: 500 }
      );
    }

    // Return the first created wallet
    return NextResponse.json({ ...response.data.wallets[0] }, { status: 201 });
  } catch (error: any) {
    console.error(`Wallet creation failed: ${error.message}`);
    return NextResponse.json(
      { error: `Failed to create wallet: ${error.message}` },
      { status: 500 }
    );
  }
}
