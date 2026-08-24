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

-- Schema housekeeping ahead of deployments: align row level security with
-- the initial schema (20241112172956_create_initial_schema.sql), adapted to
-- the current profiles/wallets/transactions shape (profiles.auth_user_id,
-- wallets.profile_id, transactions.profile_id). Also adds a read-only
-- wallet directory used by recipient search, so table policies can stay
-- scoped to the row owner. Server-side jobs that run without a user session
-- (e.g. webhook processing) use the service-role client instead.

-- Helper to resolve the signed-in user's profile id.
CREATE OR REPLACE FUNCTION public.current_profile_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
SELECT id
FROM public.profiles
WHERE auth_user_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.current_profile_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_profile_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_profile_id() TO service_role;

-- Re-enable RLS on application tables.
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Profiles: active profiles stay readable to signed-in users (recipient
-- search and profile embeds rely on this, matching the initial schema's
-- "viewable by everyone" intent); rows are only writable by their owner.
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON profiles;
CREATE POLICY "Profiles are viewable by authenticated users" ON profiles
    FOR SELECT TO authenticated USING (is_active = true);
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile" ON profiles
    FOR INSERT TO authenticated WITH CHECK (auth_user_id = auth.uid());
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE TO authenticated USING (auth_user_id = auth.uid());

-- Wallets: rows are only visible to and writable by their owner. Lookups of
-- other users' wallet addresses go through the wallet_directory view below.
DROP POLICY IF EXISTS "Users can view own wallets" ON wallets;
CREATE POLICY "Users can view own wallets" ON wallets
    FOR SELECT TO authenticated USING (profile_id = public.current_profile_id());
DROP POLICY IF EXISTS "Users can insert own wallets" ON wallets;
CREATE POLICY "Users can insert own wallets" ON wallets
    FOR INSERT TO authenticated WITH CHECK (profile_id = public.current_profile_id());
DROP POLICY IF EXISTS "Users can update own wallets" ON wallets;
CREATE POLICY "Users can update own wallets" ON wallets
    FOR UPDATE TO authenticated USING (profile_id = public.current_profile_id());

-- Transactions: rows tied to the user's profile or wallets are readable;
-- clients may record entries for their own wallets (chain sync in the
-- transactions view). Entries for counterparties and webhook updates are
-- written by the server with the service-role client.
DROP POLICY IF EXISTS "Users can view own transactions" ON transactions;
CREATE POLICY "Users can view own transactions" ON transactions
    FOR SELECT TO authenticated USING (
        profile_id = public.current_profile_id()
        OR wallet_id IN (
            SELECT id
            FROM public.wallets
            WHERE profile_id = public.current_profile_id()
        )
    );
DROP POLICY IF EXISTS "Users can insert own transactions" ON transactions;
CREATE POLICY "Users can insert own transactions" ON transactions
    FOR INSERT TO authenticated WITH CHECK (
        wallet_id IN (
            SELECT id
            FROM public.wallets
            WHERE profile_id = public.current_profile_id()
        )
    );

-- Read-only directory for recipient search: exposes only the fields the
-- search UI displays. The view runs with definer rights, so keep this
-- column list deliberately small.
CREATE OR REPLACE VIEW public.wallet_directory AS
SELECT w.profile_id,
    w.wallet_address,
    w.blockchain,
    p.auth_user_id,
    p.name,
    p.email,
    p.username
FROM public.wallets w
    JOIN public.profiles p ON p.id = w.profile_id
WHERE w.is_active = true
    AND p.is_active = true;
REVOKE ALL ON public.wallet_directory FROM PUBLIC;
REVOKE ALL ON public.wallet_directory FROM anon;
GRANT SELECT ON public.wallet_directory TO authenticated;
GRANT SELECT ON public.wallet_directory TO service_role;

-- Refresh table comments left by 20241112173214.
COMMENT ON TABLE profiles IS 'Row level security enabled; aligned with initial schema.';
COMMENT ON TABLE wallets IS 'Row level security enabled; aligned with initial schema.';
COMMENT ON TABLE transactions IS 'Row level security enabled; aligned with initial schema.';
COMMENT ON VIEW public.wallet_directory IS 'Read-only recipient lookup for signed-in users.';
