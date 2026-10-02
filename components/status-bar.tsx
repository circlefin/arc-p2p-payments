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

import { useEffect, useState } from 'react'
import { BatteryFull, Signal, Wifi } from 'lucide-react'

function useClock() {
  const [time, setTime] = useState<string | null>(null)

  useEffect(() => {
    const tick = () => {
      const now = new Date()
      setTime(`${now.getHours() % 12 || 12}:${String(now.getMinutes()).padStart(2, '0')}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  return time
}

export function StatusBar() {
  const time = useClock()

  return (
    <div className="hidden shrink-0 items-center justify-between px-8 pt-5 text-foreground md:flex">
      <span
        className="text-[17px] font-semibold tracking-tight tabular-nums"
        suppressHydrationWarning
      >
        {time ?? '9:41'}
      </span>
      <div className="flex items-center gap-1.5">
        <Signal className="size-[18px] fill-current" strokeWidth={1.5} />
        <Wifi className="size-[18px]" strokeWidth={2.5} />
        <BatteryFull className="size-6 fill-current" strokeWidth={1.5} />
      </div>
    </div>
  )
}
