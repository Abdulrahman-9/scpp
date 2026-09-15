import { useTranslation } from 'react-i18next';
import { fmtCount } from './derive';

/**
 * Signed working-day deviation, rendered as a coloured chip. Shared everywhere.
 * The title states the arithmetic behind the number — planned end vs actual end in WORKING
 * days (client request 8 / ق4: the chip must not be a figure whose origin has to be guessed).
 */
export function DevChip({ wd, className = 'op-dev' }: { wd: number; className?: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const def = t('match.devDef');
  if (wd === 0) return <span className={`${className} op-dev--none`} title={def}>{t('dev.none')}</span>;
  const n = fmtCount(Math.abs(wd), lang);
  if (wd > 0) return <span className={`${className} ${wd > 5 ? 'op-dev--late' : 'op-dev--warn'}`} title={def}>{t('dev.lateWd', { n })}</span>;
  return <span className={`${className} op-dev--early`} title={def}>{t('dev.earlyWd', { n })}</span>;
}
