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
import { LogOut, RotateCw } from "lucide-react";
import { signOutAction } from "@/app/actions";
import VirtualKeyboard from "@/components/virtual-keyboard";
import { useState } from "react";
import { calculateFontSize } from "@/lib/utils/calculate-font-size";
import { RecipientSearchInput } from "@/components/recipient-search.input";
import { useWeb3 } from "@/components/web3-provider";
import { useToast } from "@/hooks/use-toast";
import TransactionResultDialog from "@/components/transaction-result-dialog";
import AddressValidationDialog from "./ui/address-validation-dialog";

export default function WalletTab() {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("0");
  const [isLoading, setIsLoading] = useState(false);
  const [transactionSent, setTransactionSent] = useState(false);
  const [transactionHash, setTransactionHash] = useState("");
  const [showAddressValidation, setShowAddressValidation] = useState(false);

  const { account, isConnected, sendUSDC } = useWeb3();

  const { toast } = useToast();

  const currentAddress = account?.address || null;

  const isValidRecipient = /^0x[a-fA-F0-9]{40}$/.test(recipient);

  const handlePayButtonClick = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConnected || !currentAddress) {
      toast({
        title: "Not connected",
        description: "Please connect your wallet first",
        variant: "destructive",
      });
      return;
    }

    // Validate amount
    if (amount === "0" || amount === "" || amount.endsWith(".")) {
      toast({
        title: "Invalid amount",
        description: "Please enter a valid amount",
        variant: "destructive",
      });
      return;
    }

    // Show address validation dialog
    setShowAddressValidation(true);
  };

  const handleSend = async () => {
    setShowAddressValidation(false);
    setIsLoading(true);

    try {
      const txHash = await sendUSDC(recipient, amount);
      if (txHash) {
        toast({
          title: "Transaction sent!",
          description: `Transaction hash: ${txHash.slice(0, 10)}...${txHash.slice(-6)}`,
          variant: "default",
        });

        // Reset form
        setRecipient("");
        setAmount("0");
        setTransactionSent(true);
        setTransactionHash(txHash);
      } else {
        throw new Error("Transaction failed - no hash returned");
      }
    } catch (error) {
      console.error(error);
      toast({
        title: "Transaction failed",
        description:
          error instanceof Error ? error.message : "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const cancelTransaction = () => {
    setShowAddressValidation(false);
  };

  return (
    <>
      <TransactionResultDialog
        transactionHash={transactionHash}
        open={transactionSent}
        onOpenChange={setTransactionSent}
      />
      <AddressValidationDialog
        open={showAddressValidation}
        onOpenChange={setShowAddressValidation}
        address={recipient}
        onConfirm={handleSend}
        onCancel={cancelTransaction}
      />
      <form
        className="flex items-center justify-between w-full pb-4"
        action={signOutAction}
      >
        <Button className="ml-auto" variant="ghost" size="icon">
          <LogOut />
        </Button>
      </form>
      <div className="flex flex-col flex-1 h-full min-h-0">
        <RecipientSearchInput
          value={recipient}
          onChange={setRecipient}
          required
        />
        <div className="flex flex-1 items-center justify-center">
          <p
            className="font-bold"
            style={{ fontSize: calculateFontSize(amount) }}
          >
            ${amount}
          </p>
        </div>
        <VirtualKeyboard value={amount} onChangeText={setAmount} />
        <Button
          disabled={
            amount === "0" || amount.endsWith(".") || isLoading || !isValidRecipient
          }
          className="py-7 text-lg font-semibold rounded-full w-full mt-4 disabled:bg-muted disabled:text-muted-foreground"
          onClick={handlePayButtonClick}
        >
          {isLoading ? (
            <>
              <RotateCw className="mr-2 h-4 w-4 animate-spin" />
              Sending...
            </>
          ) : (
            "Pay"
          )}
        </Button>
      </div>
    </>
  );
}
