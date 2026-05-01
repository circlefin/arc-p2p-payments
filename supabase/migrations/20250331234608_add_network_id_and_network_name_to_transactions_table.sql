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

-- Use this migration script to add network_id and network_name columns to the transactions table
-- Add network_id column (integer)
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS network_id integer;
-- Add network_name column (varchar)
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS network_name varchar;
-- Set default values for existing records
UPDATE transactions
SET network_id = 80002,
    network_name = 'Polygon Amoy'
WHERE network_id IS NULL;
-- Optional: Add an index on network_id for faster filtering
CREATE INDEX IF NOT EXISTS idx_transactions_network_id ON transactions(network_id);
-- Comment about this migration
COMMENT ON COLUMN transactions.network_id IS 'Network ID for the blockchain (80002 for Polygon Amoy, 421614 for Arbitrum Sepolia)';
COMMENT ON COLUMN transactions.network_name IS 'Human-readable name of the blockchain network';