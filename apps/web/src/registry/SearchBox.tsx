import type { CSSProperties } from 'react';
import { Icon } from '../operator/Icon';

/**
 * Registry layer (batch 1) — the controlled search box shared by every list
 * screen. Wraps the .op-search / .op-search__in / .op-search__icon pattern
 * (lifted from Users.tsx:127-130). Always carries an accessible name.
 */
export interface SearchBoxProps {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
}

export function SearchBox({ value, onChange, placeholder, ariaLabel, className, style }: SearchBoxProps) {
  return (
    <div className={`op-search${className ? ` ${className}` : ''}`} style={style}>
      <input
        className="op-search__in"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
      />
      <span className="op-search__icon"><Icon name="search" size={14} strokeWidth={2} /></span>
    </div>
  );
}
