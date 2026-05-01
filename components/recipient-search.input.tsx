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

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search, X, Wallet, UserX } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser-client';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

interface RecipientSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}

interface UserWallet {
  id: string;
  email: string;
  name?: string;
  wallet_address: string;
  blockchain: string;
}

interface RecentRecipient {
  wallet_address: string;
  name?: string;
  isExternal: boolean;
}

function getInitials(name?: string): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function RecipientSearchInput({
  value,
  onChange,
}: RecipientSearchInputProps): React.ReactNode {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserWallet[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserWallet | null>(null);
  const [recentRecipients, setRecentRecipients] = useState<RecentRecipient[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const validateAddress = (address: string): boolean => {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  };

  // Clear selection when parent resets value
  useEffect(() => {
    if (!value) {
      setSelectedUser(null);
    }
  }, [value]);

  // Fetch recent recipients from outbound transactions
  useEffect(() => {
    const fetchRecentRecipients = async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('auth_user_id', user.id)
          .single();
        if (!profile) return;

        // Get outbound transactions ordered by most recent, with the recipient address
        const { data: outboundTxs } = await supabase
          .from('transactions')
          .select('circle_contract_address, created_at')
          .eq('profile_id', profile.id)
          .in('transaction_type', ['USDC_TRANSFER_OUT', 'OUTBOUND', 'sent'])
          .not('circle_contract_address', 'is', null)
          .order('created_at', { ascending: false });

        if (!outboundTxs || outboundTxs.length === 0) return;

        // Deduplicate by address, keep most recent first, limit to 10
        const seen = new Set<string>();
        const uniqueAddresses: string[] = [];
        for (const tx of outboundTxs) {
          const addr = tx.circle_contract_address?.toLowerCase();
          if (addr && !seen.has(addr)) {
            seen.add(addr);
            uniqueAddresses.push(tx.circle_contract_address);
            if (uniqueAddresses.length >= 10) break;
          }
        }

        // Look up which addresses belong to platform wallets
        const { data: platformWallets } = await supabase
          .from('wallets')
          .select('wallet_address, profiles(name)')
          .in('blockchain', ['ARC', 'ARC-TESTNET']);

        const walletMap = new Map<string, string | undefined>();
        if (platformWallets) {
          for (const w of platformWallets) {
            const profile = w.profiles as any;
            walletMap.set(w.wallet_address.toLowerCase(), profile?.name);
          }
        }

        const recipients: RecentRecipient[] = uniqueAddresses.map((addr) => {
          const name = walletMap.get(addr.toLowerCase());
          return {
            wallet_address: addr,
            name: name || undefined,
            isExternal: !walletMap.has(addr.toLowerCase()),
          };
        });

        setRecentRecipients(recipients);
      } catch (error) {
        console.error('Error fetching recent recipients:', error);
      }
    };

    fetchRecentRecipients();
  }, []);

  const searchUsers = useCallback(
    async (query: string): Promise<void> => {
      if (query.length < 2) {
        setSearchResults([]);
        return;
      }

      setIsLoading(true);

      try {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        const { data: walletsWithProfiles, error } = await supabase
          .from('wallets')
          .select(
            'wallet_address, blockchain, profile_id, profiles(id, auth_user_id, name, email)'
          )
          .in('blockchain', ['ARC', 'ARC-TESTNET']);

        if (error) {
          console.error('Error fetching wallets with profiles:', error);
          return;
        }

        const queryLower = query.toLowerCase();
        const results: UserWallet[] = (walletsWithProfiles ?? [])
          .filter((w) => {
            const profile = w.profiles as any;
            if (!profile || profile.auth_user_id === user?.id) return false;
            return (
              (profile.name &&
                profile.name.toLowerCase().includes(queryLower)) ||
              (profile.email &&
                profile.email.toLowerCase().includes(queryLower)) ||
              (w.wallet_address &&
                w.wallet_address.toLowerCase().includes(queryLower))
            );
          })
          .map((w) => {
            const profile = w.profiles as any;
            return {
              id: profile.id,
              email: profile.email,
              name: profile.name,
              wallet_address: w.wallet_address,
              blockchain: w.blockchain,
            };
          });

        setSearchResults(results);
      } catch (error) {
        console.error('Error searching users:', error);
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.length >= 2) {
        searchUsers(searchQuery);
      } else {
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, searchUsers]);

  // Open overlay with entrance animation
  const handleOpen = useCallback(() => {
    setMounted(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setVisible(true);
      });
    });
  }, []);

  // Close overlay with exit animation
  const handleClose = useCallback(() => {
    setVisible(false);
    setTimeout(() => {
      setMounted(false);
      setSearchQuery('');
      setSearchResults([]);
    }, 200);
  }, []);

  const handleSelectUser = (user: UserWallet) => {
    onChange(user.wallet_address);
    setSelectedUser(user);
    handleClose();
  };

  const handleUseRawAddress = (address: string) => {
    onChange(address);
    setSelectedUser(null);
    handleClose();
  };

  const handleClear = () => {
    onChange('');
    setSelectedUser(null);
  };

  const handleSelectRecent = (recipient: RecentRecipient) => {
    onChange(recipient.wallet_address);
    if (!recipient.isExternal && recipient.name) {
      setSelectedUser({
        id: '',
        email: '',
        name: recipient.name,
        wallet_address: recipient.wallet_address,
        blockchain: 'ARC',
      });
    } else {
      setSelectedUser(null);
    }
    handleClose();
  };

  const isRawAddress =
    searchQuery.startsWith('0x') && validateAddress(searchQuery);

  return (
    <>
      {/* Trigger: selected user chip or search button */}
      {selectedUser ? (
        <div className="flex items-center gap-3 rounded-lg border border-input bg-background px-3 py-2">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="text-xs font-medium">
              {getInitials(selectedUser.name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium leading-none">
              {selectedUser.name || selectedUser.email}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {truncateAddress(selectedUser.wallet_address)}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={handleClear}
            type="button"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : value && validateAddress(value) ? (
        <div className="flex items-center gap-3 rounded-lg border border-input bg-background px-3 py-2">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="text-xs">
              <Wallet className="h-4 w-4" />
            </AvatarFallback>
          </Avatar>
          <p className="flex-1 text-sm font-medium">{truncateAddress(value)}</p>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={handleClear}
            type="button"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <Button
          variant="outline"
          className="w-full justify-start gap-2 h-auto py-3 px-3 font-normal text-muted-foreground"
          onClick={handleOpen}
          type="button"
        >
          <Search className="h-4 w-4 shrink-0" />
          Search by name, email, or address
        </Button>
      )}

      {/* Full-screen search overlay with slide-up transition */}
      {mounted && (
        <div
          className={cn(
            'absolute inset-0 z-50 bg-background flex flex-col transition-all duration-200 ease-out',
            visible
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 translate-y-4'
          )}
        >
          <Command
            shouldFilter={false}
            className="flex flex-col h-full"
            onKeyDown={(e) => {
              if (e.key === 'Escape') handleClose();
            }}
          >
            <div className="flex items-center border-b">
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 shrink-0 ml-1"
                onClick={handleClose}
                type="button"
              >
                <X className="h-4 w-4" />
              </Button>
              <div className="flex-1 **:[[cmdk-input-wrapper]]:border-0">
                <CommandInput
                  placeholder="Name, email, or wallet address..."
                  value={searchQuery}
                  onValueChange={setSearchQuery}
                />
              </div>
            </div>

            {recentRecipients.length > 0 && !searchQuery && (
              <div
                ref={scrollRef}
                className="flex gap-4 px-4 py-3 overflow-x-auto border-b [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
              >
                {recentRecipients.map((recipient) => (
                  <button
                    key={recipient.wallet_address}
                    type="button"
                    className="flex flex-col items-center gap-1.5 shrink-0 w-16"
                    onClick={() => handleSelectRecent(recipient)}
                  >
                    <Avatar className="h-14 w-14">
                      <AvatarFallback className="text-sm font-semibold bg-primary text-primary-foreground">
                        {recipient.isExternal ? (
                          <Wallet className="h-5 w-5" />
                        ) : (
                          getInitials(recipient.name)
                        )}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs text-center leading-tight w-full truncate">
                      {recipient.isExternal
                        ? truncateAddress(recipient.wallet_address)
                        : recipient.name?.split(' ')[0]}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <CommandList className="flex-1 max-h-none overflow-y-auto">
              {isLoading && (
                <div className="py-6 text-center text-sm text-muted-foreground animate-in fade-in duration-150">
                  Searching...
                </div>
              )}

              {!isLoading &&
                searchQuery.length >= 2 &&
                searchResults.length === 0 &&
                !isRawAddress && (
                  <CommandEmpty className="animate-in fade-in duration-150 pt-10">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <UserX className="h-10 w-10 opacity-40" />
                      <p className="text-sm font-medium">No users found</p>
                      <p className="text-xs">Try a different name, email, or wallet address</p>
                    </div>
                  </CommandEmpty>
                )}

              {isRawAddress && (
                <CommandGroup heading="Wallet Address" className="animate-in fade-in slide-in-from-bottom-1 duration-150">
                  <CommandItem
                    onSelect={() => handleUseRawAddress(searchQuery)}
                    className="cursor-pointer gap-3 py-3"
                  >
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className="text-xs">
                        <Wallet className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">
                        {truncateAddress(searchQuery)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Use this address
                      </p>
                    </div>
                  </CommandItem>
                </CommandGroup>
              )}

              {searchResults.length > 0 && (
                <CommandGroup heading="People" className="animate-in fade-in slide-in-from-bottom-1 duration-150">
                  {searchResults.map((user) => (
                    <CommandItem
                      key={user.id}
                      onSelect={() => handleSelectUser(user)}
                      className="cursor-pointer gap-3 py-3"
                    >
                      <Avatar className="h-9 w-9">
                        <AvatarFallback className="text-xs font-medium">
                          {getInitials(user.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">
                          {user.name || user.email}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {truncateAddress(user.wallet_address)}
                        </p>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </div>
      )}
    </>
  );
}
