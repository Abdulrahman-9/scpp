// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '../src/i18n';
import App from '../src/App';
import { complianceSeries } from '../src/admin/dashboardDerive';
import { Sparkline } from '../src/charts/Sparkline';
import i18n from '../src/i18n';
import { saveSession } from '../src/session';
import { seedState, todayIso } from '../src/store';

/**
 * Batch د5 — the follow-up room, at its shrunk scope (ops/DESIGN-TRANSFER-PLAN.md §3 د5, items
 * 3–5; items 1–2 were superseded by د10's §2-ط filled tiles and are NOT re-asserted here).
 *
 * Three claims that survive only if something checks them every run:
 *
 * 1. THE AXIS IS THE SERIES. لوحة-31 wanted the reference's row of six month names. Six labels
 *    would typecheck under any data, and `complianceSeries` emits no point for a month that closed
 *    no stage — so the labels and the polyline would disagree the first time a month went quiet.
 *    Only the two ENDS are printed, and the guard renders two DIFFERENT series into the same
 *    component: no pair of constants can satisfy both.
 * 2. INERTNESS IS READABLE, NOT JUST TRUE. لوحة-28 wanted all three donut bands clickable. ط1 has
 *    no destination by rule (`tier.ts:42-44` — the approval chain is BY DEFINITION what owes a
 *    signature outside the operating company), so it stays inert and pays for it in explanation:
 *    no pointer cursor, a hover `title`, and the reason PRINTED — because a tooltip is unreachable
 *    by touch and by keyboard and so may never be the only place a reason lives.
 * 3. THE STYLESHEET IS THE STYLESHEET. `FollowUpRoom` carried five inline `style={{…}}` objects —
 *    CSS in a JSX costume: unthemeable, invisible to every audit this suite runs on the sheets,
 *    and physical (`maxWidth`, `overflowX`, `textAlign`) inside an otherwise logical system. Zero
 *    is the acceptance criterion, so zero is what is asserted.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const ROOM_SRC = 'apps/web/src/admin/FollowUpRoom.tsx';
const CHARTS_CSS = 'apps/web/src/charts/charts.css';
const ADMIN_CSS = 'apps/web/src/admin/admin.css';
/** د15-م2 — the statistic-tile family lives in the sheet both shells load. */
const TILE_CSS = 'apps/web/src/operator/operator.css';

const MDOC = { name: 'د. سارة الجبوري', role: 'MDOC_ADMIN' as const, oid: 'oid-roc-01' };

beforeEach(() => {
  localStorage.clear();
  saveSession(MDOC);
});

afterEach(() => {
  document.body.innerHTML = '';
  window.location.hash = '';
  localStorage.clear();
});

/**
 * A sheet PARSED, never scraped (the standing rule in `visualRefresh`): a declaration the CSS
 * parser throws away has to be genuinely absent here too, or the guard certifies a rule the
 * browser never applied.
 */
function rulesOf(path: string): CSSStyleRule[] {
  const el = document.createElement('style');
  el.textContent = read(path);
  document.head.append(el);
  const rules = [...el.sheet!.cssRules].filter((r): r is CSSStyleRule => r.type === CSSRule.STYLE_RULE);
  el.remove();
  return rules;
}

/** The declared value of one property on the rule with exactly this selector. */
function decl(path: string, selector: string, prop: string): string | undefined {
  const rule = rulesOf(path).find((r) => r.selectorText === selector);
  return rule?.style.getPropertyValue(prop) || undefined;
}

const pts = (months: string[]) => months.map((month, i) => ({ month, pct: [40, 66, 91][i % 3]!, closed: 2 }));
const axisOf = (root: ParentNode) => [...root.querySelectorAll('.ch-spark__ax')].map((el) => el.textContent);

describe('د5-1 — the sparkline axis names the two months the series actually spans (لوحة-31)', () => {
  it('reads both ends off the data, so no fixed pair of labels can satisfy two different series', () => {
    // identical shape, identical point count — only the calendar differs, which is exactly what a
    // hard-coded axis cannot follow
    const early = render(<Sparkline points={pts(['2025-11', '2025-12', '2026-01'])} lang="ar" />);
    const late = render(<Sparkline points={pts(['2026-03', '2026-07', '2026-09'])} lang="ar" />);

    expect(axisOf(early.container)).toEqual(['2025-11', '2026-01']);
    expect(axisOf(late.container)).toEqual(['2026-03', '2026-09']);
    // the ends, and nothing between them: a label per point is the reference's six-name row again
    expect(axisOf(early.container)).toHaveLength(2);
  });

  it('keeps refusing to exist below two points — the axis did not weaken the guard', () => {
    const { container } = render(<Sparkline points={[{ month: '2026-06', pct: 87, closed: 4 }]} lang="ar" />);
    expect(container.innerHTML).toBe('');
  });

  it('prints the real first and last month of the room’s own series', () => {
    const series = complianceSeries(seedState(), todayIso());
    window.location.hash = '#/admin';
    render(<App />);
    const room = document.querySelector('.op-page') as HTMLElement;

    if (series.length < 2) {
      // one derivable point is not a time series: no strip, and therefore no axis to name
      expect(room.querySelector('.ch-spark__ax')).toBeNull();
      return;
    }
    expect(axisOf(room)).toEqual([series[0]!.month, series[series.length - 1]!.month]);
  });

  it('locks the axis to the drawing’s own direction — an LTR island, never an inline offset', () => {
    expect(decl(CHARTS_CSS, '.ch-spark__axis', 'direction')).toBe('ltr');
    expect(decl(CHARTS_CSS, '.ch-spark__axis', 'justify-content')).toBe('space-between');
    expect(decl(CHARTS_CSS, '.ch-spark__ax', 'font-family')).toBe('var(--font-mono)');
  });
});

