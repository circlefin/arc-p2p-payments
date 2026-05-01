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

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WalletInformationDialog } from "@/components/wallet-information-dialog";
import { WalletBalance } from "@/components/wallet-balance";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { signOutAction } from "@/app/actions";

interface Props {
  walletModels: Array<{  
    wallet_address: string;
    blockchain: string;
    chain: string;
  }>;
}

export default async function BalanceTab({ walletModels }: Props) {
  return (
    <>
      <form className="flex items-center justify-between w-full pb-4" action={signOutAction}>
        <p className="text-2xl font-semibold">Arc Pay</p>
        <Button variant="ghost" size="icon">
          <LogOut />
        </Button>
      </form>
      <div className="flex flex-wrap mb-4">
        {/* Wallet Card */}
        <Card className="w-full break-inside-avoid">
          <CardHeader className="flex-row items-center">
            <CardTitle className="mr-auto">USDC balance</CardTitle>
            <WalletInformationDialog
              wallets={walletModels}
            />
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <WalletBalance />
          </CardContent>
        </Card>
      </div>
    </>
  )
}