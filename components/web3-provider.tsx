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
import { defineChain, parseGwei } from 'viem';
import { createPublicClient } from 'viem';
import {
    type P256Credential,
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

// Arc Testnet chain definition
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

interface Account {
    smartAccount: SmartAccount | null;
    address: string | null;
    bundlerClient: any | null;
    publicClient: any | null;
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
    registerPasskey: (username: string) => Promise<void>;
    loginWithPasskey: () => Promise<void>;
    sendTransaction: (to: string, value: string) => Promise<string | null>;
    sendUSDC: (to: string, amount: string) => Promise<string | null>;
    getUSDCBalance: () => Promise<string | null>;
    balance: TokenBalance;
    refreshBalances: () => Promise<void>;
    signMessage: (message: string) => Promise<string | null>;
    signTypedData: (data: any) => Promise<string | null>;
    getAddress: () => Promise<string | null>;
}

const initialBalance: TokenBalance = { usdc: '0', native: '0' };

const emptyAccount: Account = {
    smartAccount: null,
    address: null,
    bundlerClient: null,
    publicClient: null,
};

// Create context
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

// Hook to use the Web3 context
export const useWeb3 = () => useContext(Web3Context);

const baseUrl = process.env.NEXT_PUBLIC_VERCEL_URL
    ? process.env.NEXT_PUBLIC_VERCEL_URL
    : "http://localhost:3000";

// Provider component
export const Web3Provider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [account, setAccount] = useState<Account>(emptyAccount);
    const [isConnected, setIsConnected] = useState<boolean>(false);
    const [isInitialized, setIsInitialized] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [credential, setCredential] = useState<P256Credential | null>(null);
    const [balance, setBalance] = useState<TokenBalance>(initialBalance);

    // This effect runs only on the client side
    useEffect(() => {
        // Only run in browser environment
        if (typeof window === 'undefined') return;

        // Get env variables - safe to access on client side
        const clientKey = process.env.NEXT_PUBLIC_CIRCLE_CLIENT_KEY as string;
        const clientUrl = process.env.NEXT_PUBLIC_CIRCLE_CLIENT_URL as string;

        if (!clientKey || !clientUrl) {
            console.error('Missing Circle API configuration');
            setError('Missing Circle API configuration');
            setIsInitialized(true);
            return;
        }

        // Create Circle passkey transport
        const passkeyTransport = toPasskeyTransport(clientUrl, clientKey);

        // Function to load credential from database
        const loadCredential = async () => {
            try {
                // Fetch credential from the API
                const response = await fetch(`${baseUrl}/api/get-credential`, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    // Include credentials for auth cookies
                    credentials: 'include',
                });

                if (!response.ok) {
                    return null;
                }

                const data = await response.json();

                // If credential exists in the response
                if (data?.credential?.length > 0 && data.credential[0].passkey_credential) {
                    // Parse the credential string from the database
                    const parsedCredential = JSON.parse(data.credential[0].passkey_credential) as P256Credential;
                    setCredential(parsedCredential);
                    return parsedCredential;
                }
            } catch (e) {
                console.error('Error loading credential from database:', e);
            }
            return null;
        };

        // Initialize client for Arc chain - client side only
        const initializeChain = async (
            credentialData: P256Credential
        ): Promise<Account> => {
            try {
                // Create modular transport for Arc
                const modularTransport = toModularTransport(
                    `${clientUrl}/arcTestnet`,
                    clientKey
                );

                // Create public client
                const publicClient = createPublicClient({
                    chain: arcTestnet,
                    transport: modularTransport,
                });

                // Create WebAuthn account
                const webAuthnAccount = toWebAuthnAccount({
                    credential: credentialData
                });

                // Create Circle smart account
                const circleAccount = await toCircleSmartAccount({
                    client: publicClient,
                    owner: webAuthnAccount,
                });

                // Create bundler client with Arc's minimum gas fee requirements
                const bundlerClient = createBundlerClient({
                    account: circleAccount,
                    chain: arcTestnet,
                    transport: modularTransport,
                    userOperation: {
                        async estimateFeesPerGas({ account, bundlerClient, userOperation }) {
                            const MIN_PRIORITY_FEE = parseGwei('1');
                            // Get the fee estimate from the bundler
                            const fees = await bundlerClient.request({
                                method: 'pimlico_getUserOperationGasPrice' as any,
                            }).catch(() => null);

                            if (fees) {
                                const fast = (fees as any).fast;
                                return {
                                    maxFeePerGas: BigInt(fast.maxFeePerGas),
                                    maxPriorityFeePerGas: BigInt(fast.maxPriorityFeePerGas) < MIN_PRIORITY_FEE
                                        ? MIN_PRIORITY_FEE
                                        : BigInt(fast.maxPriorityFeePerGas),
                                };
                            }

                            // Fallback: use the public client's fee estimation with floor
                            const block = await publicClient.getBlock();
                            const baseFee = block.baseFeePerGas ?? parseGwei('48');
                            return {
                                maxFeePerGas: baseFee * BigInt(2) + MIN_PRIORITY_FEE,
                                maxPriorityFeePerGas: MIN_PRIORITY_FEE,
                            };
                        },
                    },
                });

                // Get address
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

                // Fetch balances after initialization
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

        // Fetch balances using viem client
        const fetchBalances = async (accountData: Account) => {
            const newBalance = { ...initialBalance };

            if (accountData.address && accountData.publicClient) {
                try {
                    // Native token balance (USDC as gas on Arc)
                    const nativeBalance = await accountData.publicClient.getBalance({
                        address: accountData.address
                    });

                    newBalance.native = (Number(nativeBalance) / 1e18).toString();

                    // USDC ERC-20 balance
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
                            args: [accountData.address]
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

        // Register a new passkey
        const registerPasskey = async (username: string) => {
            try {
                setError(null);

                const newCredential = await toWebAuthnCredential({
                    transport: passkeyTransport,
                    mode: WebAuthnMode.Register,
                    username,
                });

                // Set credential in state directly
                setCredential(newCredential);

                // Initialize with the new credential
                await initializeWeb3(newCredential);

                // Save the credential to the database via API
                const response = await fetch(`${baseUrl}/api/update-passkey`, {
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

        // Login with existing passkey
        const loginWithPasskey = async () => {
            try {
                setError(null);

                const newCredential = await toWebAuthnCredential({
                    transport: passkeyTransport,
                    mode: WebAuthnMode.Login,
                });

                // Set the credential in state directly
                setCredential(newCredential);

                // Initialize with the retrieved credential
                await initializeWeb3(newCredential);

                // Save or update the credential in the database
                try {
                    const response = await fetch(`${baseUrl}/api/update-login-credential`, {
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

        // Refresh balances
        const refreshBalances = async () => {
            await fetchBalances(account);
        };

        // Set context methods
        setContextMethods({
            registerPasskey,
            loginWithPasskey,
            refreshBalances
        });

        // Async initialization function
        const initializeFromDatabase = async () => {
            try {
                // Load credential from database via API
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

        // Start the initialization process
        initializeFromDatabase();
    }, []);

    // State to hold methods created in the useEffect
    const [contextMethods, setContextMethods] = useState<{
        registerPasskey: (username: string) => Promise<any>;
        loginWithPasskey: () => Promise<any>;
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

    // Get address
    const getAddress = async (): Promise<string | null> => {
        if (!account.address) {
            setError('Account not initialized');
            return null;
        }

        return account.address;
    };

    // Send native token transaction
    const sendTransaction = async (to: string, value: string): Promise<string | null> => {
        if (!account.bundlerClient || !account.smartAccount) {
            setError('Account not initialized');
            return null;
        }

        try {
            // Convert value from USDC to wei (18 decimals for native)
            const valueInWei = BigInt(Math.floor(parseFloat(value) * 1e18));

            // Send the transaction using userOp
            const userOpHash = await account.bundlerClient.sendUserOperation({
                calls: [{
                    to: to as `0x${string}`,
                    value: valueInWei,
                    data: '0x' as `0x${string}`
                }],
                paymaster: true,
            });

            // Wait for the transaction receipt
            const { receipt } = await account.bundlerClient.waitForUserOperationReceipt({
                hash: userOpHash,
            });

            // Refresh balances after successful transaction
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

    // Send USDC tokens
    const sendUSDC = async (to: string, amount: string): Promise<string | null> => {
        if (!account.bundlerClient || !account.smartAccount) {
            setError('Account not initialized');
            return null;
        }

        try {
            // Convert amount to token units (6 decimals for ERC-20)
            const tokenAmount = BigInt(Math.floor(parseFloat(amount) * (10 ** USDC_DECIMALS)));

            // Send the token transfer using userOp with encodeTransfer
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

            // Wait for the transaction receipt
            const { receipt } = await account.bundlerClient.waitForUserOperationReceipt({
                hash: userOpHash,
            });

            // Refresh balances after successful transaction
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

    // Get USDC balance
    const getUSDCBalance = async (): Promise<string | null> => {
        return balance.usdc;
    };

    // Sign a message
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

    // Sign typed data according to EIP-712
    const signTypedData = async (data: any): Promise<string | null> => {
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
