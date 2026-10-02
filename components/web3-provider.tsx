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

import React, { createContext, useContext, useState, useEffect } from 'react';
import { defineChain, parseGwei, type PublicClient } from 'viem';
import { createPublicClient } from 'viem';
import {
    type P256Credential,
    type BundlerClient,
    type SmartAccount,
    toWebAuthnAccount,
    createBundlerClient,
} from 'viem/account-abstraction';
import {
    WebAuthnMode,
    toCircleSmartAccount,
    toModularTransport,
    toPasskeyTransport,
    toWebAuthnCredential,
    encodeTransfer,
} from '@circle-fin/modular-wallets-core';

export const arcTestnet = defineChain({
    id: 5042002,
    name: 'Arc Testnet',
    nativeCurrency: {
        name: 'USDC',
        symbol: 'USDC',
        decimals: 18,
    },
    rpcUrls: {
        default: {
            http: ['https://rpc.testnet.arc.network'],
        },
    },
    blockExplorers: {
        default: {
            name: 'ArcScan',
            url: 'https://testnet.arcscan.app',
        },
    },
    testnet: true,
});

// USDC on Arc Testnet (native gas token with ERC-20 interface)
const USDC_ADDRESS = '0x3600000000000000000000000000000000000000';
const USDC_DECIMALS = 6;

type SignTypedDataParameters = Parameters<SmartAccount['signTypedData']>[0];

interface Account {
    smartAccount: SmartAccount | null;
    address: string | null;
    bundlerClient: BundlerClient | null;
    publicClient: PublicClient | null;
}

interface TokenBalance {
    usdc: string;
    native: string;
}

interface Web3ContextType {
    account: Account;
    isConnected: boolean;
    isInitialized: boolean;
    error: string | null;
    registerPasskey: (username: string) => Promise<unknown>;
    loginWithPasskey: () => Promise<unknown>;
    sendTransaction: (to: string, value: string) => Promise<string | null>;
    sendUSDC: (to: string, amount: string) => Promise<string | null>;
    getUSDCBalance: () => Promise<string | null>;
    balance: TokenBalance;
    refreshBalances: () => Promise<void>;
    signMessage: (message: string) => Promise<string | null>;
    signTypedData: (data: SignTypedDataParameters) => Promise<string | null>;
    getAddress: () => Promise<string | null>;
}

const initialBalance: TokenBalance = { usdc: '0', native: '0' };

const emptyAccount: Account = {
    smartAccount: null,
    address: null,
    bundlerClient: null,
    publicClient: null,
};

const Web3Context = createContext<Web3ContextType>({
    account: emptyAccount,
    isConnected: false,
    isInitialized: false,
    error: null,
    registerPasskey: async () => { },
    loginWithPasskey: async () => { },
    sendTransaction: async () => null,
    sendUSDC: async () => null,
    getUSDCBalance: async () => null,
    balance: initialBalance,
    refreshBalances: async () => { },
    signMessage: async () => null,
    signTypedData: async () => null,
    getAddress: async () => null,
});

export const useWeb3 = () => useContext(Web3Context);

