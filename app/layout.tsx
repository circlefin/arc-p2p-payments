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

import type { Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";
import { Web3Provider } from "@/components/web3-provider";
import { BalanceProvider } from "@/contexts/balanceContext";

const defaultUrl = process.env.NEXT_PUBLIC_VERCEL_URL
  ? process.env.NEXT_PUBLIC_VERCEL_URL
  : "http://localhost:3000";

export const metadata = {
  metadataBase: new URL(defaultUrl),
  title: "Arc Pay",
  description: "Seamless, Gasless Transactions with Passkey Security and Instant Top-ups",
};

export const viewport: Viewport = {
  interactiveWidget: 'resizes-content'
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={GeistSans.className} suppressHydrationWarning>
      <body className="bg-background/5 text-foreground flex items-center justify-center min-h-svh overflow-hidden">
        <Web3Provider>
          <BalanceProvider>
            <ThemeProvider
              attribute="class"
              defaultTheme="dark"
              enableSystem
              disableTransitionOnChange
            >
              <Toaster expand />
              {/* Phone simulation container */}
              <div className="relative w-full max-w-[430px] h-screen max-h-[932px] flex flex-col bg-background shadow-xl overflow-hidden">
                <main className="flex-1 flex flex-col items-center overflow-hidden">
                  <div className="flex flex-col w-full flex-1">
                    {children}
                  </div>
                </main>
              </div>
            </ThemeProvider>
          </BalanceProvider>
        </Web3Provider>
      </body>
    </html>
  );
}