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

import React from 'react';
import { Button } from '@/components/ui/button';

const keys = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['.', '0', '<']
];

interface VirtualKeyboardProps {
  value: string;
  onChangeText: (value: string) => void;
}

export default function VirtualKeyboard({ value, onChangeText }: VirtualKeyboardProps) {
  const handleKeyPress = (key: string) => {
    let newValue = value;

    if (key === '<') {
      // Backspace - remove last character, but prevent empty string
      newValue = value.slice(0, -1) || '0';
    } else if (key === '0' && value === '0') {
      // Ignore additional zero presses when value is already "0"
      return;
    } else if (key === '.' && value.includes('.')) {
      // Prevent multiple decimal points
      return;
    } else if (value.length >= 6) {
      // Prevent exceeding max length
      return;
    } else {
      // For other keys, replace "0" with the key unless it's a decimal
      newValue = (value === '0' && key !== '.') ? key : value + key;
    }

    // Ensure we don't start with a decimal point
    if (newValue.startsWith('.')) {
      newValue = '0' + newValue;
    }

    // Ensure we don't end with a decimal point when backspacing
    if (newValue.endsWith('.') && key === '<') {
      newValue = newValue.slice(0, -1) || '0';
    }

    onChangeText(newValue);
  };

  return (
    <div className="w-full flex flex-col">
      {keys.map((row, rowIndex) => (
        <div key={rowIndex} className="flex items-center justify-around my-6">
          {row.map((key, keyIndex) => (
            <Button
              key={keyIndex}
              variant="ghost"
              size="lg"
              className="aspect-[1.5] flex-1 max-w-[20%] mx-1"
              onClick={() => handleKeyPress(key)}
            >
              <span className="text-2xl font-semibold">{key}</span>
            </Button>
          ))}
        </div>
      ))}
    </div>
  );
}