-- Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
--
-- Licensed under the Apache License, Version 2.0 (the "License");
-- you may not use this file except in compliance with the License.
-- You may obtain a copy of the License at
--
--     http://www.apache.org/licenses/LICENSE-2.0
--
-- Unless required by applicable law or agreed to in writing, software
-- distributed under the License is distributed on an "AS IS" BASIS,
-- WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
-- See the License for the specific language governing permissions and
-- limitations under the License.
--
-- SPDX-License-Identifier: Apache-2.0

-- Restrict what signed-in users can WRITE to wallets, profiles and transactions.
--
-- The RLS added in 20260916210000 scoped reads well, but left three ways to attack
-- other users through their own rows:
--
--   * Wallet address: nothing stopped a user registering ANOTHER user's address as their
--     own. Senders pay whatever address the recipient's row holds, and the Circle webhook
--     attributes a transfer to the first wallet it finds for an address, so the attacker
--     could receive the victim's transaction history (and confuse who is who).
--   * Wallet balance: the cached balance could be set by the wallet's owner.
--   * Transactions: users could rewrite status and amount on their own history rows.
--   * Profile email: identifies a user to others, and was user-editable.
--
-- Balance and email are now written only by server code with the secret key.

-- ===========================================================================
-- wallets
-- ===========================================================================

-- One wallet per address per chain, case-insensitively. Addresses are stored
-- lower-cased by the app, but rows written earlier may not be. If this fails,
-- two rows already share an address: resolve them, then re-run.
CREATE UNIQUE INDEX IF NOT EXISTS wallets_blockchain_address_key
ON public.wallets (blockchain, lower(wallet_address))
WHERE wallet_address IS NOT NULL;

-- New wallets start with no balance.
DROP POLICY IF EXISTS "Users can create own wallets" ON public.wallets;

CREATE POLICY "Users can create own wallets" ON public.wallets
    FOR INSERT TO authenticated
    WITH CHECK (
        profile_id IN (
            SELECT id FROM public.profiles WHERE auth_user_id = (SELECT auth.uid())
        )
        AND COALESCE(balance, 0) = 0
    );

-- Users may change only what the passkey setup flow writes.
REVOKE UPDATE ON public.wallets FROM anon, authenticated;
GRANT UPDATE (wallet_address, passkey_credential, circle_wallet_id, updated_at)
ON public.wallets TO authenticated;

-- ===========================================================================
-- transactions
-- ===========================================================================

-- Users record their own history (insert) but never change one afterwards. The
-- Circle webhook updates statuses with the secret key.
DROP POLICY IF EXISTS "Users can update own transactions" ON public.transactions;

REVOKE UPDATE ON public.transactions FROM anon, authenticated;

-- ===========================================================================
-- profiles
-- ===========================================================================

-- Profiles are created by the signup trigger. A user-created one must not carry an
-- email, which is server-owned.
DROP POLICY IF EXISTS "Users can create own profile" ON public.profiles;

CREATE POLICY "Users can create own profile" ON public.profiles
    FOR INSERT TO authenticated
    WITH CHECK (auth_user_id = (SELECT auth.uid()) AND email IS NULL);

-- Identity columns (auth_user_id, email, is_active) are set by the server.
REVOKE UPDATE ON public.profiles FROM anon, authenticated;
GRANT UPDATE (name, full_name, company_name, username, updated_at)
ON public.profiles TO authenticated;
