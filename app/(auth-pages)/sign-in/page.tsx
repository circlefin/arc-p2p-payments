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

"use client"

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/utils/supabase/client";
import { GlobalContext } from "@/contexts/global-context";
import { useRouter } from "next/navigation";
import { ChangeEventHandler, useContext, useMemo, useState } from "react";
import { InputMask, unformat } from "@react-input/mask";

const phoneMask = '(X__) X__-____'
const phoneReplacement = {
  X: /[2-9]/,
  _: /\d/
}

export default function SignIn() {
  const supabase = createClient()
  const router = useRouter()
  const [phone, setPhone] = useState('')
  const [unmaskedPhone, setUnmaskedPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const { updateState } = useContext(GlobalContext)

  const prefixedPhone = useMemo(() => `+1${unmaskedPhone}`, [unmaskedPhone])
  const isPhoneNumberInvalid = useMemo(() => unmaskedPhone.length !== 10, [unmaskedPhone])

  const handlePhoneChange: ChangeEventHandler<HTMLInputElement> = event => {
    setPhone(event.target.value)

    const unmaskedPhone = unformat(event.target.value, {
      mask: phoneMask,
      replacement: phoneReplacement
    })

    setUnmaskedPhone(unmaskedPhone)
  }

  const signUpWithPhone = async () => {
    if (isPhoneNumberInvalid) {
      const warningMessage = 'The phone number must have exactly 10 digits'
      console.warn(warningMessage)
      alert(warningMessage)
      return
    }

    setLoading(true)

    const { error: otpSignInError } = await supabase.auth.signInWithOtp({
      phone: prefixedPhone
    })

    if (otpSignInError) {
      alert(otpSignInError.message)
      setLoading(false)
      return
    }

    updateState({ phone: prefixedPhone })

    router.push('/code-confirmation')
  }

  return (
    <div className="flex flex-col w-full flex-1">
      <div className="flex-1 flex flex-col min-w-64">
        <h1 className="text-2xl font-bold mb-[20px]">
          Enter your phone
        </h1>

        <div className="flex flex-col gap-4 mt-4 flex-1">
          <div className="space-y-2">
            <InputMask
              component={Input}
              mask={phoneMask}
              replacement={phoneReplacement}
              placeholder="Phone number"
              value={phone}
              onChange={handlePhoneChange}
            />
          </div>

          <Button
            disabled={isPhoneNumberInvalid || loading}
            className="w-full mt-auto"
            onClick={signUpWithPhone}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}