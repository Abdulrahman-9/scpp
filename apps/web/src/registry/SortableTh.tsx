import type { CSSProperties } from 'react';
import { Icon } from '../operator/Icon';
import type { SortDir } from './useTableSort';
import './registry.css';

/**
 * Registry layer (batch 1) — a sortable table header. Exposes the sort state to
 * assistive tech via `aria-sort` on the <th>, and the direction as a rotated
 * chevron. The button's accessible name is exactly the column label.
 */
export interface SortableThProps {
  label: string;
  sortKey: string;
  /** the table's currently sorted column, or null */
  active: string | null;
  dir: SortDir | null;
  onToggle: (key: string) => void;
  className?: string;
  style?: CSSProperties;
}

export function SortableTh({ label, sortKey, active, dir, onToggle, className, style }: SortableThProps) {
  const isActive = active === sortKey && dir !== null;
  const ariaSort = isActive ? (dir === 'asc' ? 'ascending' : 'descending') : 'none';
  const caretMod = isActive ? (dir === 'asc' ? 'asc' : 'desc') : 'off';
  return (
    <th aria-sort={ariaSort} className={className} style={style}>
      <button type="button" className="reg-sort" onClick={() => onToggle(sortKey)}>
        <span>{label}</span>
        <Icon name="chevronEnd" size={12} strokeWidth={2} className={`reg-sort__caret reg-sort__caret--${caretMod}`} />
      </button>
    </th>
  );
}
