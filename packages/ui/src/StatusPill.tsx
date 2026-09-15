import type { StatusKey } from '@masaar/tokens';
import type { ReactNode } from 'react';

export interface StatusPillProps {
  status: StatusKey;
  children: ReactNode;
  /**
   * SIGHTED-HOVER explanation of HOW the status was computed (client request 8 / ق4: «ما معنى
   * المطابقة؟»). Optional because most surfaces show a status whose derivation is already
   * spelled out beside it; the registries, where the pill stands alone in a dense column,
   * pass the sentence that states the comparison the engine actually made.
   *
   * NOT an accessibility affordance, despite the habit of calling it one: `title` on a
   * non-focusable <span> is unreachable by keyboard, absent on touch, and announced
   * inconsistently by screen readers. It may therefore only ever RESTATE something the screen
   * already says — never carry the only copy of a governance fact. Both callers honour that:
   * the tender registries that pass it also print the same «match.def» definition in the page
   * head, where every reader gets it.
   */
  title?: string;
  /**
   * `'sm'` is the dense-column pill (§4-ج): SIZE ONLY — same six colours, same border, same dot,
   * on a smaller type step. Registries that stack a status against a name, a code and a figure in
   * one row pass it so the pill stops setting the row's height; everything else leaves it out.
   */
  size?: 'sm';
}

/** One status language across the whole platform: dot + label + tinted background. */
export function StatusPill({ status, children, title, size }: StatusPillProps) {
  return (
    <span className={`m-pill m-pill--${status}${size ? ` m-pill--${size}` : ''}`} title={title}>
      {children}
    </span>
  );
}
