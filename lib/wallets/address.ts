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

import { isAddress } from "viem";

/** True for a well-formed 0x + 40 hex address (any case; checksums are not enforced). */
export function isWalletAddress(value: unknown): value is string {
  return typeof value === "string" && isAddress(value, { strict: false });
}

/** Addresses are compared and stored lower-cased so one wallet is one row. */
export const normalizeAddress = (address: string) => address.trim().toLowerCase();

export const sameAddress = (a: string, b: string) =>
  normalizeAddress(a) === normalizeAddress(b);
