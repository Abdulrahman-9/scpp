import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import ar from '../src/locales/ar.json';
import en from '../src/locales/en.json';
import { fmtCount, fmtDate, fmtMoney } from '../src/operator/derive';

/**
 * Client decision (2026-07-23): «كل الأرقام في الموقع باللغة الإنجليزية» — every digit
 * the UI shows is Latin (0-9), never Arabic-Indic (٠-٩) or Persian (۰-۹), in either language.
 * Two sources leak Arabic-Indic digits and this guard pins both:
 *   1. hardcoded digits inside the Arabic locale strings,
 *   2. the runtime number/date formatters.
 * A regression that reintroduces `ar-EG`/plain-`ar` formatting fails here.
 */

const ARABIC_INDIC = /[٠-٩۰-۹]/;

/** Recursively collect every string value in the locale tree with its dotted path. */
function entries(obj: unknown, path = ''): Array<[string, string]> {
  if (typeof obj === 'string') return [[path, obj]];
  if (obj && typeof obj === 'object') {
    return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
      entries(v, path ? `${path}.${k}` : k),
    );
  }
  return [];
}

describe('Latin digits everywhere', () => {
  it('neither locale contains an Arabic-Indic or Persian digit', () => {
    const offenders = [...entries(ar), ...entries(en)].filter(([, v]) => ARABIC_INDIC.test(v));
    expect(offenders.map(([k, v]) => `${k}: ${v}`)).toEqual([]);
  });

  it('no source literal reintroduces an Arabic-Indic digit (the channel the locale check misses)', () => {
    // a JSX literal «٣ صحف» typed tomorrow would pass typecheck + the locale check — this catches it.
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'dist') walk(p, out); }
        else if (/\.(ts|tsx)$/.test(e.name) && !p.endsWith('latin-digits.test.ts')) out.push(p);
      }
      return out;
    };
    const files = [...walk(join(root, 'apps', 'web', 'src')), ...walk(join(root, 'packages'))]
      .filter((f) => !/[\\/](test|dist)[\\/]/.test(f) || f.includes(`${join('web', 'src')}`));
    const offenders = files
      .filter((f) => ARABIC_INDIC.test(readFileSync(f, 'utf8')))
      .map((f) => f.replace(root, '').replace(/\\/g, '/'));
    expect(offenders).toEqual([]);
  });

  it('fmtCount renders Latin digits with comma grouping regardless of language', () => {
    expect(fmtCount(2_000_000, 'ar')).toBe('2,000,000');
    expect(fmtCount(2_000_000, 'en')).toBe('2,000,000');
    expect(ARABIC_INDIC.test(fmtCount(1234567, 'ar'))).toBe(false);
  });

  it('fmtMoney keeps the $2,000,000 style (client decision: keep the dollar sign)', () => {
    expect(fmtMoney(2_000_000)).toBe('$2,000,000');
    expect(ARABIC_INDIC.test(fmtMoney(2_000_000))).toBe(false);
  });

  it('fmtDate renders Arabic month names with Latin digits — and proves Arabic ICU data loaded', () => {
    const label = fmtDate('2026-07-23', 'ar');
    expect(ARABIC_INDIC.test(label)).toBe(false);
    expect(label).toMatch(/23/);
    expect(label).toMatch(/2026/);
    // `/يوليو/` proves the Arabic locale actually resolved (not a silent small-ICU fallback to
    // English) AND still emitted Latin digits — without it the assertion passes vacuously.
    expect(label).toMatch(/يوليو/);
    // the normalizer must hold even if a future ICU ignores the nu extension
    expect(fmtDate('2026-01-05', 'ar')).toMatch(/5/);
  });
});
