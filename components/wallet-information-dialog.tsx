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

"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { InfoIcon, Copy, CheckCircle, ExternalLink } from "lucide-react";
import { useState } from "react";
import { getExplorerUrl } from "@/lib/utils/get-explorer-url";

interface WalletInformationDialogProps {
  wallets: Array<{
    wallet_address: string;
    blockchain: string;
    chain: string;
  }>;
}

export function WalletInformationDialog({ wallets }: WalletInformationDialogProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const wallet = wallets[0];

  const copyAddress = (address: string) => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    toast({
      title: "Address copied",
      description: "The wallet address has been copied to your clipboard",
    });
    setTimeout(() => setCopied(false), 2000);
  };

  if (!wallet) return null;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost">
          <InfoIcon />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Wallet Information</DialogTitle>
          <DialogDescription>
            Your wallet details on Arc
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col space-y-4 mt-4">
          <div>
            <div className="text-sm font-medium mb-1">Wallet Address</div>
            <div className="flex items-center justify-between bg-muted p-3 rounded-md">
              <code className="text-xs font-mono break-all">
                {wallet.wallet_address}
              </code>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => copyAddress(wallet.wallet_address)}
                className="ml-2"
              >
                {copied ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <div>
            <div className="text-sm font-medium mb-1">Blockchain</div>
            <div className="bg-muted p-3 rounded-md">
              <div className="text-sm">Arc Testnet</div>
            </div>
          </div>

          <div className="flex flex-col space-y-2">
            <Button
              variant="outline"
              size="sm"
              asChild
              className="w-full"
            >
              <a
                href={getExplorerUrl(wallet.wallet_address)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2"
              >
                <ExternalLink className="h-4 w-4" />
                View on ArcScan
              </a>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