export const Web3Provider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [account, setAccount] = useState<Account>(emptyAccount);
    const [isConnected, setIsConnected] = useState<boolean>(false);
    const [isInitialized, setIsInitialized] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [credential, setCredential] = useState<P256Credential | null>(null);
    const [balance, setBalance] = useState<TokenBalance>(initialBalance);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const clientKey = process.env.NEXT_PUBLIC_CIRCLE_CLIENT_KEY as string;
        const clientUrl = process.env.NEXT_PUBLIC_CIRCLE_CLIENT_URL as string;

        if (!clientKey || !clientUrl) {
            console.error('Missing Circle API configuration');
            setError('Missing Circle API configuration');
            setIsInitialized(true);
            return;
        }

        const passkeyTransport = toPasskeyTransport(clientUrl, clientKey);

        const loadCredential = async () => {
            try {
                const response = await fetch(`/api/get-credential`, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    credentials: 'include',
                });

                if (!response.ok) {
                    return null;
                }

                const data = await response.json();

                if (data?.credential?.length > 0 && data.credential[0].passkey_credential) {
                    const parsedCredential = JSON.parse(data.credential[0].passkey_credential) as P256Credential;
                    setCredential(parsedCredential);
                    return parsedCredential;
                }
            } catch (e) {
                console.error('Error loading credential from database:', e);
            }
            return null;
        };

        const initializeChain = async (
            credentialData: P256Credential
        ): Promise<Account> => {
            try {
                const modularTransport = toModularTransport(
                    `${clientUrl}/arcTestnet`,
                    clientKey
                );

                const publicClient = createPublicClient({
                    chain: arcTestnet,
                    transport: modularTransport,
                });

                const webAuthnAccount = toWebAuthnAccount({
                    credential: credentialData
                });

                const circleAccount = await toCircleSmartAccount({
                    client: publicClient,
                    owner: webAuthnAccount,
                });

                const bundlerClient = createBundlerClient({
                    account: circleAccount,
                    chain: arcTestnet,
                    transport: modularTransport,
                    userOperation: {
                        async estimateFeesPerGas({ account, bundlerClient, userOperation }) {
                            const MIN_PRIORITY_FEE = parseGwei('1');
                            const fees = await bundlerClient.request({
                                // Pimlico-specific method, not in viem's bundler RPC schema
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                method: 'pimlico_getUserOperationGasPrice' as any,
                            }).catch(() => null);

                            if (fees) {
                                const { fast } = fees as unknown as {
                                    fast: { maxFeePerGas: string; maxPriorityFeePerGas: string };
                                };
                                return {
                                    maxFeePerGas: BigInt(fast.maxFeePerGas),
                                    maxPriorityFeePerGas: BigInt(fast.maxPriorityFeePerGas) < MIN_PRIORITY_FEE
                                        ? MIN_PRIORITY_FEE
                                        : BigInt(fast.maxPriorityFeePerGas),
                                };
                            }

                            const block = await publicClient.getBlock();
                            const baseFee = block.baseFeePerGas ?? parseGwei('48');
                            return {
                                maxFeePerGas: baseFee * BigInt(2) + MIN_PRIORITY_FEE,
                                maxPriorityFeePerGas: MIN_PRIORITY_FEE,
                            };
                        },
                    },
                });

                const address = circleAccount.address;
                return {
                    smartAccount: circleAccount,
                    address,
                    bundlerClient,
                    publicClient
                };
            } catch (error) {
                console.error('Error initializing Arc chain:', error);
                return emptyAccount;
            }
        };

        const initializeWeb3 = async (credentialData: P256Credential) => {
            try {
                setError(null);

                const accountData = await initializeChain(credentialData);

                setAccount(accountData);
                setIsConnected(!!accountData.address);

                if (accountData.address) {
                    setTimeout(async () => {
                        try {
                            await fetchBalances(accountData);
                        } catch (error) {
                            console.error('Error fetching initial balances:', error);
                        }
                    }, 500);
                }
            } catch (error) {
                console.error('Error initializing Web3:', error);
                setError(error instanceof Error ? error.message : 'Failed to initialize Web3');
            } finally {
                setIsInitialized(true);
            }
        };

        const fetchBalances = async (accountData: Account) => {
            const newBalance = { ...initialBalance };

            if (accountData.address && accountData.publicClient) {
                try {
                    const address = accountData.address as `0x${string}`;
                    const nativeBalance = await accountData.publicClient.getBalance({
                        address
                    });

                    newBalance.native = (Number(nativeBalance) / 1e18).toString();

                    try {
                        const result = await accountData.publicClient.readContract({
                            address: USDC_ADDRESS,
                            abi: [{
                                name: 'balanceOf',
                                type: 'function',
                                stateMutability: 'view',
                                inputs: [{ name: 'account', type: 'address' }],
                                outputs: [{ name: '', type: 'uint256' }],
                            }],
                            functionName: 'balanceOf',
                            args: [address]
                        });

                        const divisor = 10 ** USDC_DECIMALS;
                        newBalance.usdc = (Number(result) / divisor).toString();
                    } catch (error) {
                        console.error('Error fetching USDC balance:', error);
                        newBalance.usdc = balance.usdc;
                    }
                } catch (error) {
                    console.error('Error fetching balances:', error);
                }
            }

            setBalance(newBalance);
        };

        const registerPasskey = async (username: string) => {
            try {
                setError(null);

                const newCredential = await toWebAuthnCredential({
                    transport: passkeyTransport,
                    mode: WebAuthnMode.Register,
                    username,
                });

                setCredential(newCredential);

                await initializeWeb3(newCredential);

                // Registration and login persist the same wallets.passkey_credential, so they share this route.
                const response = await fetch(`/api/update-login-credential`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        credential: JSON.stringify(newCredential)
                    })
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(`Failed to save credential to database: ${errorData.error || response.status}`);
                }

                return newCredential;
            } catch (error) {
                console.error('Error registering passkey:', error);
                setError(error instanceof Error ? error.message : 'Failed to register passkey');
                throw error;
            }
        };

        const loginWithPasskey = async () => {
            try {
                setError(null);

                const newCredential = await toWebAuthnCredential({
                    transport: passkeyTransport,
                    mode: WebAuthnMode.Login,
                });

                setCredential(newCredential);

                await initializeWeb3(newCredential);

                try {
                    const response = await fetch(`/api/update-login-credential`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            credential: JSON.stringify(newCredential)
                        })
                    });

                    if (!response.ok) {
                        console.warn('Failed to update credential in database on login');
                    }
                } catch (error) {
                    console.warn('Error updating credential in database on login:', error);
                }

                return newCredential;
            } catch (error) {
                console.error('Error logging in with passkey:', error);
                setError(error instanceof Error ? error.message : 'Failed to login with passkey');
                throw error;
            }
        };

        const refreshBalances = async () => {
            await fetchBalances(account);
        };

        setContextMethods({
            registerPasskey,
            loginWithPasskey,
            refreshBalances
        });

        const initializeFromDatabase = async () => {
            try {
                const credentialData = await loadCredential();

                if (credentialData) {
                    await initializeWeb3(credentialData);
                } else {
                    setIsInitialized(true);
                }
            } catch (error) {
                console.error('Error during initialization:', error);
                setError(error instanceof Error ? error.message : 'Failed to initialize');
                setIsInitialized(true);
            }
        };

        initializeFromDatabase();
    }, []);

    const [contextMethods, setContextMethods] = useState<{
        registerPasskey: (username: string) => Promise<unknown>;
        loginWithPasskey: () => Promise<unknown>;
        refreshBalances: () => Promise<void>;
    }>({
        registerPasskey: async () => {
            throw new Error('Not initialized yet');
        },
        loginWithPasskey: async () => {
            throw new Error('Not initialized yet');
        },
        refreshBalances: async () => {
            throw new Error('Not initialized yet');
        }
    });

    const getAddress = async (): Promise<string | null> => {
        if (!account.address) {
            setError('Account not initialized');
            return null;
        }

        return account.address;
    };

    const sendTransaction = async (to: string, value: string): Promise<string | null> => {
        if (!account.bundlerClient || !account.smartAccount) {
            setError('Account not initialized');
            return null;
        }

        try {
            const valueInWei = BigInt(Math.floor(parseFloat(value) * 1e18));

            const userOpHash = await account.bundlerClient.sendUserOperation({
                calls: [{
                    to: to as `0x${string}`,
                    value: valueInWei,
                    data: '0x' as `0x${string}`
                }],
                paymaster: true,
            });

            const { receipt } = await account.bundlerClient.waitForUserOperationReceipt({
                hash: userOpHash,
            });

            contextMethods.refreshBalances().catch(err => {
                console.error('Failed to refresh balances after transaction:', err);
            });

            return receipt.transactionHash;
        } catch (error) {
            console.error('Error sending transaction:', error);
            setError(error instanceof Error ? error.message : 'Failed to send transaction');
            return null;
        }
    };

    const sendUSDC = async (to: string, amount: string): Promise<string | null> => {
        if (!account.bundlerClient || !account.smartAccount) {
            setError('Account not initialized');
            return null;
        }

        try {
            const tokenAmount = BigInt(Math.floor(parseFloat(amount) * (10 ** USDC_DECIMALS)));

            const userOpHash = await account.bundlerClient.sendUserOperation({
                calls: [
                    encodeTransfer(
                        to as `0x${string}`,
                        USDC_ADDRESS as `0x${string}`,
                        tokenAmount
                    )
                ],
                paymaster: true,
            });

            const { receipt } = await account.bundlerClient.waitForUserOperationReceipt({
                hash: userOpHash,
            });

            contextMethods.refreshBalances().catch(err => {
                console.error('Failed to refresh balances after USDC transfer:', err);
            });

            return receipt.transactionHash;
        } catch (error) {
            console.error('Error sending USDC:', error);
            setError(error instanceof Error ? error.message : 'Failed to send USDC');
            return null;
        }
    };

    const getUSDCBalance = async (): Promise<string | null> => {
        return balance.usdc;
    };

    const signMessage = async (message: string): Promise<string | null> => {
        if (!account.smartAccount) {
            setError('Account not initialized');
            return null;
        }

        try {
            const signature = await account.smartAccount.signMessage({
                message
            });

            return signature;
        } catch (error) {
            console.error('Error signing message:', error);
            setError(error instanceof Error ? error.message : 'Failed to sign message');
            return null;
        }
    };

    const signTypedData = async (data: SignTypedDataParameters): Promise<string | null> => {
        if (!account.smartAccount) {
            setError('Account not initialized');
            return null;
        }

        try {
            const signature = await account.smartAccount.signTypedData(data);
            return signature;
        } catch (error) {
            console.error('Error signing typed data:', error);
            setError(error instanceof Error ? error.message : 'Failed to sign typed data');
            return null;
        }
    };

    const contextValue: Web3ContextType = {
        account,
        isConnected,
        isInitialized,
        error,
        registerPasskey: contextMethods.registerPasskey,
        loginWithPasskey: contextMethods.loginWithPasskey,
        sendTransaction,
        sendUSDC,
        getUSDCBalance,
        balance,
        refreshBalances: contextMethods.refreshBalances,
        signMessage,
        signTypedData,
        getAddress,
    };

    return (
        <Web3Context.Provider value={contextValue}>
            {children}
        </Web3Context.Provider>
    );
};
