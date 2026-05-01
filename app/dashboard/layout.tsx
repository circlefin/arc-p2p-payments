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

import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { Tabs } from "@/components/ui/tabs";
import { createSupabaseServerComponentClient } from "@/lib/supabase/server-client";
import BottomTabNavigation from "@/components/bottom-tab-navigation";

interface Props {
  children: ReactNode
}

export default async function Layout({ children }: Props) {
  const supabase = await createSupabaseServerComponentClient();

  // Use getUser() instead of getSession() for security
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect("/sign-in");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select()
    .eq("auth_user_id", user?.id)
    .single();

  if (!profile) {
    return redirect("/sign-in");
  }

  // Check for wallets in database
  const { data: wallets } = await supabase
    .schema("public")
    .from("wallets")
    .select()
    .eq("profile_id", profile.id);

  return (
    <Tabs className="relative flex flex-col h-full px-5 pb-19" defaultValue="balance">
      {children}
      <BottomTabNavigation />
    </Tabs>
  );
}
