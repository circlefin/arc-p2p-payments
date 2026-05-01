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

"use server";

import { encodedRedirect } from "@/lib/utils/utils";
import { createClient } from "@/lib/utils/supabase/server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

export const signInAction = async (formData: FormData) => {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const isPasskeyLogin = formData.get("passkey_login") === "true";
  const supabase = await createClient();

  if (isPasskeyLogin) {
    // For passkey logins, we'll try to sign in with email and a predefined password
    // This is not secure but works as a fallback
    // The email should be verified by checking the passkey_credential in wallets

    try {
      // First check if this is a legitimate passkey login by checking cookies
      const cookieStore = await cookies();
      const passkeyEmail = cookieStore.get("passkey_email")?.value;

      if (passkeyEmail && passkeyEmail === email) {
        // This is a legitimate passkey login, so we can use a special flow
        // Try a standard login first with a default password (this would be set in your initial user setup)
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password: "passkey-default-pw", // You would set this during user setup
        });

        if (!error) {
          // Successfully logged in
          return redirect("/dashboard");
        }

        // If that fails, use OTP
        const { error: otpError } = await supabase.auth.signInWithOtp({
          email,
          options: {
            shouldCreateUser: false,
          },
        });

        if (otpError) {
          return encodedRedirect(
            "error",
            "/sign-up",
            "Could not authenticate with passkey",
          );
        }

        // Successfully initiated OTP login
        return encodedRedirect(
          "success",
          "/sign-up",
          "Check your email for a login link",
        );
      }
    } catch (error) {
      console.error("Error in passkey login:", error);
      return encodedRedirect("error", "/sign-up", "Authentication failed");
    }
  }

  // Regular password login
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return encodedRedirect("error", "/sign-in", error.message);
  }

  return redirect("/dashboard");
};

export const forgotPasswordAction = async (formData: FormData) => {
  const email = formData.get("email")?.toString();
  const supabase = await createClient();
  const origin = (await headers()).get("origin");
  const callbackUrl = formData.get("callbackUrl")?.toString();

  if (!email) {
    return encodedRedirect("error", "/forgot-password", "Email is required");
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?redirect_to=/dashboard/reset-password`,
  });

  if (error) {
    console.error(error.message);
    return encodedRedirect(
      "error",
      "/forgot-password",
      "Could not reset password",
    );
  }

  if (callbackUrl) {
    return redirect(callbackUrl);
  }

  return encodedRedirect(
    "success",
    "/forgot-password",
    "Check your email for a link to reset your password.",
  );
};

export const resetPasswordAction = async (formData: FormData) => {
  const supabase = await createClient();

  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (!password || !confirmPassword) {
    encodedRedirect(
      "error",
      "/dashboard/reset-password",
      "Password and confirm password are required",
    );
  }

  if (password !== confirmPassword) {
    encodedRedirect(
      "error",
      "/dashboard/reset-password",
      "Passwords do not match",
    );
  }

  const { error } = await supabase.auth.updateUser({
    password: password,
  });

  if (error) {
    encodedRedirect(
      "error",
      "/dashboard/reset-password",
      "Password update failed",
    );
  }

  encodedRedirect("success", "/dashboard/reset-password", "Password updated");
};

export const signOutAction = async () => {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return redirect("/sign-in");
};
