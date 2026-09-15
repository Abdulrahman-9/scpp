import type { ReactNode } from 'react';

/**
 * Registry layer (batch 1) — the dual-mode empty state every list screen shares.
 * `empty`   → the store holds no rows of this kind at all.
 * `noMatch` → rows exist but the active search/filters excluded them all.
 * The caller supplies the message (children) and the next action (a button/link).
 *
 * `inline` (batch 2) → a lighter density for small panels (e.g. the follow-up
 * room columns) where the full block would overpower the panel it sits in.
 */
export interface EmptyStateProps {
  mode: 'empty' | 'noMatch';
  children?: ReactNode;
  action?: ReactNode;
  inline?: boolean;
}

export function EmptyState({ mode, children, action, inline }: EmptyStateProps) {
  return (
    <div className={inline ? 'op-empty op-empty--inline' : 'op-empty'} data-mode={mode}>
      {children}
      {action && <div style={{ marginBlockStart: 12 }}>{action}</div>}
    </div>
  );
}
