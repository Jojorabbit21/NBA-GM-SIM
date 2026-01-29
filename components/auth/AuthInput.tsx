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
      {/* Input Label - Increased to 14px (text-sm) and added mb-2.5 for spacing */}
      <label className="text-sm pretendard font-medium text-slate-500 mb-2.5 ml-1">
        {label}
      </label>

      <div className="relative group">
        {/* The Input Field - Text and Placeholder increased to 14px (text-sm) */}
        <input
          type={type}
          required
          placeholder={placeholder}
          className={`w-full bg-slate-950 border text-white text-sm rounded-xl py-4 px-5 outline-none transition-all duration-300 pretendard font-medium placeholder:text-slate-700 placeholder:text-sm placeholder:font-medium ${
            hasError 
              ? 'border-red-500 focus:ring-1 focus:ring-red-500/50' 
              : 'border-slate-800 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10'
          }`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>

      {/* Error Message Container */}
      <div className="h-6 mt-1 px-1.5 flex items-start">
        {hasError && (
          <div className="flex items-center gap-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
            <AlertCircle size={10} className="text-red-500 flex-shrink-0" />
            <p className="text-[10px] font-medium text-red-500 tracking-tight leading-none pretendard">
              {errorMsg}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};