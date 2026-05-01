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
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/utils/supabase/client";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function Onboarding() {
  const supabase = createClient()
  const router = useRouter()

  const [loading, setLoading] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [username, setUserName] = useState('')

  const isProfileInvalid = useMemo(() => {
    return !firstName || !lastName || !username
  }, [firstName, lastName, username])

  const handleOnboarding = async () => {
    setLoading(true)

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // Create initial profile
      const { error: profileError } = await supabase
        .from("profiles")
        .insert({
          auth_user_id: user?.id,
          name: firstName,
        })

      if (profileError) {
        console.error("Error while attempting to create user:", profileError);
        return
      }
    } catch (error: any) {
      console.error("Could not create user:", error.message);
      alert("Could not create user")
      return
    }

    router.push('/dashboard');
  }

  return (
    <div className="flex flex-col w-full flex-1">
      <div className="flex-1 flex flex-col min-w-64">
        <h1 className="text-2xl font-bold mb-[20px]">
          Create your profile
        </h1>

        <div className="flex flex-col gap-[20px] flex-1">
          <div className="space-y-2">
            <Input
              placeholder="First name"
              value={firstName}
              onChange={event => setFirstName(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Input
              placeholder="Last name"
              value={lastName}
              onChange={event => setLastName(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Input
              placeholder="Username"
              value={username}
              onChange={event => setUserName(event.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              Your unique name for getting paid by anyone
            </p>
          </div>

          <div className="space-y-2">
            <RadioGroup defaultValue="individual">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="individual" id="individual" />
                <Label htmlFor="individual">Individual</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="business" id="business" />
                <Label htmlFor="business">Business</Label>
              </div>
            </RadioGroup>
          </div>

          <Button
            disabled={isProfileInvalid || loading}
            className="w-full mt-auto"
            onClick={handleOnboarding}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}