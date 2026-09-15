import type { ReactNode } from 'react';
import { Icon } from '../operator/Icon';
import './registry.css';

/**
 * Registry layer — the collapsed «ما هذا القسم؟» strip (Design Principle 3: complexity
 * explained, not hidden). A screen whose governing rule is not visible on its face (the
 * approval ladder, the deviation arithmetic) carries one of these under its title: closed
 * by default so the registry stays the subject, one click away for whoever needs the model.
 *
 * Built on native <details> deliberately — disclosure state, keyboard behaviour and AT
 * semantics are the platform's, so there is no state to hold and nothing to get wrong.
 * The caller owns every word (title + body) and passes the LIVE figures in, so the
 * explanation can never drift from the configuration it describes.
 */
export interface SectionExplainerProps {
  title: string;
  children: ReactNode;
}

export function SectionExplainer({ title, children }: SectionExplainerProps) {
  return (
    <details className="reg-explain">
      <summary className="reg-explain__sum">
        <Icon name="chevronEnd" size={12} strokeWidth={2} className="reg-explain__caret" />
        <span>{title}</span>
      </summary>
      <div className="reg-explain__body">{children}</div>
    </details>
  );
}
