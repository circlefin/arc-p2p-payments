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

-- Turn row level security back on: 20241112173214 disabled it for development.

-- Signed-in users can read all profiles and wallets for recipient search; everything else is their own rows. Secret-key code bypasses these policies.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users can view profiles" ON public.profiles
    FOR SELECT TO authenticated
    USING (true);
CREATE POLICY "Users can create own profile" ON public.profiles
    FOR INSERT TO authenticated
    WITH CHECK (auth_user_id = (SELECT auth.uid()));
CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE TO authenticated
    USING (auth_user_id = (SELECT auth.uid()))
    WITH CHECK (auth_user_id = (SELECT auth.uid()));

CREATE POLICY "Signed-in users can view wallets" ON public.wallets
    FOR SELECT TO authenticated
    USING (true);
CREATE POLICY "Users can create own wallets" ON public.wallets
    FOR INSERT TO authenticated
    WITH CHECK (profile_id IN (
        SELECT id FROM public.profiles WHERE auth_user_id = (SELECT auth.uid())
    ));
CREATE POLICY "Users can update own wallets" ON public.wallets
    FOR UPDATE TO authenticated
    USING (profile_id IN (
        SELECT id FROM public.profiles WHERE auth_user_id = (SELECT auth.uid())
    ))
    WITH CHECK (profile_id IN (
        SELECT id FROM public.profiles WHERE auth_user_id = (SELECT auth.uid())
    ));

CREATE POLICY "Users can view own transactions" ON public.transactions
    FOR SELECT TO authenticated
    USING (profile_id IN (
        SELECT id FROM public.profiles WHERE auth_user_id = (SELECT auth.uid())
    ));
CREATE POLICY "Users can create own transactions" ON public.transactions
    FOR INSERT TO authenticated
    WITH CHECK (profile_id IN (
        SELECT id FROM public.profiles WHERE auth_user_id = (SELECT auth.uid())
    ));
CREATE POLICY "Users can update own transactions" ON public.transactions
    FOR UPDATE TO authenticated
    USING (profile_id IN (
        SELECT id FROM public.profiles WHERE auth_user_id = (SELECT auth.uid())
    ))
    WITH CHECK (profile_id IN (
        SELECT id FROM public.profiles WHERE auth_user_id = (SELECT auth.uid())
    ));

COMMENT ON TABLE public.profiles IS 'User profiles. RLS enabled.';
COMMENT ON TABLE public.wallets IS 'User wallets. RLS enabled.';
COMMENT ON TABLE public.transactions IS 'Wallet transactions. RLS enabled.';

-- Pin the search path so the trigger cannot be pointed at other objects.
ALTER FUNCTION public.update_updated_at_column() SET search_path = '';
