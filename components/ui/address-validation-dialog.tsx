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

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Check } from "lucide-react";
import { useState, useEffect } from "react";

interface AddressValidationDialogProps {
    open: boolean;
    onOpenChange: (value: boolean) => void;
    address: string;
    onConfirm: () => void;
    onCancel: () => void;
}

export default function AddressValidationDialog({
    open,
    onOpenChange,
    address,
    onConfirm,
    onCancel,
}: AddressValidationDialogProps) {
    const [isValidAddress, setIsValidAddress] = useState<boolean | null>(null);
    const [isChecking, setIsChecking] = useState(false);
    const [addressType, setAddressType] = useState<string | null>(null);

    useEffect(() => {
        if (open && address) {
            validateAddress(address);
        }
    }, [open, address]);

    const validateAddress = async (addr: string) => {
        setIsChecking(true);

        try {
            const isEthereumAddress = /^0x[a-fA-F0-9]{40}$/.test(addr);
            setIsValidAddress(isEthereumAddress);
            setAddressType(isEthereumAddress ? "EOA (Regular Account)" : "Invalid Format");
        } catch (error) {
            console.error("Error validating address:", error);
            setIsValidAddress(false);
        } finally {
            setIsChecking(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center">
                        {isValidAddress === true ? (
                            <Check className="h-5 w-5 mr-2 text-green-500" />
                        ) : (
                            <AlertTriangle className="h-5 w-5 mr-2 text-yellow-500" />
                        )}
                        Address Validation
                    </DialogTitle>
                    <DialogDescription>
                        Please confirm the recipient address details before proceeding
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <p className="text-sm font-medium">Recipient Address:</p>
                        <p className="text-sm bg-gray-100 p-2 rounded-md break-all dark:bg-gray-800">
                            {address}
                        </p>
                    </div>

                    <div className="space-y-2">
                        <p className="text-sm font-medium">Validation Status:</p>
                        <p className={`text-sm font-medium ${isValidAddress ? 'text-green-500' : 'text-red-500'}`}>
                            {isChecking ? 'Checking...' : isValidAddress ? 'Valid Address' : 'Invalid or Suspicious Address'}
                        </p>
                    </div>

                    {addressType && (
                        <div className="space-y-2">
                            <p className="text-sm font-medium">Address Type:</p>
                            <p className="text-sm">{addressType}</p>
                        </div>
                    )}

                    {!isValidAddress && !isChecking && (
                        <div className="bg-yellow-50 p-3 rounded-md dark:bg-yellow-900/20">
                            <p className="text-sm text-yellow-800 dark:text-yellow-200">
                                Warning: This address appears to be invalid or does not follow the standard Ethereum address format.
                                Please double-check before proceeding.
                            </p>
                        </div>
                    )}
                </div>

                <DialogFooter className="flex flex-col sm:flex-row sm:justify-between gap-2">
                    <Button
                        variant="outline"
                        onClick={onCancel}
                        className="sm:w-auto w-full"
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={onConfirm}
                        disabled={isChecking || isValidAddress === false}
                        className={`sm:w-auto w-full ${!isValidAddress && !isChecking ? 'bg-red-500 hover:bg-red-600' : ''}`}
                    >
                        {isValidAddress === false ? "Send Anyway (Not Recommended)" : "Confirm Send"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}