import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';

/**
 * Honest marker for an action whose real implementation is tracked debt. Defaults to «محاكاة»
 * (a simulated effect); pass `label` for a different honest word — e.g. «محلي» for a client-only
 * governance action that applies locally because no server endpoint enforces it yet. The `title`
 * explains what is (and is not) really happening, so the flag is never mistaken for the real thing.
 */
export function DevBadge({ title, label }: { title?: string; label?: string }) {
  const { t } = useTranslation();
  return (
    <span className="op-devbadge" title={title}>
      <Icon name="alert" size={11} strokeWidth={2} />
      {label ?? t('dev.sim')}
    </span>
  );
}
