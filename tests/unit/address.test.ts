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

import { describe, expect, it } from "vitest";
import { isWalletAddress, normalizeAddress, sameAddress } from "@/lib/wallets/address";

const ADDRESS = "0x" + "aB".repeat(20);

describe("isWalletAddress", () => {
  it("accepts a 20-byte address in any case", () => {
    expect(isWalletAddress(ADDRESS)).toBe(true);
    expect(isWalletAddress(ADDRESS.toLowerCase())).toBe(true);
  });

  it.each([
    "0x123",
    "not-an-address",
    "ab".repeat(20), // no 0x prefix
    "0x" + "g".repeat(40),
    "0x" + "ab".repeat(21),
    "",
    " " + ADDRESS,
  ])("rejects %j", (value) => {
    expect(isWalletAddress(value)).toBe(false);
  });

  it("rejects non-strings", () => {
    for (const value of [42, null, undefined, {}, [ADDRESS]]) {
      expect(isWalletAddress(value)).toBe(false);
    }
  });
});

describe("normalizeAddress / sameAddress", () => {
  it("lower-cases and trims", () => {
    expect(normalizeAddress(`  ${ADDRESS} `)).toBe(ADDRESS.toLowerCase());
  });

  it("compares case-insensitively", () => {
    expect(sameAddress(ADDRESS, ADDRESS.toLowerCase())).toBe(true);
    expect(sameAddress(ADDRESS, "0x" + "cd".repeat(20))).toBe(false);
  });
});
