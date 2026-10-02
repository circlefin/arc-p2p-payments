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

import { headers } from "next/headers";

// Absolute origin for server-side redirects and route-to-route calls. Client code should use relative paths instead.
export async function resolveBaseUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_VERCEL_URL?.trim();
  if (configured) {
     // Vercel exposes VERCEL_URL as a bare host while .env.example documents a scheme, so accept both.
    return /^https?:\/\//.test(configured) ? configured : `https://${configured}`;
  }

  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  if (!host) return "http://localhost:3000";

  const protocol =
    requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}
