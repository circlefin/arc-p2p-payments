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

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanup, createPerson, randomAddress, service, type Person } from "./helpers";

afterAll(cleanup);

// Alice and Bob are two ordinary users; Carol has a profile but no wallet yet.
let alice: Person;
let bob: Person;

beforeAll(async () => {
  [alice, bob] = await Promise.all([createPerson(), createPerson()]);
});

const PERMISSION_DENIED = "42501";
const UNIQUE_VIOLATION = "23505";

const walletFor = (person: Person, overrides: Record<string, unknown> = {}) => ({
  profile_id: person.profileId,
  circle_wallet_id: randomAddress(),
  wallet_type: "modular",
  blockchain: "ARC",
  account_type: "SCA",
  currency: "USDC",
  ...overrides,
});

describe("wallet addresses are unique (payments go to the address a row holds)", () => {
  it("does not let a user register another user's address on a new wallet", async () => {
    const carol = await createPerson();
    await service.from("wallets").delete().eq("id", carol.walletId);

    const { error } = await carol.client
      .from("wallets")
      .insert(walletFor(carol, { wallet_address: alice.walletAddress }));

    expect(error?.code).toBe(UNIQUE_VIOLATION);
  });

  it("does not let a user re-point their own wallet at another user's address", async () => {
    const { error } = await bob.client
      .from("wallets")
      .update({ wallet_address: alice.walletAddress })
      .eq("id", bob.walletId);
    expect(error?.code).toBe(UNIQUE_VIOLATION);

    const { data } = await service.from("wallets").select("wallet_address").eq("id", bob.walletId).single();
    expect(data!.wallet_address).toBe(bob.walletAddress);
  });

  it("treats addresses that differ only by case as the same address", async () => {
    const { error } = await bob.client
      .from("wallets")
      .update({ wallet_address: alice.walletAddress.toUpperCase().replace("0X", "0x") })
      .eq("id", bob.walletId);
    expect(error?.code).toBe(UNIQUE_VIOLATION);
  });

  it("still lets a user change their own address to a fresh one (passkey re-registration)", async () => {
    const fresh = randomAddress();
    const carol = await createPerson();
    const { error } = await carol.client
      .from("wallets")
      .update({ wallet_address: fresh, passkey_credential: JSON.stringify({ id: "c" }) })
      .eq("id", carol.walletId);
    expect(error).toBeNull();
  });
});

describe("wallets", () => {
  it("does not let a user set their own cached balance", async () => {
    const { error } = await alice.client.from("wallets").update({ balance: 1_000_000 }).eq("id", alice.walletId);
    expect(error?.code).toBe(PERMISSION_DENIED);

    const { data } = await service.from("wallets").select("balance").eq("id", alice.walletId).single();
    expect(Number(data!.balance)).toBe(0);
  });

  it("does not let a user create a wallet that already has a balance", async () => {
    const carol = await createPerson();
    await service.from("wallets").delete().eq("id", carol.walletId);
    const { error } = await carol.client
      .from("wallets")
      .insert(walletFor(carol, { wallet_address: randomAddress(), balance: 500 }));
    expect(error?.code).toBe(PERMISSION_DENIED);
  });

  it("does not let a user create a wallet on someone else's profile", async () => {
    const { error } = await bob.client
      .from("wallets")
      .insert(walletFor(alice, { wallet_address: randomAddress() }));
    expect(error?.code).toBe(PERMISSION_DENIED);
  });

  it.each(["profile_id", "blockchain", "is_active"])("does not let a user change %s", async (column) => {
    const patch = { profile_id: bob.profileId, blockchain: "ETH", is_active: false }[column as never];
    const { error } = await alice.client
      .from("wallets")
      .update({ [column]: patch })
      .eq("id", alice.walletId);
    expect(error?.code).toBe(PERMISSION_DENIED);
  });

  it("does not let a user edit someone else's wallet", async () => {
    const { data } = await bob.client
      .from("wallets")
      .update({ passkey_credential: "hijacked" })
      .eq("id", alice.walletId)
      .select("id");
    expect(data ?? []).toEqual([]);
  });

  it("lets signed-in users read wallets (recipient search needs it)", async () => {
    const { data } = await bob.client.from("wallets").select("wallet_address").eq("id", alice.walletId);
    expect(data).toEqual([{ wallet_address: alice.walletAddress }]);
  });
});

