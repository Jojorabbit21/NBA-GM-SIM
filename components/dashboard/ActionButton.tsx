
import React, { useState } from 'react';
import { Loader2, ChevronRight } from 'lucide-react';

// Action/Primary 토큰 (orange 고정 — 팀컬러 비의존)
const ACTION_PRIMARY = {
  subtle:   '#fed7aa', // orange-200  Loading 텍스트
  accent:   '#fb923c', // orange-400  Hover gradient to
  default:  '#f97316', // orange-500  Default gradient from
  strong:   '#ea580c', // orange-600  Hover gradient from / border
  stronger: '#c2410c', // orange-700  Default gradient to / border
  strongest:'#9a3412', // orange-800  Focused gradient to
};

// Action/Secondary 토큰 (cool-gray — 아이콘 전용)
const ACTION_SECONDARY = {
  subtle:       '#f9fafb', // cool-gray-50   gradient from
  default:      '#e5e7eb', // cool-gray-200  gradient to
  strong:       '#d1d5db', // cool-gray-300  border
  stronger:     '#9ca3af', // cool-gray-400  Focused gradient to
  accent:       '#6b7280', // cool-gray-500  아이콘 기본
  accentStrong: '#374151', // cool-gray-700  아이콘 Hover/Focused
};

const ACTION_DISABLED = {
  bg:     '#1f2937', // cool-gray-800
  border: '#374151', // cool-gray-700
  text:   '#4b5563', // cool-gray-600
};

const TEXT_SHADOW = '-0.5px 0.5px 1px rgba(0,0,0,0.16)';

interface ActionButtonPrimaryProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  /** 경기 당일: 우측에 chevron 분리 영역 표시 */
  showChevron?: boolean;
  size?: 'medium' | 'small'; // medium=48px, small=40px
  className?: string;
}

interface ActionButtonSecondaryProps {
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  size?: 'medium' | 'small';
}

// ── Primary ──────────────────────────────────────────────────────────────────
export const ActionButtonPrimary: React.FC<ActionButtonPrimaryProps> = ({
  label,
  onClick,
  disabled = false,
  loading = false,
  loadingLabel,
  showChevron = false,
  size = 'medium',
  className = '',
}) => {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  const height = size === 'medium' ? 'h-12' : 'h-10'; // 48px / 40px
  const textSize = size === 'medium' ? 'text-base' : 'text-sm'; // 16px / 14px

  const getStyle = (): React.CSSProperties => {
    if (disabled) return {
      backgroundColor: ACTION_DISABLED.bg,
      border: `1px solid ${ACTION_DISABLED.border}`,
      color: ACTION_DISABLED.text,
    };
    if (pressed) return {
      backgroundImage: `linear-gradient(to top, ${ACTION_PRIMARY.default}, ${ACTION_PRIMARY.strongest})`,
      border: `2px solid ${ACTION_PRIMARY.strong}`,
      color: '#ffffff',
      textShadow: TEXT_SHADOW,
    };
    if (hovered || loading) return {
      backgroundImage: `linear-gradient(to top, ${ACTION_PRIMARY.strong}, ${ACTION_PRIMARY.accent})`,
      border: `2px solid ${ACTION_PRIMARY.stronger}`,
      color: loading ? ACTION_PRIMARY.subtle : '#ffffff',
      textShadow: TEXT_SHADOW,
    };
    return {
      backgroundImage: `linear-gradient(to bottom, ${ACTION_PRIMARY.default}, ${ACTION_PRIMARY.stronger})`,
      border: `2px solid ${ACTION_PRIMARY.stronger}`,
      color: '#ffffff',
      textShadow: TEXT_SHADOW,
    };
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      className={`flex items-center rounded-xl transition-all duration-150 select-none overflow-hidden ${height} ${
        disabled || loading ? 'cursor-not-allowed' : 'cursor-pointer active:scale-[0.98]'
      } ${className}`}
      style={getStyle()}
    >
      {showChevron ? (
        <>
          {/* 텍스트 영역 */}
          <span
            className={`flex items-center gap-2 px-3 ${textSize} font-semibold whitespace-nowrap h-full flex-1`}
            style={{ borderRight: '1px solid rgba(0,0,0,0.25)' }}
          >
            {loading
              ? <><Loader2 size={15} className="animate-spin shrink-0" />{loadingLabel ?? label}</>
              : label
            }
          </span>
          {/* Chevron 영역 */}
          <span className="flex items-center justify-center px-3 h-full">
            <ChevronRight size={20} />
          </span>
        </>
      ) : (
        <span className={`flex items-center justify-center gap-2 ${textSize} font-semibold whitespace-nowrap w-full px-3`}>
          {loading
            ? <><Loader2 size={15} className="animate-spin shrink-0" />{loadingLabel ?? label}</>
            : label
          }
        </span>
      )}
    </button>
  );
};

// ── Secondary (icon only) ─────────────────────────────────────────────────────
export const ActionButtonSecondary: React.FC<ActionButtonSecondaryProps> = ({
  icon,
  onClick,
  disabled = false,
  size = 'medium',
}) => {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  const sizeClass = size === 'medium' ? 'w-12 h-12' : 'w-10 h-10'; // 48px / 40px

  const getStyle = (): React.CSSProperties => {
    if (disabled) return {
      backgroundColor: ACTION_DISABLED.bg,
      border: `1px solid ${ACTION_DISABLED.border}`,
      color: ACTION_DISABLED.text,
    };
    if (pressed) return {
      backgroundImage: `linear-gradient(to top, ${ACTION_SECONDARY.subtle}, ${ACTION_SECONDARY.stronger})`,
      border: `2px solid ${ACTION_SECONDARY.strong}`,
      color: ACTION_SECONDARY.accentStrong,
    };
    if (hovered) return {
      backgroundImage: `linear-gradient(to bottom, ${ACTION_SECONDARY.subtle}, ${ACTION_SECONDARY.default})`,
      border: `2px solid ${ACTION_SECONDARY.strong}`,
      color: ACTION_SECONDARY.accentStrong,
    };
    return {
      backgroundImage: `linear-gradient(to bottom, ${ACTION_SECONDARY.subtle}, ${ACTION_SECONDARY.default})`,
      border: `2px solid ${ACTION_SECONDARY.strong}`,
      color: ACTION_SECONDARY.accent,
    };
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      className={`flex items-center justify-center rounded-xl transition-all duration-150 select-none shrink-0 ${sizeClass} ${
        disabled ? 'cursor-not-allowed' : 'cursor-pointer active:scale-[0.98]'
      }`}
      style={getStyle()}
    >
      {icon}
    </button>
  );
};
