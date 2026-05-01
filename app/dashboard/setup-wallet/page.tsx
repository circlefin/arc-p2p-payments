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

'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { PasskeySetup } from '@/components/passkey-setup';
import { createClient } from '@/lib/utils/supabase/client';
import { useEffect, useState } from 'react';

export default function SetupWalletPage() {
  const router = useRouter();
  const supabase = createClient();
  const searchParams = useSearchParams();
  const username = searchParams.get('username') || '';
  const [walletSetupComplete, setWalletSetupComplete] = useState<boolean>()

  const getUser = async () => {
    const {
      data: { user: loggedUser },
    } = await supabase.auth.getUser();

    if (loggedUser?.user_metadata.wallet_setup_complete) {
      router.push('/dashboard')
      return
    }

    setWalletSetupComplete(false)
  }

  useEffect(() => {
    getUser()
  }, [router])

  if (walletSetupComplete === undefined) return null

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <div className="max-w-md w-full p-6 bg-card border border-border rounded-lg shadow-sm">
        <PasskeySetup username={username} />
      </div>
    </div>
  );
}