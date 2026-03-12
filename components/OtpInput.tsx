import React, { useRef, useCallback } from 'react';

interface OtpInputProps {
  length: number;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export const OtpInput: React.FC<OtpInputProps> = ({ length, value, onChange, disabled }) => {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.padEnd(length, '').split('').slice(0, length);

  const focusInput = useCallback((index: number) => {
    if (index >= 0 && index < length) {
      inputRefs.current[index]?.focus();
    }
  }, [length]);

  const handleKeyDown = useCallback((index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (digits[index]) {
        // Clear current digit
        const arr = digits.slice();
        arr[index] = '';
        onChange(arr.join(''));
      } else if (index > 0) {
        // Move to previous and clear it
        const arr = digits.slice();
        arr[index - 1] = '';
        onChange(arr.join(''));
        focusInput(index - 1);
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      focusInput(index - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      focusInput(index + 1);
    }
  }, [digits, onChange, focusInput]);

  const handleInput = useCallback((index: number, e: React.FormEvent<HTMLInputElement>) => {
    const inputValue = (e.target as HTMLInputElement).value;
    const char = inputValue.replace(/[^0-9]/g, '').slice(-1);
    if (!char) return;

    const arr = digits.slice();
    arr[index] = char;
    onChange(arr.join('').replace(/[^0-9]/g, ''));
    if (index < length - 1) {
      focusInput(index + 1);
    }
  }, [digits, length, onChange, focusInput]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/[^0-9]/g, '').slice(0, length);
    if (pasted) {
      onChange(pasted);
      focusInput(Math.min(pasted.length, length - 1));
    }
  }, [length, onChange, focusInput]);

  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => { inputRefs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          disabled={disabled}
          value={digits[i] || ''}
          onInput={(e) => handleInput(i, e)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          className={`
            w-11 h-12 text-center text-lg font-bold text-white
            bg-slate-950 border border-slate-800 rounded-xl
            outline-none transition-all duration-200
            focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10
            disabled:opacity-50 disabled:cursor-not-allowed
            pretendard
          `}
          autoComplete="one-time-code"
        />
      ))}
    </div>
  );
};
