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

import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

// Kept so a misconfigured runtime names the missing variable instead of failing with an opaque 401.
const { CIRCLE_API_KEY, CIRCLE_ENTITY_SECRET } = process.env;

if (!CIRCLE_API_KEY?.trim()) {
  throw new Error("CIRCLE_API_KEY environment variable is missing or empty");
}

if (!CIRCLE_ENTITY_SECRET?.trim()) {
  throw new Error("CIRCLE_ENTITY_SECRET environment variable is missing or empty");
}

// Server-only Circle client: the entity secret must never reach the browser bundle.
export const circleDeveloperSdk = initiateDeveloperControlledWalletsClient({
  apiKey: CIRCLE_API_KEY,
  entitySecret: CIRCLE_ENTITY_SECRET,
});
