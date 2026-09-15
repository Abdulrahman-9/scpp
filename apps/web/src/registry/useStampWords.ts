import { useTranslation } from 'react-i18next';
import type { StampWords } from './report';

/**
 * The stamp's fixed words, translated once (client request 7 + methodology م5).
 *
 * `reportStamp` is pure so it can be unit-tested without a DOM, which means it cannot reach
 * i18next itself — and five registries plus three print surfaces each writing their own
 * `t('reg.stamp.words.filters')` is exactly how «الفلاتر النشطة» and «المرشّحات النشطة» end up on
 * two different exports of the same portfolio. One hook, one wording per language.
 */
export function useStampWords(): StampWords {
  const { t } = useTranslation();
  return {
    filters: t('reg.stamp.words.filters'),
    none: t('reg.stamp.words.none'),
    rows: t('reg.stamp.words.rows'),
    generated: t('reg.stamp.words.generated'),
    scope: t('reg.stamp.words.scope'),
  };
}
