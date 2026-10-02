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

import { randomUUID } from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!url || !publishableKey || !secretKey) {
  throw new Error(
    "Integration tests need the local Supabase stack. Run `npm run db:start` and make sure .env.local has NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY (see `npm run db:status`)."
  );
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const PASSWORD = "correct-horse-battery";

/** Secret-key client: bypasses RLS, like the app's admin client. */
export const service: SupabaseClient = createClient(url, secretKey, options);
export const anonymous = () => createClient(url, publishableKey, options);

export interface Person {
  authId: string;
  email: string;
  profileId: string;
  walletId: string;
  walletAddress: string;
  client: SupabaseClient;
}

const created = { users: [] as string[], wallets: [] as string[] };

export const randomAddress = () => `0x${randomUUID().replace(/-/g, "")}${"0".repeat(8)}`;

/** A signed-in user with a profile (made by the signup trigger) and an Arc wallet. */
export async function createPerson(): Promise<Person> {
  const email = `it-${randomUUID()}@example.com`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  created.users.push(data.user.id);

  const { data: profile, error: profileError } = await service
    .from("profiles")
    .select("id")
    .eq("auth_user_id", data.user.id)
    .single();
  if (profileError) throw new Error(`no profile for new user: ${profileError.message}`);
  await service.from("profiles").update({ email }).eq("id", profile.id);

  const walletAddress = randomAddress();
  const { data: wallet, error: walletError } = await service
    .from("wallets")
    .insert({
      profile_id: profile.id,
      circle_wallet_id: walletAddress,
      wallet_type: "modular",
      blockchain: "ARC",
      account_type: "SCA",
      currency: "USDC",
      wallet_address: walletAddress,
    })
    .select("id")
    .single();
  if (walletError) throw new Error(`insert wallet failed: ${walletError.message}`);
  created.wallets.push(wallet.id);

  const client = createClient(url!, publishableKey!, options);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signInError) throw new Error(`signIn failed: ${signInError.message}`);

  return { authId: data.user.id, email, profileId: profile.id, walletId: wallet.id, walletAddress, client };
}

export async function cleanup() {
  await service.from("transactions").delete().in("wallet_id", created.wallets);
  await service.from("wallets").delete().in("id", created.wallets);
  for (const id of created.users) await service.auth.admin.deleteUser(id);
  Object.values(created).forEach((list) => list.splice(0));
}
