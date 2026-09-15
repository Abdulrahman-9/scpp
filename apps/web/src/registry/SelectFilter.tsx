import type { CSSProperties } from 'react';
import './registry.css';

/**
 * Registry layer (phase 4, client request 7) — one declared single-choice dimension.
 *
 * The five registries were each hand-rolling `<select className="op-filter-select" aria-label=…>`,
 * and `.op-filter-select` lives in admin.css, which the operator portal never loads — so the same
 * control looked different on the two sides of the product. This is the one implementation, on the
 * registry layer's own `.reg-select` (bundled in both portals), with the «all» row always first so
 * widening is never hidden behind scrolling.
 *
 * `value=''` is «كل …»: absent, not a filter on the empty string.
 */
export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectFilterProps {
  /** the dimension, already translated — used as the accessible name AND the «all» row */
  allLabel: string;
  value: string;
  options: readonly SelectOption[];
  onChange: (v: string) => void;
  /** hidden when the store holds nothing to choose from — a control with one empty row is a placebo */
  hideWhenEmpty?: boolean;
  style?: CSSProperties;
}

export function SelectFilter({ allLabel, value, options, onChange, hideWhenEmpty, style }: SelectFilterProps) {
  if (hideWhenEmpty && options.length === 0) return null;
  return (
    <select
      className="reg-select"
      value={value}
      aria-label={allLabel}
      style={style}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{allLabel}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
