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

'use client'

import { useEffect, type ReactNode } from 'react'

/** Full height of the mock device, before it is scaled down to fit the viewport. */
const DEVICE_HEIGHT = 886

/** Volume rocker + power button, poking out of the frame's edges. */
const sideButton =
  'absolute hidden w-2 rounded-[3px] border-2 border-device-frame-border bg-device-button md:block'

export function DeviceFrame({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  useEffect(() => {
    const fit = () => {
      const gutter = window.innerWidth >= 1536 ? 96 : 40
      const scale = Math.max(0.35, Math.min(1, (window.innerHeight - gutter) / DEVICE_HEIGHT))
      document.documentElement.style.setProperty('--device-scale', String(scale))
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])

  return (
    <div
      className={`relative flex min-h-0 w-full flex-col md:h-[calc(886px*var(--device-scale,1))] md:w-[426px] md:animate-device-in ${className ?? ''}`}
    >
      <div className="relative min-h-0 w-full flex-1 md:h-[886px] md:w-[426px] md:flex-none md:origin-top md:transition-transform md:duration-150 md:ease-out md:[transform:scale(var(--device-scale,1))]">
        <div className={`${sideButton} top-[228px] left-[-4px] h-[36px]`} />
        <div className={`${sideButton} top-[279px] left-[-4px] h-[36px]`} />
        <div className={`${sideButton} top-[329px] left-[-4px] h-[36px]`} />
        <div className={`${sideButton} top-[223px] right-[-4px] h-[58px]`} />
        <div className="relative z-1 h-full w-full md:rounded-[56px] md:border-2 md:border-device-frame-border md:bg-device-frame md:shadow-[0_120px_73px_rgba(0,0,0,0.03),0_54px_54px_rgba(0,0,0,0.05),0_8px_16px_rgba(0,0,0,0.06)]">
          <div className="h-full w-full overflow-hidden bg-background md:absolute md:top-[15px] md:left-[15px] md:h-[852px] md:w-[393px] md:rounded-[42px]">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
