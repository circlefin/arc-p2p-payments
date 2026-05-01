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

-- Add username column to the profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS username varchar;

-- Create an index on username for faster lookups (optional)
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);

-- Comment on the username column
COMMENT ON COLUMN public.profiles.username IS 'Unique username identifier for the user';