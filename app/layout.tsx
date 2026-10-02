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
import { DM_Sans, Space_Grotesk, Space_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";
import { Web3Provider } from "@/components/web3-provider";
import { BalanceProvider } from "@/contexts/balanceContext";
import { DeviceFrame } from "@/components/device-frame";
import { StatusBar } from "@/components/status-bar";

// The three families the onramp widget ships under its arc brand.
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk" });
const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-space-mono",
});

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
    <html
      lang="en"
      // Fixed dark: the Arc palette is the only theme, and the dark: utilities key off it.
      className={`dark h-full font-sans antialiased ${dmSans.variable} ${spaceGrotesk.variable} ${spaceMono.variable}`}
      suppressHydrationWarning
    >
      <body className="flex h-dvh flex-col overflow-hidden bg-app-canvas text-foreground bg-[radial-gradient(color-mix(in_oklch,var(--color-device-frame-border)_60%,transparent)_1px,transparent_1px)] bg-[size:28px_28px]">
        <Web3Provider>
          <BalanceProvider>
            <ThemeProvider
              attribute="class"
              defaultTheme="dark"
              forcedTheme="dark"
              disableTransitionOnChange
            >
              <Toaster expand />
              {/* Phone simulation: the device bezel sits on the dotted canvas at
                  md+ and collapses to a plain full-bleed screen below it. */}
              <main className="relative mx-auto flex min-h-0 w-full flex-1 flex-col items-center justify-center md:max-w-7xl md:p-6">
                <DeviceFrame className="flex-1 md:flex-none">
                  <div className="relative flex h-full flex-col bg-background">
                    <StatusBar />
                    <div className="flex min-h-0 flex-1 flex-col">
                      {children}
                    </div>
                  </div>
                </DeviceFrame>
              </main>
            </ThemeProvider>
          </BalanceProvider>
        </Web3Provider>
      </body>
    </html>
  );
}