describe('د5-2 — the ط1 band is inert, and says why (لوحة-28)', () => {
  /**
   * The donut legend row for a tier. Scoped to the ring's own figure: the public home page draws
   * the same three tiers as a stacked bar, and that legend is inert for a different reason.
   */
  const rowFor = (tier: string): HTMLElement => {
    const fig = document.querySelector('.ch--donut') as HTMLElement;
    return fig.querySelector(`.ch-legend__sw[data-tier='${tier}']`)!.closest('.ch-legend__i') as HTMLElement;
  };

  it('gives ط1 no link, no pointer cursor, and both a hover title and a printed reason', () => {
    window.location.hash = '#/admin';
    render(<App />);
    const reason = i18n.t('ch.donut.inert');

    // the sentence exists in the bundle — i18next echoes a missing key back, which would otherwise
    // sail through every assertion below
    expect(reason).not.toBe('ch.donut.inert');
    expect(reason).toContain('سجل الموافقات');

    const op = rowFor('OPERATOR');
    expect(op.closest('a')).toBeNull();
    expect(op.classList.contains('ch-legend__i--inert')).toBe(true);
    expect(op.getAttribute('title')).toBe(reason);

    // …and the same reason where a touch or keyboard reader can actually reach it
    const note = document.querySelector('.ch-donut__note') as HTMLElement;
    expect(note.textContent).toBe(reason);

    // the inertness is TARGETED: the two bands that do have a chain are still real links
    for (const tier of ['JMC', 'MDOC']) {
      const link = rowFor(tier).closest('a') as HTMLAnchorElement;
      expect(link.getAttribute('href')).toBe(`#/admin/approvals?tier=${tier}`);
    }
  });

  it('never promises the click in CSS either — no legend or segment rule sets a pointer on it', () => {
    expect(decl(CHARTS_CSS, '.ch-legend__i--inert', 'cursor')).toBe('default');
    expect(decl(CHARTS_CSS, '.ch-donut__seg', 'cursor')).toBe('default');
    // only the band with a destination opts back in
    expect(decl(CHARTS_CSS, '.ch-donut__seg--link', 'cursor')).toBe('pointer');
    const pointerOnLegend = rulesOf(CHARTS_CSS).filter(
      (r) => r.selectorText.includes('.ch-legend__i') && r.style.getPropertyValue('cursor') === 'pointer',
    );
    expect(pointerOnLegend.map((r) => r.selectorText)).toEqual([]);
  });

  it('carries the reason in both languages', async () => {
    for (const lang of ['ar', 'en'] as const) {
      await i18n.changeLanguage(lang);
      expect(i18n.t('ch.donut.inert')).not.toBe('ch.donut.inert');
      expect(i18n.t('ch.donut.inert').length).toBeGreaterThan(20);
    }
    await i18n.changeLanguage('ar');
  });
});

describe('د5-3 — the room holds zero inline styles (acceptance criterion)', () => {
  it('has no `style=` left in FollowUpRoom.tsx', () => {
    const src = read(ROOM_SRC);
    // the prose explains what the sweep replaced, so the ban is asserted on the CODE alone
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/style=/);
    // …and no colour smuggled back in as a literal while the sweep was on
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('names every class the sweep created, in the sheet the room actually loads', () => {
    for (const [selector, prop, value] of [
      ['.ad-room', 'max-inline-size', '1240px'],
      ['.ad-panel--stacked', 'margin-block-start', '14px'],
      ['.ad-tblwrap', 'overflow-x', 'auto'],
      ['.ad-num--late', 'color', 'var(--status-delayed)'],
      ['.ad-note', 'text-align', 'start'],
    ] as const) {
      expect(decl(ADMIN_CSS, selector, prop), `${selector} { ${prop} }`).toBe(value);
    }
    // every one of them is actually worn — a rule nothing selects is the rule a later edit breaks
    const src = read(ROOM_SRC);
    for (const cls of ['ad-room', 'ad-panel--stacked', 'ad-tblwrap', 'ad-num--late', 'ad-note']) {
      expect(src, `${cls} is declared but never used`).toContain(cls);
    }
  });

  it('keeps the KPI grid on auto-fit — د10 owns those tiles and د5 did not touch them', () => {
    // the tile family moved to the shared sheet in د15-م2 (the operator register became its
    // seventh consumer); the room's grid is unchanged, only its address is
    expect(decl(TILE_CSS, '.ad-kpis--wrap', 'grid-template-columns')).toContain('auto-fit');
  });
});
