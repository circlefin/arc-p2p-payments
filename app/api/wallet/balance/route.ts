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

// Schema validation
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
    const body = await req.json();
    const parseResult = WalletIdSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid walletId format" },
        { status: 400 },
      );
    }

    const { walletId } = parseResult.data;
    const normalizedWalletId = walletId.toLowerCase();

    // Get the Supabase client
    const supabase = await createSupabaseServerClient();

    // Fetch the wallet information from the database
    const { data: wallet, error: walletError } = await supabase
      .from("wallets")
      .select("*")
      .eq("wallet_address", normalizedWalletId)
      .eq("blockchain", "ARC")
      .single();

    if (walletError || !wallet) {
      console.error("Error fetching wallet:", walletError);
      return NextResponse.json(
        { error: "Wallet not found in database" },
        { status: 404 },
      );
    }

    // Get the wallet address
    const walletAddress = wallet.wallet_address;

    if (!walletAddress) {
      console.error("Wallet address not found in database record");
      return NextResponse.json(
        { error: "Wallet address not found in database record" },
        { status: 400 },
      );
    }

    try {
      // Use the blockchain + address endpoint to get balances
      const balanceResponse = await axios.get(
        `https://api.circle.com/v1/w3s/buidl/wallets/ARC-TESTNET/${walletAddress}/balances`,
        {
          headers: {
            "X-Request-Id": crypto.randomUUID(),
            Authorization: `Bearer ${process.env.CIRCLE_API_KEY}`,
            "Content-Type": "application/json",
          },
        },
      );

      const usdcBalance =
        balanceResponse.data?.data?.tokenBalances?.find(
          (balance: any) => balance.token?.symbol === "USDC",
        )?.amount || "0";

      // Update wallet balance in database
      await supabase
        .from("wallets")
        .update({ balance: usdcBalance })
        .eq("wallet_address", normalizedWalletId)
        .eq("blockchain", "ARC");

      return NextResponse.json({ balance: usdcBalance });
    } catch (error) {
      console.error("Error fetching balance from Circle API:", error);

      if (axios.isAxiosError(error)) {
        console.error("API error details:", {
          status: error.response?.status,
          data: error.response?.data,
        });
      }

      // Return 0 balance instead of error for better UX
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

    // For any other errors, return 0 balance for better UX
    return NextResponse.json({ balance: "0" });
  }
}
