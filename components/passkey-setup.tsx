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

'use client';

import { useState } from 'react';
import {
    WebAuthnMode,
    toPasskeyTransport,
    toWebAuthnCredential,
} from '@circle-fin/modular-wallets-core';
import { Button } from "@/components/ui/button";
import { useRouter } from 'next/navigation';
import { createPublicClient } from 'viem';
import {
    toWebAuthnAccount,
} from 'viem/account-abstraction';
import {
    toCircleSmartAccount,
    toModularTransport,
} from '@circle-fin/modular-wallets-core';
import { arcTestnet } from '@/components/web3-provider';

interface PasskeySetupProps {
    username: string;
}

export function PasskeySetup({ username }: PasskeySetupProps) {
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    const clientKey = process.env.NEXT_PUBLIC_CIRCLE_CLIENT_KEY;
    const clientUrl = process.env.NEXT_PUBLIC_CIRCLE_CLIENT_URL;

    const passkeyTransport = typeof window !== 'undefined'
        ? toPasskeyTransport(clientUrl, clientKey)
        : null;

    const setupPasskey = async () => {
        if (!passkeyTransport) {
            setError("Browser environment not available");
            return;
        }

        setIsCreating(true);
        setError(null);

        try {
            const credential = await toWebAuthnCredential({
                transport: passkeyTransport,
                mode: WebAuthnMode.Register,
                username,
            });

            let circleAddress;
            try {
                const webAuthnAccount = toWebAuthnAccount({
                    credential
                });

                const modularTransport = toModularTransport(
                    `${clientUrl}/arcTestnet`,
                    clientKey
                );

                const publicClient = createPublicClient({
                    chain: arcTestnet,
                    transport: modularTransport,
                });

                const circleAccount = await toCircleSmartAccount({
                    client: publicClient,
                    owner: webAuthnAccount,
                });

                circleAddress = circleAccount.address.toLowerCase();
            } catch (e) {
                console.warn("Could not get Circle address:", e);
            }

            const response = await fetch('/api/setup-wallets', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    credential: JSON.stringify(credential),
                    circleAddress
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to set up wallet');
            }

            await new Promise(resolve => setTimeout(resolve, 1000));

            try {
                const responseData = await response.json();
            } catch (e) {
                console.warn("Could not parse response JSON", e);
            }

            window.location.href = '/dashboard';
        } catch (err) {
            console.error("Passkey creation failed:", err);
            setError(err instanceof Error ? err.message : 'Failed to create passkey');
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center gap-4 p-6">
            <h2 className="text-xl font-semibold">Set Up Your Wallet with Passkey</h2>
            <p className="text-muted-foreground text-center max-w-md">
                Set up your wallet using a passkey for enhanced security.
                This allows you to sign transactions with biometric authentication.
            </p>

            {error && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                    {error}
                </div>
            )}

            <Button
                onClick={setupPasskey}
                disabled={isCreating}
                className="w-full max-w-xs"
            >
                {isCreating ? 'Setting up passkey...' : 'Set up with passkey'}
            </Button>

            <Button
                variant="outline"
                onClick={() => router.push('/dashboard')}
                className="w-full max-w-xs"
            >
                Skip for now
            </Button>
        </div>
    );
}
