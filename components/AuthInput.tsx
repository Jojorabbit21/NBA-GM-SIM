import React from 'react';
import { AlertCircle } from 'lucide-react';

interface AuthInputProps {
  label: string;
  type: string;
  placeholder: string;
  value: string;
  onChange: (val: string) => void;
  isValid: boolean;
  errorMsg: string;
  showError: boolean;
}

export const AuthInput: React.FC<AuthInputProps> = ({
  label,
  type,
  placeholder,
  value,
  onChange,
  isValid,
  errorMsg,
  showError
}) => {
  const hasError = !isValid && showError;

  return (
    <div className="w-full flex flex-col mb-1">
      <label className="text-sm font-medium text-text-muted mb-2.5 ml-1">
        {label}
      </label>

      <div className="relative group">
        <input
          type={type}
          required
          placeholder={placeholder}
          className={`w-full bg-surface-sunken border text-text-primary text-sm rounded-xl py-4 px-5 outline-none transition-all duration-300 font-medium placeholder:text-text-disabled placeholder:text-sm placeholder:font-medium ${
            hasError
              ? 'border-status-danger-default focus:ring-1 focus:ring-status-danger-default/30'
              : 'border-border-default focus:border-cta-border focus:ring-4 focus:ring-indigo-500/10'
          }`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>

      <div className="h-6 mt-1 px-1.5 flex items-start">
        {hasError && (
          <div className="flex items-center gap-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
            <AlertCircle size={10} className="text-status-danger-default flex-shrink-0" />
            <p className="text-[10px] font-medium text-status-danger-text tracking-tight leading-none">
              {errorMsg}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
