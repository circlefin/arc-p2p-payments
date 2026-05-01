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

import type { Session } from '@supabase/supabase-js'
import React, { type PropsWithChildren, createContext, useState } from 'react'

interface Context {
  phone?: string
  firstName?: string
  lastName?: string
  username?: string
  session?: Session
  updateState: (newValues: Partial<Context>) => void
}

export const GlobalContext = createContext<Context>({
  updateState: () => {}
})

export function GlobalContextProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState({})

  const updateState = (newValues: Partial<Context>) => {
    setState(prevState => ({ ...prevState, ...newValues }))
  }

  return (
    <GlobalContext.Provider value={{ ...state, updateState }}>
      {children}
    </GlobalContext.Provider>
  )
}