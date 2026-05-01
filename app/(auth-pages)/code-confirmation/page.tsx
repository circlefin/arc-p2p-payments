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

"use client";

import { Button } from "@/components/ui/button";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { GlobalContext } from "@/contexts/global-context";
import { useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/utils/supabase/client";
import {
  toPasskeyTransport,
  toWebAuthnCredential,
  WebAuthnMode,
} from "@circle-fin/modular-wallets-core";
import { ArrowLeft } from "lucide-react";

const clientKey = process.env.NEXT_PUBLIC_CIRCLE_CLIENT_KEY;
const clientUrl = process.env.NEXT_PUBLIC_CIRCLE_CLIENT_URL;

// Create Circle transports
const passkeyTransport = toPasskeyTransport(clientUrl, clientKey);

export default function CodeConfirmation() {
  const supabase = createClient();
  const router = useRouter();
  const { phone } = useContext(GlobalContext);

  useEffect(() => {
    if (!phone) {
      console.warn("Phone number not specified, redirecting back to /sign-in");
      router.push("/sign-in");
    }
  }, [phone, router]);

  if (!phone) {
    return null;
  }

  const [loading, setLoading] = useState(false);
  const [confirmationCode, setConfirmationCode] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isConfirmationCodeInvalid = useMemo(
    () => confirmationCode.length !== 6,
    [confirmationCode],
  );

  const handleCodeValidation = async () => {
    if (isConfirmationCodeInvalid) {
      const warningMessage = "The confirmation code must have exactly 6 digits";
      console.warn(warningMessage);
      alert(warningMessage);
      return;
    }

    setLoading(true);

    const {
      data: { session },
      error,
    } = await supabase.auth.verifyOtp({
      phone,
      token: confirmationCode,
      type: "sms",
    });

    if (error) {
      alert(error.message);
      setLoading(false);
      return;
    }

    if (!session) {
      alert("Could not initialize session");
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select()
      .eq("auth_user_id", session.user.id)
      .single();

    if (!profile) {
      router.push("/onboarding");
      return;
    }

    router.push("/dashboard");
  };

  return (
    <div className="flex flex-col w-full flex-1">
      <Button
        className="-mt-[46px] mb-[20px]"
        variant="ghost"
        size="icon"
        onClick={() => router.push("/sign-in")}
      >
        <ArrowLeft />
      </Button>
      <div className="flex-1 flex flex-col min-w-64">
        <h1 className="text-2xl font-bold mb-[20px]">
          Please enter the code sent to
        </h1>

        <p className="text-xl text-muted-foreground mb-[20px]">{phone}</p>

        <div className="flex flex-col gap-4 flex-1">
          <div className="space-y-2 mx-auto">
            <InputOTP
              autoFocus
              maxLength={6}
              value={confirmationCode}
              onChange={setConfirmationCode}
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
              </InputOTPGroup>
              <InputOTPSeparator />
              <InputOTPGroup>
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
          </div>

          {error && (
            <small className="text-sm text-red-600 font-medium leading-none">
              {error}
            </small>
          )}

          <Button
            disabled={isConfirmationCodeInvalid || loading}
            className="w-full mt-auto"
            onClick={handleCodeValidation}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
