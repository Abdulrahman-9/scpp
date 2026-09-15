import { METHODS } from '@masaar/scpp-rules';

/** Method chip «07 المناقصة العامة» — pill with a navy number circle. */
export function PathChip({ id, lang }: { id: number; lang: 'ar' | 'en' }) {
  const m = METHODS.find((x) => x.id === id);
  if (!m) return null;
  return (
    <span className="op-pathchip">
      <span className="op-pathchip__no">{String(m.id).padStart(2, '0')}</span>
      <span>{m[lang]}</span>
    </span>
  );
}
