import React from 'react';

interface OtpInputProps {
  length: number;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export const OtpInput: React.FC<OtpInputProps> = ({ length, value, onChange, disabled }) => {
  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={length}
      disabled={disabled}
      value={value}
      placeholder={`인증번호 ${length}자리`}
      // Strip non-digits so pasted codes with spaces/dashes still work
      onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, '').slice(0, length))}
      className="
        w-full bg-slate-900/60 border border-slate-700/50 text-white text-lg font-bold text-center
        tracking-[0.3em] rounded-xl py-4 px-5 outline-none transition-all duration-200
        placeholder:text-sm placeholder:font-medium placeholder:tracking-normal placeholder:text-slate-500
        hover:border-slate-500
        focus:border-cta-default focus:shadow-[0px_0px_8px_0px_rgba(99,102,241,0.35)]
        disabled:bg-slate-800 disabled:border-transparent disabled:opacity-50 disabled:cursor-not-allowed
      "
    />
  );
};
