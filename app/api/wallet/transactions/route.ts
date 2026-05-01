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
import { z } from "zod";
import { arcTestnet } from "@/components/web3-provider";

const ARC_CHAIN_ID = arcTestnet.id; // 5042002
const ARC_BLOCKCHAIN = "ARC-TESTNET";
const ARC_NETWORK_NAME = "Arc Testnet";

// Schema for validating request parameters
const WalletIdSchema = z.object({
  walletId: z.string().regex(/^0x[a-fA-F0-9]{40}$/, {
    message: "Invalid Ethereum wallet address format",
  }),
  networkId: z.number().optional().default(ARC_CHAIN_ID),
  pageSize: z.number().optional().default(50),
  pageAfter: z.string().optional(),
  pageBefore: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parseResult = WalletIdSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: "Invalid request parameters",
          details: parseResult.error.format(),
        },
        { status: 400 }
      );
    }

    const { walletId, pageSize, pageAfter, pageBefore, from, to } =
      parseResult.data;

    // Build the Circle API URL with query parameters
    const baseUrl = "https://api.circle.com/v1/w3s/buidl/transfers";

    const params = new URLSearchParams();
    params.append("walletAddresses", walletId);
    params.append("blockchain", ARC_BLOCKCHAIN);
    params.append("pageSize", pageSize.toString());

    if (pageAfter) params.append("pageAfter", pageAfter);
    if (pageBefore) params.append("pageBefore", pageBefore);
    if (from) params.append("from", from);
    if (to) params.append("to", to);

    const url = `${baseUrl}?${params.toString()}`;

    // Call the Circle API
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${process.env.CIRCLE_API_KEY}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Circle API error:", errorData);

      return NextResponse.json(
        { error: `Failed to fetch transfers: ${response.statusText}` },
        { status: response.status }
      );
    }

    // Parse the Circle API response
    const circleData = await response.json();

    interface CircleTransfer {
      txHash: string;
      fromAddress?: string;
      from?: string;
      toAddress?: string;
      to?: string;
      amount: string;
      createDate: string;
      state: string;
      tokenId: string;
      transferType: string;
      userOpHash: string;
      updateDate: string;
      id: string;
    }

    interface CircleResponse {
      data: {
        transfers: CircleTransfer[];
        hasMore: boolean;
        pageAfter?: string;
        pageBefore?: string;
      };
    }

    interface Transaction {
      hash: string;
      from?: string;
      to?: string;
      amount: string;
      timestamp: string;
      networkId: number;
      networkName: string;
      state: string;
      transactionType: 'sent' | 'received';
      tokenId: string;
      transferType: string;
      userOpHash: string;
      updateDate: string;
      id: string;
    }

    const transactions: Transaction[] = (circleData as CircleResponse).data.transfers.map((transfer: CircleTransfer) => {
      const fromAddress = transfer.fromAddress || transfer.from;
      const isSent =
        fromAddress && fromAddress.toLowerCase() === walletId.toLowerCase();
      const transactionType = isSent ? "sent" : "received";

      return {
        hash: transfer.txHash,
        from: transfer.fromAddress,
        to: transfer.toAddress,
        amount: transfer.amount,
        timestamp: transfer.createDate,
        networkId: ARC_CHAIN_ID,
        networkName: ARC_NETWORK_NAME,
        state: transfer.state,
        transactionType: transactionType,
        tokenId: transfer.tokenId,
        transferType: transfer.transferType,
        userOpHash: transfer.userOpHash,
        updateDate: transfer.updateDate,
        id: transfer.id,
      };
    });

    return NextResponse.json({
      transactions,
      pagination: {
        hasMore: circleData.data.hasMore,
        pageAfter: circleData.data.pageAfter,
        pageBefore: circleData.data.pageBefore,
      },
    });
  } catch (error) {
    console.error("Error processing request:", error);

    return NextResponse.json(
      {
        error:
          "Internal server error: " +
          (error instanceof Error ? error.message : String(error)),
      },
      { status: 500 }
    );
  }
}
