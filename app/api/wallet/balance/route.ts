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
import axios from "axios";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";
import {
  forbidden,
  getAuthenticatedUser,
  getOwnWallet,
  unauthorized,
} from "@/lib/auth/session";
import { sameAddress } from "@/lib/wallets/address";
import { refreshWalletBalance } from "@/lib/wallets/refresh-balance";

const WalletIdSchema = z.object({
  walletId: z.string(),
  blockchain: z.literal("arc"),
});

const ResponseSchema = z.object({
  balance: z.string().optional(),
  error: z.string().optional(),
});

type WalletBalanceResponse = z.infer<typeof ResponseSchema>;

export async function POST(
  req: NextRequest,
): Promise<NextResponse<WalletBalanceResponse>> {
  try {
    // Each call spends the app's Circle API quota, so it is for signed-in users, and
    // only for their own wallet. (The Circle webhook refreshes balances itself,
    // through lib/wallets/refresh-balance, and no longer calls this route.)
    const supabase = await createSupabaseServerClient();
    const user = await getAuthenticatedUser(supabase);
    if (!user) return unauthorized() as NextResponse<WalletBalanceResponse>;

    const body = await req.json();
    const parseResult = WalletIdSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid walletId format" },
        { status: 400 },
      );
    }

    const { walletId } = parseResult.data;

    const ownWallet = await getOwnWallet(supabase, user.id);
    if (!ownWallet || !sameAddress(ownWallet.wallet_address, walletId)) {
      return forbidden() as NextResponse<WalletBalanceResponse>;
    }

    try {
      return NextResponse.json({ balance: await refreshWalletBalance(ownWallet) });
    } catch (error) {
      console.error("Error fetching balance from Circle API:", error);

      if (axios.isAxiosError(error)) {
        console.error("API error details:", {
          status: error.response?.status,
          data: error.response?.data,
        });
      }

      return NextResponse.json({ balance: "0" });
    }
  } catch (error) {
    console.error("Error in wallet balance endpoint:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request format" },
        { status: 400 },
      );
    }

    return NextResponse.json({ balance: "0" });
  }
}