describe("transactions", () => {
  const row = (person: Person, over: Record<string, unknown> = {}) => ({
    wallet_id: person.walletId,
    profile_id: person.profileId,
    amount: 5,
    currency: "USDC",
    status: "PENDING",
    transaction_type: "USDC_TRANSFER_OUT",
    circle_transaction_id: "0x" + "ab".repeat(32),
    ...over,
  });

  it("lets a user record a transaction for their own wallet", async () => {
    const { error } = await alice.client.from("transactions").insert(row(alice));
    expect(error).toBeNull();
  });

  it("does not let a user record a transaction on someone else's profile", async () => {
    const { error } = await bob.client.from("transactions").insert(row(alice));
    expect(error?.code).toBe(PERMISSION_DENIED);
  });

  it("does not let a user rewrite their own transaction afterwards", async () => {
    const { data: inserted } = await service
      .from("transactions")
      .insert(row(alice, { status: "FAILED", amount: 5, circle_transaction_id: "0x" + "cd".repeat(32) }))
      .select("id")
      .single();

    const { error } = await alice.client
      .from("transactions")
      .update({ status: "COMPLETE", amount: 999999 })
      .eq("id", inserted!.id);
    expect(error?.code).toBe(PERMISSION_DENIED);

    const { data } = await service.from("transactions").select("status, amount").eq("id", inserted!.id).single();
    expect(data).toMatchObject({ status: "FAILED", amount: 5 });
  });

  it("keeps one user's transactions private from another", async () => {
    await service.from("transactions").insert(row(alice, { circle_transaction_id: "0x" + "ee".repeat(32) }));
    const { data } = await bob.client.from("transactions").select("id").eq("wallet_id", alice.walletId);
    expect(data).toEqual([]);
  });
});

describe("profiles", () => {
  it("lets a user edit their display fields", async () => {
    const { error } = await alice.client
      .from("profiles")
      .update({ full_name: "Alice Example", company_name: "Alice Co" })
      .eq("id", alice.profileId);
    expect(error).toBeNull();
  });

  it("does not let a user change their email (it identifies them to others)", async () => {
    const { error } = await bob.client.from("profiles").update({ email: alice.email }).eq("id", bob.profileId);
    expect(error?.code).toBe(PERMISSION_DENIED);

    const { data } = await service.from("profiles").select("email").eq("id", bob.profileId).single();
    expect(data!.email).toBe(bob.email);
  });

  it.each(["auth_user_id", "is_active"])("does not let a user change %s", async (column) => {
    const { error } = await bob.client
      .from("profiles")
      .update({ [column]: column === "is_active" ? false : alice.authId })
      .eq("id", bob.profileId);
    expect(error?.code).toBe(PERMISSION_DENIED);
  });

  it("does not let a user edit someone else's profile", async () => {
    const { data } = await bob.client
      .from("profiles")
      .update({ full_name: "Hacked" })
      .eq("id", alice.profileId)
      .select("id");
    expect(data ?? []).toEqual([]);
  });

  it("does not let a user create a profile with a chosen email", async () => {
    const carol = await createPerson();
    await service.from("wallets").delete().eq("id", carol.walletId);
    await service.from("profiles").delete().eq("id", carol.profileId);

    const withEmail = await carol.client
      .from("profiles")
      .insert({ auth_user_id: carol.authId, name: "Carol", email: alice.email });
    expect(withEmail.error?.code).toBe(PERMISSION_DENIED);

    const withoutEmail = await carol.client
      .from("profiles")
      .insert({ auth_user_id: carol.authId, name: "Carol" });
    expect(withoutEmail.error).toBeNull();
  });
});
