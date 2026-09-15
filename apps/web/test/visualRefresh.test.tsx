// @vitest-environment jsdom
import { Buffer as NodeBuffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, fireEvent, render, screen } from '@testing-library/react';
import {
  fonts as TS_FONTS,
  motion as TS_MOTION,
  orderStatus as TS_ORDER,
  primary as TS_PRIMARY,
  secondary as TS_SECONDARY,
  status as TS_STATUS,
  surface as TS_SURFACE,
  text as TS_TEXT,
} from '@masaar/tokens';
import { useCountUp } from '@masaar/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../src/i18n';
import App from '../src/App';
import { saveSession } from '../src/session';
import { NAV_MIN_KEY, NAV_SEC_KEY } from '../src/shellNav';
import { seedState } from '../src/store';
import { THEME_KEY } from '../src/theme';

/**
 * The visual refresh (ops/VISUAL-REFRESH-SPEC.md §2, §4) and the v2 token system
 * (ops/DESIGN-V2-SPEC.md §1, §2, §3).
 *
 * Four kinds of check live here, and the split is deliberate:
 *
 *  · The SHEET IS PARSED, never scraped. The first version of this file deleted comments with a
 *    non-greedy regex and then regex-matched `--name: value;` out of what was left. That is
 *    structurally blind, and it hid a shipped bug: an unopened comment-close turned eight lines of
 *    prose into a bad declaration, the CSS parser consumed its remnants up to the next `;` —
 *    deleting `--status-planned` in every browser and in the built bundle — and the scraper reported
 *    the token as present and correct. Everything below reads the CSSOM: a declaration a parser
 *    throws away is genuinely absent here too, so the assertion fails. A second, independent
 *    parser (esbuild, the one vite actually builds with) must also report ZERO warnings AND zero
 *    errors, on the minified pass as well — minification re-parses the nested at-rules the dark
 *    block now lives inside, and catches what the plain pass forgives.
 *
 *  · BOTH THEMES are resolved, the way a browser resolves them. `:root` is the light palette and
 *    `:root[data-theme='dark']` (inside `@media screen`) overrides part of it; a name the dark
 *    block does not redefine keeps its light value, and a `var()` inside a dark value resolves
 *    against the dark map. A suite that read only `:root` would have declared the whole dark
 *    palette compliant without looking at it once.
 *
 *  · CONTRAST is COMPUTED, and compared UNROUNDED. A test that pins `--text-3: #475569` proves only
 *    that nobody retyped the constant. Worse, the helper used to round to two places before
 *    comparing, so anything in [4.495, 4.5) passed as AA — and a real pair sat in that band.
 *    Rounding is for the failure message now, never for the comparison.
 *
 *  · BEHAVIOUR is rendered. The sidebar disclosure and the theme toggle are preferences, a forced
 *    open, a badge that must not swallow an alarm — none of which is visible to a type checker.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/**
 * esbuild — the parser vite builds this app with — is loaded here so a stylesheet can be handed to
 * a SECOND, independent parser and not only to jsdom's.
 *
 * It refuses to initialise under jsdom: its startup invariant is
 * `new TextEncoder().encode('') instanceof Uint8Array`, and jsdom's encoder returns a Uint8Array
 * built in jsdom's own realm while `Uint8Array` here resolves to node's — cross-realm
 * `instanceof` is false, which esbuild reads as a broken environment. The encoder below produces
 * bytes in whichever realm this module sees, so the invariant holds; the import is deferred until
 * after the swap because esbuild checks at load time.
 */
class RealmSafeTextEncoder {
  readonly encoding = 'utf-8';
  encode(input = ''): Uint8Array {
    const bytes = NodeBuffer.from(input, 'utf8');
    const out = new Uint8Array(bytes.length);
    out.set(bytes);
    return out;
  }
  encodeInto(input: string, dest: Uint8Array) {
    const encoded = this.encode(input);
    const written = Math.min(encoded.length, dest.length);
    dest.set(encoded.subarray(0, written));
    return { read: input.length, written };
  }
}
globalThis.TextEncoder = RealmSafeTextEncoder as unknown as typeof globalThis.TextEncoder;
const { transform } = await import('esbuild');

const TOKENS_PATH = 'packages/tokens/css/tokens.css';
const TOKENS = read(TOKENS_PATH);
/**
 * The sheet with its prose removed. Every "this value may never come back" check runs against
 * THIS, not against the raw text: the comments explain each correction by quoting the value it
 * replaced, so a ban asserted on the raw file would fail on its own rationale.
 */
const TOKENS_CODE = TOKENS.replace(/\/\*[\s\S]*?\*\//g, '');

/** The same treatment for any sheet: rules only, prose removed. */
const code = (path: string): string => read(path).replace(/\/\*[\s\S]*?\*\//g, '');

/** Every stylesheet the app ships. A malformed comment in any one of them is a shipped bug. */
const SHEETS = [
  TOKENS_PATH,
  'packages/ui/src/ui.css',
  'apps/web/src/styles.css',
  'apps/web/src/toast.css',
  'apps/web/src/operator/operator.css',
  'apps/web/src/admin/admin.css',
  'apps/web/src/registry/registry.css',
  'apps/web/src/charts/charts.css',
  'apps/web/src/report/report.css',
] as const;

/**
 * Every sheet that CONSUMES tokens — the nine above minus the one that defines them, plus the
 * strip. The legacy bridge was policed against this list while it stood; now that BUILD-2 has
 * deleted the block, the same list is what proves no retired name survived anywhere.
 */
const CONSUMER_SHEETS = [...SHEETS.slice(1), 'apps/web/src/whatsnew.css'];

/* ------------------------------------------------------------------ */
/*  parse, don't scrape — and parse BOTH roots                         */
/* ------------------------------------------------------------------ */

interface Sheet {
  /** custom properties off the `:root` rule that SURVIVED parsing — the light palette */
  decls: Record<string, string>;
  /** the subset `:root[data-theme='dark']` overrides */
  darkDecls: Record<string, string>;
  /** every style rule in source order, `@media` children included */
  all: { selector: string; style: CSSStyleDeclaration }[];
  /** the first rule for a selector, or a throw naming the sheet */
  rule: (selector: string) => CSSStyleDeclaration;
}

/** `:root[data-theme='dark']` however the parser chose to quote it. */
const DARK_ROOT = /^:root\[data-theme=["']?dark["']?\]$/;

function parse(css: string, label: string): Sheet {
  const el = document.createElement('style');
  el.textContent = css;
  document.head.appendChild(el);
  const sheet = el.sheet;
  if (!sheet) throw new Error(`${label} produced no stylesheet`);

  const decls: Record<string, string> = {};
  const darkDecls: Record<string, string> = {};
  const all: { selector: string; style: CSSStyleDeclaration }[] = [];
  const collect = (style: CSSStyleDeclaration, into: Record<string, string>) => {
    for (let i = 0; i < style.length; i++) {
      const name = style[i];
      into[name] = style.getPropertyValue(name).trim();
    }
  };
  const visit = (list: CSSRuleList) => {
    for (const r of Array.from(list) as (CSSStyleRule & { cssRules?: CSSRuleList })[]) {
      if (r.cssRules) { visit(r.cssRules); continue; }   // @media, @supports, @keyframes
      if (typeof r.selectorText !== 'string') continue;  // @font-face and friends
      all.push({ selector: r.selectorText, style: r.style });
      const sel = r.selectorText.replace(/\s+/g, '');
      // the light palette is declared ONCE, under two selectors: `:root` and `.theme-light`,
      // the class that re-anchors a subtree to paper inside a dark document (the A4 sheet)
      if (sel.split(',').includes(':root')) collect(r.style, decls);
      else if (DARK_ROOT.test(sel)) collect(r.style, darkDecls);
    }
  };
  visit(sheet.cssRules);
  el.remove();   // the sheet is read, not applied: nothing below styles a rendered tree

  return {
    decls,
    darkDecls,
    all,
    rule: (selector) => {
      const found = all.find((r) => r.selector === selector);
      if (!found) throw new Error(`${label} has no rule for ${selector}`);
      return found.style;
    },
  };
}

const sheetCache = new Map<string, Sheet>();
const sheetOf = (path: string): Sheet => {
  const hit = sheetCache.get(path);
  if (hit) return hit;
  const parsed = parse(read(path), path);
  sheetCache.set(path, parsed);
  return parsed;
};

const TOKEN_SHEET = parse(TOKENS, TOKENS_PATH);
const DECLS = TOKEN_SHEET.decls;
const DARK_DECLS = TOKEN_SHEET.darkDecls;

const THEMES = ['light', 'dark'] as const;
type Theme = (typeof THEMES)[number];

/** Every property this rule sets, as `name: value` — shorthands included, verbatim. */
function declarationsOf(style: CSSStyleDeclaration): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < style.length; i++) out[style[i]] = style.getPropertyValue(style[i]);
  return out;
}

/* ------------------------------------------------------------------ */
/*  a tiny CSS-variable resolver + the WCAG 2.x contrast formula        */
/* ------------------------------------------------------------------ */

/** The cascade, in one line: dark overrides where it speaks, light everywhere else. */
function declOf(name: string, theme: Theme): string | undefined {
  if (theme === 'dark' && DARK_DECLS[name] !== undefined) return DARK_DECLS[name];
  return DECLS[name];
}

function resolveVar(v: string, theme: Theme, depth = 0): string {
  const m = /^var\((--[\w-]+)\)$/.exec(v.trim());
  if (!m || depth >= 8) return v.trim();
  const next = declOf(m[1], theme);
  return next === undefined ? v.trim() : resolveVar(next, theme, depth + 1);
}

type Rgba = [number, number, number, number];

function toRgba(value: string, theme: Theme): Rgba {
  const v = resolveVar(value, theme);
  const hex = /^#([0-9a-fA-F]{6})$/.exec(v);
  if (hex) {
    const h = hex[1];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1];
  }
  const fn = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+)\s*)?\)$/.exec(v);
  if (fn) return [+fn[1], +fn[2], +fn[3], fn[4] === undefined ? 1 : +fn[4]];
  throw new Error(`not a colour (${theme}): ${value} → ${v}`);
}

const tokenRgba = (name: string, theme: Theme): Rgba => toRgba(declOf(name, theme) ?? '', theme);

/** Composite a (possibly translucent) colour over an opaque one. */
function over(fg: Rgba, bg: Rgba): Rgba {
  const a = fg[3];
  return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a), 1];
}

/**
 * The opaque colour a token actually paints. Half the dark palette is `rgba(...)` — badge fills,
 * ghost hovers, the secondary button — and a ratio taken against a translucent "background" is
 * a ratio against a colour nothing renders. Everything translucent is seated on the card first.
 */
const painted = (name: string, theme: Theme, base: '--bg-card' | '--bg-page' = '--bg-card'): Rgba =>
  over(tokenRgba(name, theme), tokenRgba(base, theme));

function luminance(c: Rgba): number {
  const lin = (x: number) => {
    const s = x / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
}

/**
 * WCAG 2.x contrast ratio, UNROUNDED.
 *
 * The spec's own tables quote three places, and quoting is where rounding belongs. Rounding before
 * the comparison silently widens every threshold in this file by 0.005 — enough to let
 * #666F7E on --bg-muted (4.496818…) report itself as a passing 4.50.
 */
function contrast(fg: Rgba, bg: Rgba): number {
  const a = luminance(over(fg, bg));
  const b = luminance(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** Assert a floor on the true ratio; the rounded figure appears only in the failure message. */
function expectRatio(fg: Rgba, bg: Rgba, floor: number, what: string) {
  const r = contrast(fg, bg);
  expect(r, `${what}: ${r.toFixed(4)}:1 — floor is ${floor}:1`).toBeGreaterThanOrEqual(floor);
}

const SURFACES = ['--bg-page', '--bg-card', '--bg-muted', '--bg-inset'] as const;

/** The six SCPP stage words. Names are fixed by StatusKey, i18n and StatusPill. */
const STATUSES = ['planned', 'progress', 'done', 'risk', 'delayed', 'blocked'] as const;
/** The six order-lifecycle families the six above project onto (§1-هـ). */
const ORDER_STATES = ['pending', 'approved', 'preparing', 'delivered', 'cancelled', 'late'] as const;

/** The colour stops of the sidebar gradient, read out of the token text itself. */
function sidebarStops(theme: Theme): Rgba[] {
  const raw = declOf('--side-bg', theme) ?? '';
  const stops = raw.match(/#[0-9a-fA-F]{6}|var\(--[\w-]+\)/g) ?? [];
  expect(stops.length, `--side-bg (${theme}) states no colour stop`).toBeGreaterThanOrEqual(2);
  return stops.map((s) => toRgba(s, theme));
}

/* ================================================================== */
/*  §1-0 — the sheet a browser parses is the sheet on disk             */
/* ================================================================== */

/** Turn an esbuild rejection into a failure that names the sheet and the parser's own message. */
const fail = (label: string) => (e: { errors?: { text: string }[] }): never => {
  throw new Error(`${label} did not parse: ${(e.errors ?? []).map((x) => x.text).join(' · ') || String(e)}`);
};

describe('§1-0 — the stylesheets survive a real CSS parser intact', () => {
  it.each(SHEETS)('%s transforms with zero warnings and zero errors', async (path) => {
    // esbuild is the parser vite builds with; a warning here IS the shipped bundle's bug. The one
    // that got through was `[WARNING] Expected ":" [css-syntax-error]` at tokens.css:66 — an
    // unopened `*/`, after which the parser ate --status-planned and the dist file carried the
    // fused garbage. `exit 0` on a warning is why nothing downstream noticed. Errors were never
    // asserted at all, which is the same blind spot one severity up.
    // an ERROR is thrown rather than returned, so it is caught and re-thrown named: an unnamed
    // rejection here would read as a broken test rather than as a broken stylesheet
    const { warnings } = await transform(read(path), { loader: 'css' }).catch(fail(path));
    expect(warnings.map((w) => `${path}:${w.location?.line}:${w.location?.column} ${w.text}`)).toEqual([]);
  });

  it('tokens.css also survives MINIFICATION, which re-parses the nested at-rules', async () => {
    // the dark palette lives in `@media screen { :root[data-theme='dark'] { … } }`; the plain pass
    // copies an at-rule body through nearly verbatim, the minifying pass has to understand it
    const { warnings, code } = await transform(TOKENS, { loader: 'css', minify: true })
      .catch(fail(`${TOKENS_PATH} (minified)`));
    expect(warnings.map((w) => w.text)).toEqual([]);
    expect(code).toContain('data-theme');   // the block survived the squeeze
  });

  it('every token the suite pins is actually present in the parsed CSSOM', () => {
    // a regex scraper reports a deleted declaration as present; the CSSOM cannot
    for (const name of [
      '--text-1', '--text-2', '--text-3', '--text-muted', '--text-disabled',
      '--status-planned', '--status-progress', '--status-done',
      '--status-risk', '--status-delayed', '--status-blocked',
      '--border-1', '--border-2', '--border-control', '--mark-accent', '--link',
      '--chart-track', '--chart-sep', '--chart-neutral',
      '--elev-rest', '--elev-hover', '--elev-overlay', '--lift', '--focus-ring', '--dur-fast',
      '--side-bg', '--side-fg', '--side-fg-2',
    ]) {
      expect(DECLS[name], `${name} did not survive parsing`).toBeTruthy();
    }
    // the exact declaration the stray comment close deleted, and its neighbour that survived:
    // both must read back, or the comment block has come apart again
    expect(resolveVar(DECLS['--status-planned'], 'light')).toBe('#475569');
    expect(resolveVar(DECLS['--status-planned-bg'], 'light')).toBe('#E2E8F0');
  });

  it('the dark root is a real, separate rule the parser found — not prose in a comment', () => {
    expect(Object.keys(DARK_DECLS).length).toBeGreaterThan(30);
    expect(DARK_DECLS['--bg-page']).toBeTruthy();
    expect(DARK_DECLS['color-scheme'] ?? 'dark').toBe('dark');
  });
});

/* ================================================================== */
/*  §1 — tokens, in BOTH themes                                        */
/* ================================================================== */

describe.each(THEMES)('§1 [%s] — the ink scale is readable on every surface it lands on', (theme) => {
  it.each(['--text-1', '--text-2', '--text-3', '--text-muted'])(
    '%s clears 4.5:1 on page, card, muted and inset',
    (ink) => {
      // --text-muted is no longer exempted from --bg-inset the way --ink-4 was: the derived
      // #5A687D reaches 4.590 there, so the placement rule that used to be written down here as
      // prose is now simply unnecessary.
      for (const surface of SURFACES) {
        expectRatio(tokenRgba(ink, theme), tokenRgba(surface, theme), 4.5, `${ink} on ${surface} (${theme})`);
      }
    },
  );

  it('keeps --text-disabled below AA on purpose — the 1.4.3 inactive-component exemption', () => {
    expect(contrast(tokenRgba('--text-disabled', theme), tokenRgba('--bg-card', theme))).toBeLessThan(4.5);
  });

  it('never spends #94A3B8 on live text — it is the disabled step in light and a surface elsewhere', () => {
    for (const ink of ['--text-1', '--text-2', '--text-3', '--text-muted']) {
      expect(resolveVar(declOf(ink, theme) ?? '', theme).toUpperCase(), `${ink} (${theme})`).not.toBe('#94A3B8');
    }
  });
});

describe('§1 — the ink scale carries the corrected values, and every superseded one is gone', () => {
  it('derives --text-muted rather than borrowing --surface-500, which fails on two surfaces', () => {
    expect(DECLS['--text-muted']).toBe('#5A687D');
    // #64748B (--surface-500) is 4.344 on --bg-muted and 3.860 on --bg-inset while carrying read text
    expect(contrast(toRgba('#64748B', 'light'), tokenRgba('--bg-inset', 'light'))).toBeLessThan(4.5);
  });

  it('lightens the dark tertiary, and declares the muted/tertiary merge instead of leaving it to chance', () => {
    expect(DARK_DECLS['--text-3']).toBe('#A0AEC0');
    // v2 wrote both as #94A3B8 — a coincidence, not a decision. Here the merge is spelled out.
    expect(DARK_DECLS['--text-muted']).toBe('var(--text-3)');
    expect(contrast(toRgba('#94A3B8', 'dark'), tokenRgba('--bg-inset', 'dark'))).toBeLessThan(4.5);
  });

  it('bars every ink value the audits retired', () => {
    // #6B7686 fell to 3.73 on --bg-inset, #98A1B0 to 2.11, #666F7E was the near-miss that only
    // cleared AA if you rounded first; #5A6474 / #656E7D were the v1 corrections the v2 ladder replaces
    for (const dead of ['#6B7686', '#98A1B0', '#666F7E', '#5A6474', '#656E7D']) {
      expect(TOKENS_CODE, `${dead} is back`).not.toContain(dead);
    }
  });

  it('spends the disabled ink only where the component is genuinely INACTIVE', () => {
    /**
     * This used to whitelist by selector NAME — `/:disabled|__m$|--todo|--no|--session/` — a list
     * written to match the four selectors that were violating the rule, so it green-lit exactly
     * the misuse it was meant to police, and would green-light any future selector ending in
     * `__m` or `--no`. The rule is semantic: 1.4.3's exemption covers text inside a component
     * that CANNOT BE OPERATED, and `:disabled` is the only selector in CSS that means that. A
     * mark in enabled content does not qualify however quiet it is meant to look.
     *
     * Both names are policed while the bridge stands: the component sheets still say
     * `--ink-disabled`, and BUILD-2 renames them to `--text-disabled` sheet by sheet.
     */
    const sites = SHEETS.flatMap((path) =>
      sheetOf(path).all
        // the two roots DEFINE the token (and the bridge alias points at it); everything else SPENDS it
        .filter((r) => !/^:root/.test(r.selector.replace(/\s+/g, '')))
        .filter((r) => Object.values(declarationsOf(r.style)).some((v) => /--(?:ink|text)-disabled/.test(v)))
        .map((r) => `${path} ${r.selector}`),
    );
    expect(sites.length).toBeGreaterThan(0);
    for (const site of sites) expect(site, `${site} is not an inactive control`).toMatch(/:disabled\b/);
  });

  it('the four live marks that had borrowed the exemption still compute clean', () => {
    /**
     * Each is informational content in an ENABLED component — a capability cell with an
     * aria-label, the stage NUMBER in a contract tracker, the met/unmet mark in a live checklist
     * — so each is text and answers to 4.5:1, not to the 3:1 non-text floor and not to the
     * exemption. `surface` is the painted background behind the glyph: the rule's own background
     * where it sets one, and the container's where the rule is transparent.
     */
    const MARKS = [
      { sheet: 'apps/web/src/admin/admin.css', selector: '.acc-cell--no', surface: '--bg-card', was: 2.61 },
      { sheet: 'apps/web/src/admin/admin.css', selector: '.acc-cell--session', surface: '--bg-card', was: 1.55 },
      { sheet: 'apps/web/src/admin/admin.css', selector: '.ctr-stage__dot--todo', surface: '--bg-muted', was: 2.31 },
      { sheet: 'apps/web/src/operator/operator.css', selector: '.wz-cond__m', surface: '--bg-inset', was: 2.11 },
    ] as const;

    for (const m of MARKS) {
      const style = sheetOf(m.sheet).rule(m.selector);
      const decls = declarationsOf(style);
      expect(decls.color, `${m.selector} sets no colour`).toBeTruthy();
      expect(decls.color, `${m.selector} still claims the inactive exemption`).not.toMatch(/--(?:ink|text)-disabled/);
      // an opacity on top of an already-quiet ink is contrast laundering: .acc-cell--session
      // stacked 0.5 and landed at 1.55:1, worse than anything the token was ever meant to permit
      expect(decls.opacity, `${m.selector} stacks opacity on its ink`).toBeUndefined();
      // where the rule paints its own background it must be the surface we are computing against
      if (decls.background && decls.background !== 'transparent') {
        expect(decls.background).toContain(m.surface.replace('--', ''));
      }
      expectRatio(toRgba(decls.color, 'light'), tokenRgba(m.surface, 'light'), 4.5, `${m.selector} on ${m.surface}`);
      expect(m.was).toBeLessThan(3); // what it used to be, kept so the regression is legible
    }
  });

  it('the TypeScript mirror carries the same values as the sheet it claims to mirror', () => {
    // packages/tokens/src/index.ts calls itself "TypeScript mirror of css/tokens.css" and had
    // drifted to five superseded values. Latent (the one import is type-only) is not the same as
    // harmless: it was a second source of truth that neither typecheck nor any test could see.
    // TypeScript cannot resolve var(), so the mirror holds RESOLVED values and so does this check.
    const resolved = (name: string) => resolveVar(declOf(name, 'light') ?? '', 'light');
    const bare = (s: string) => s.replace(/\s+/g, '');

    for (const [key, value] of Object.entries(TS_PRIMARY)) expect(value, `primary.${key}`).toBe(DECLS[`--primary-${key}`]);
    for (const [key, value] of Object.entries(TS_SECONDARY)) expect(value, `secondary.${key}`).toBe(DECLS[`--secondary-${key}`]);
    for (const [key, value] of Object.entries(TS_SURFACE)) expect(value, `surface.${key}`).toBe(DECLS[`--surface-${key}`]);

    expect(TS_TEXT[1]).toBe(resolved('--text-1'));
    expect(TS_TEXT[2]).toBe(resolved('--text-2'));
    expect(TS_TEXT[3]).toBe(resolved('--text-3'));
    expect(TS_TEXT.muted).toBe(resolved('--text-muted'));
    expect(TS_TEXT.disabled).toBe(resolved('--text-disabled'));

    for (const name of STATUSES) {
      expect(TS_STATUS[name].fg, `status.${name}.fg`).toBe(resolved(`--status-${name}`));
      expect(TS_STATUS[name].bg, `status.${name}.bg`).toBe(resolved(`--status-${name}-bg`));
      expect(TS_STATUS[name].bd, `status.${name}.bd`).toBe(resolved(`--status-${name}-bd`));
    }
    for (const name of ORDER_STATES) {
      for (const part of ['base', 'fg', 'bg', 'bd'] as const) {
        expect(TS_ORDER[name][part], `orderStatus.${name}.${part}`).toBe(resolved(`--st-${name}-${part}`));
      }
    }

    expect(bare(TS_FONTS.sans)).toBe(bare(DECLS['--font-sans']));
    expect(bare(TS_FONTS.mono)).toBe(bare(DECLS['--font-mono']));
    expect(`${TS_MOTION.durFast}ms`).toBe(DECLS['--dur-fast']);
    expect(`${TS_MOTION.durBase}ms`).toBe(DECLS['--dur-base']);
    expect(`${TS_MOTION.durSlow}ms`).toBe(DECLS['--dur-slow']);
    expect(bare(TS_MOTION.easeOut)).toBe(bare(DECLS['--ease-out']));
    // v2 knows ONE curve; a second name with one consumer was a second easing vocabulary
    expect((TS_MOTION as Record<string, unknown>).easeInOut).toBeUndefined();
  });
});

describe.each(THEMES)('§1 [%s] — status colours clear AA against their own soft pair AND every surface', (theme) => {
  it.each(STATUSES)('%s reads on its own -bg', (name) => {
    expectRatio(
      tokenRgba(`--status-${name}`, theme),
      painted(`--status-${name}-bg`, theme),
      4.5,
      `--status-${name} on its pair (${theme})`,
    );
  });

  it.each(STATUSES)('%s also reads on all four surfaces', (name) => {
    // a status colour is not surface-bound: it is the colour of a word (.wz-gate, .op-dev,
    // .file-tl__done) as much as of a pill, and it lands wherever that word lands. Testing it
    // only against its own soft pair is how #945D17 kept a 4.44 on --bg-inset.
    for (const surface of SURFACES) {
      expectRatio(tokenRgba(`--status-${name}`, theme), tokenRgba(surface, theme), 4.5, `--status-${name} on ${surface} (${theme})`);
    }
  });

  it('carries a border for every status — the v2 badge has one, and it is not optional', () => {
    for (const name of STATUSES) {
      expect(declOf(`--status-${name}-bd`, theme), `--status-${name}-bd (${theme})`).toBeTruthy();
    }
  });

  it.each(ORDER_STATES)('--st-%s is a complete family and its fg reads on its own bg', (name) => {
    for (const part of ['base', 'fg', 'bg', 'bd'] as const) {
      expect(declOf(`--st-${name}-${part}`, theme), `--st-${name}-${part} (${theme})`).toBeTruthy();
    }
    expectRatio(
      tokenRgba(`--st-${name}-fg`, theme),
      painted(`--st-${name}-bg`, theme),
      4.5,
      `--st-${name}-fg on its own bg (${theme})`,
    );
  });

  it.each(ORDER_STATES)('--st-%s-base clears the 3:1 graphical floor where a dot is drawn', (name) => {
    // the dot and the chart mark sit on the page or on a card — never inside an --bg-inset well,
    // where a saturated base would need to be a text colour to survive
    for (const surface of ['--bg-page', '--bg-card'] as const) {
      expectRatio(tokenRgba(`--st-${name}-base`, theme), tokenRgba(surface, theme), 3, `--st-${name}-base on ${surface} (${theme})`);
    }
  });

  it('projects the stage vocabulary onto the order families LITERALLY — one value, two names', () => {
    // §1-د is a projection, not a second ladder: if these ever drift apart, a stage word and the
    // order state it means would be two different colours on the same screen.
    const PROJECTION = {
      progress: 'preparing', done: 'approved', risk: 'pending', delayed: 'late', blocked: 'cancelled',
    } as const;
    for (const [stage, order] of Object.entries(PROJECTION)) {
      for (const [a, b] of [['', '-fg'], ['-bg', '-bg'], ['-bd', '-bd']] as const) {
        expect(
          resolveVar(declOf(`--status-${stage}${a}`, theme) ?? '', theme),
          `--status-${stage}${a} vs --st-${order}${b} (${theme})`,
        ).toBe(resolveVar(declOf(`--st-${order}${b}`, theme) ?? '', theme));
      }
    }
    // planned is the one that projects onto nothing: grey by definition, not by lifecycle
    expect(resolveVar(declOf('--status-planned', theme) ?? '', theme))
      .toBe(resolveVar(declOf(theme === 'dark' ? '--surface-300' : '--surface-600', theme) ?? '', theme));
  });
});

/**
 * Every token whose ROLE is ink, in both themes — the role the four dead values failed at.
 *
 * The four bans below used to be spelled as `TOKENS_CODE.not.toContain(hex)`, i.e. «this string may
 * never appear in the file». That was the right INTENT expressed one level too coarsely, and §2-ط
 * proved it: three of the four values are perfectly sound as a FILL under `--status-on-fill`
 * (#B45309 → 5.022, #15803D → 5.016, #A78BFA → 7.413 measured below), and the file-wide grep would
 * have refused them for a failure they never committed in that role. It was also weaker than it
 * looked in the other direction — it could not see the value arriving as `--st-pending-fg:
 * var(--something-that-resolves-to-B45309)`, which is the same defect wearing a name.
 *
 * The ban is therefore on the ROLE and it RESOLVES: no ink token, under either theme, may hold one
 * of the four again — by literal or by alias.
 */
const INK_NAMES = [...new Set([...Object.keys(DECLS), ...Object.keys(DARK_DECLS)])].filter((n) => n.endsWith('-fg'));

function expectRetiredAsInk(dead: string) {
  for (const theme of THEMES) {
    for (const name of INK_NAMES) {
      expect(resolveVar(declOf(name, theme) ?? '', theme).toUpperCase(), `${dead} is back as ${name} (${theme})`)
        .not.toBe(dead);
    }
  }
}

describe('§1 — the four contrast corrections v2 needed are actually in the sheet', () => {
  it('darkens the two light foregrounds that failed on --bg-inset', () => {
    expect(DECLS['--st-pending-fg']).toBe('#A84D08');   // v2 #B45309 → 4.073
    expect(DECLS['--st-approved-fg']).toBe('#147739');  // v2 #15803D → 4.069
    for (const dead of ['#B45309', '#15803D']) expectRetiredAsInk(dead);
  });

  it('lightens the two dark foregrounds that failed on --bg-inset', () => {
    expect(DARK_DECLS['--st-preparing-fg']).toBe('#C4B5FD');   // v2 #A78BFA → 3.805
    expect(DARK_DECLS['--st-cancelled-fg']).toBe('#FCA5A5');   // v2 #F87171 → 3.743
    for (const dead of ['#A78BFA', '#F87171']) expectRetiredAsInk(dead);
    // #F87171 has no second role: it is not a fill either, so the file-wide ban still holds for it
    expect(TOKENS_CODE, '#F87171 is back').not.toContain('#F87171');
  });
});

/* ================================================================== */
/*  §2-ط — the measured fill palette for statistic tiles               */
/* ================================================================== */

/**
 * CSS specificity as (ids, classes, types), counted the way the cascade counts it.
 *
 * Deliberately small — it understands the grammar these sheets actually use (types, classes,
 * attributes, pseudo-classes and -elements, combinators) and nothing more. It exists because a
 * measured palette is worth nothing if a rule written EARLIER in the sheet quietly out-specifies
 * the one that paints the ink, which is exactly the defect the test below was written for.
 *
 * The functional pseudo-classes take their specificity from their ARGUMENT, not from being a
 * pseudo-class, and a counter that quietly got that wrong would mis-rank the cascade while
 * reporting success — the very failure mode this helper is here to end. It therefore refuses them
 * out loud instead of guessing; today no sheet uses one.
 */
function specificity(selector: string): [number, number, number] {
  if (/:(not|is|where|has)\(/.test(selector)) {
    throw new Error(`specificity() cannot rank «${selector}» — a functional pseudo-class needs its argument counted`);
  }
  let s = ` ${selector.trim()} `;
  let cls = 0;
  let type = 0;
  s = s.replace(/\[[^\]]*\]/g, () => { cls++; return ' '; });          // [attr] counts as a class
  s = s.replace(/::[\w-]+/g, () => { type++; return ' '; });           // ::pseudo-element as a type
  s = s.replace(/:[\w-]+(\([^)]*\))?/g, () => { cls++; return ' '; }); // :pseudo-class as a class
  const id = (s.match(/#[\w-]+/g) ?? []).length;
  s = s.replace(/#[\w-]+/g, ' ');
  cls += (s.match(/\.[\w-]+/g) ?? []).length;
  s = s.replace(/\.[\w-]+/g, ' ');
  type += (s.match(/[a-zA-Z][\w-]*/g) ?? []).length;
  return [id, cls, type];
}

/** `a` beats `b` in the cascade at equal origin: higher specificity, or a tie broken by order. */
const outranks = (a: [number, number, number], b: [number, number, number]): boolean =>
  a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] >= b[2];

/**
 * The declaration a browser would actually apply for `property` on `el`, from one sheet.
 *
 * Every rule is asked `el.matches(...)` — jsdom's own selector engine, so a resting element does
 * not match `:hover` and a descendant selector does not match the element itself — and the survivor
 * is the highest-specificity match, last one wins on a tie. Returns the value AND the selector, so
 * a failure can name the rule that took the decision away.
 */
function winningDeclaration(path: string, el: Element, property: string): { selector: string; value: string } | null {
  let best: { selector: string; value: string; spec: [number, number, number] } | null = null;
  for (const rule of sheetOf(path).all) {
    const value = rule.style.getPropertyValue(property);
    if (!value) continue;
    for (const part of rule.selector.split(',')) {
      const sel = part.trim();
      let hit = false;
      try { hit = el.matches(sel); } catch { continue; }   // a selector jsdom cannot parse decides nothing
      if (!hit) continue;
      const spec = specificity(sel);
      if (!best || outranks(spec, best.spec)) best = { selector: sel, value, spec };
    }
  }
  return best && { selector: best.selector, value: best.value };
}

/**
 * The families of §2-ط, in the order the table declares them.
 *
 * `jmc`/`mdoc` are the two LADDER tones. They are not a seventh and eighth improvised shade: each
 * is a second name for the rung of the authority ladder its tile has always spoken (`--tier-jmc`,
 * `--tier-mdoc` — the colour the dot wore before the fill), so «بانتظار ط2» and «بانتظار ط3» read
 * apart again without a new colour entering the system. They are measured here exactly like the
 * six, on every gate: ink, separation, inversion, satin, and the tone map.
 */
const FILLS = ['brand', 'risk', 'delayed', 'progress', 'done', 'planned', 'jmc', 'mdoc'] as const;
const fillName = (f: (typeof FILLS)[number]) => `--status-${f}-fill`;

/**
 * WHERE the one filled-tile family lives. It was authored in `admin.css` while all six of its
 * consumers were admin screens; د15-م2 made the operator's own register the seventh, so the whole
 * family — anatomy, tone map, filled variants, the pulse — moved to the sheet BOTH shells load
 * (the one that already owns `.op-side, .ad-side` and `.ad-modal`). Every gate below reads it
 * here, so the address is stated once: a future move updates this line and nothing else, and the
 * §2-ط cascade, satin geometry and tone-map gates keep measuring the very same rules.
 */
const TILE_SHEET = 'apps/web/src/operator/operator.css';

describe('§2-ط — the statistic tile fills are measured, not chosen', () => {
  it('declares every family in BOTH themes — a fill that only exists in one is half a decision', () => {
    for (const f of FILLS) {
      expect(DECLS[fillName(f)], `${fillName(f)} is missing from :root`).toBeTruthy();
      expect(DARK_DECLS[fillName(f)], `${fillName(f)} is missing from the dark block`).toBeTruthy();
    }
    expect(DECLS['--satin'], '--satin is missing').toBeTruthy();
  });

  /**
   * THE GATE the batch exists to install (§2-ط-و).
   *
   * The reference's own filled tiles are the reason: `#16A34A` measures 3.296 against white and
   * `#D97706` 3.186 — a palette that looks professional and cannot be read. Every value here is
   * checked against the ink that ACTUALLY lands on it in that theme, unrounded, and any drop below
   * AA fails the build rather than shipping.
   */
  describe.each(THEMES)('[%s] every fill carries its ink at AA', (theme) => {
    const ink = () => tokenRgba('--status-on-fill', theme);
    it.each(FILLS)('%s', (f) => {
      expectRatio(ink(), tokenRgba(fillName(f), theme), 4.5, `--status-on-fill on ${fillName(f)} (${theme})`);
    });
  });

  /**
   * The tile must also be a TILE — a filled block that does not separate from the paper it sits on
   * is a wash, and the active-filter ring is drawn in this very colour (`.ad-kpi--fill[aria-pressed]`
   * halos with `--tile-fill`), so this is the ring's contrast too, not only the tile's.
   * The dark floor is 3.7 rather than 4.5 deliberately: on a dark ground a bright block is a
   * non-text graphical object under 1.4.11, whose floor is 3:1 — 3.7 keeps real headroom over it.
   */
  describe.each(THEMES)('[%s] every fill separates from the surfaces it sits on', (theme) => {
    const floor = theme === 'light' ? 4.5 : 3.7;
    it.each(FILLS)('%s', (f) => {
      for (const surface of ['--bg-page', '--bg-card'] as const) {
        expectRatio(tokenRgba(fillName(f), theme), tokenRgba(surface, theme), floor, `${fillName(f)} on ${surface} (${theme})`);
      }
    });
  });

  it('inverts between the modes on purpose — light fills are DARKER than their dark twins', () => {
    // «فاتح = ملء غامق بحبر أبيض · داكن = ملء ساطع بحبر شبه أسود». Stated in the plan, and only
    // true if the arithmetic says so: a family that forgot to flip would still pass the AA gate
    // above (against the WRONG ink) and read as a hole punched in the page.
    for (const f of FILLS) {
      expect(luminance(tokenRgba(fillName(f), 'light')), `${fillName(f)} did not invert`)
        .toBeLessThan(luminance(tokenRgba(fillName(f), 'dark')));
    }
    // and the ink inverts with them — the premise the whole gate rests on
    expect(luminance(tokenRgba('--status-on-fill', 'light')))
      .toBeGreaterThan(luminance(tokenRgba('--status-on-fill', 'dark')));
  });

  /**
   * The two ladder tones exist to carry a DISTINCTION, so the distinction is what is asserted.
   *
   * Before the fill, «بانتظار ط2» and «بانتظار ط3» were told apart by their dots (`--tier-jmc` /
   * `--tier-mdoc`); filling both with `brand` erased that, and a row of identical blue tiles is a
   * quieter regression than a broken one. Each fill is pinned to the ladder rung it claims — so it
   * can never drift into an eighth invented shade — and the two are required to differ in both
   * themes, which is the property that was actually lost.
   */
  it.each(THEMES)('[%s] keeps the two ladder tones distinct and anchored to the ladder', (theme) => {
    const seen = (name: string) => resolveVar(declOf(name, theme) ?? '', theme);
    expect(seen('--status-jmc-fill'), `--status-jmc-fill left the ladder (${theme})`).toBe(seen('--tier-jmc'));
    expect(seen('--status-mdoc-fill'), `--status-mdoc-fill left the ladder (${theme})`).toBe(seen('--tier-mdoc'));
    expect(seen('--status-jmc-fill'), `ط2 and ط3 wear one colour again (${theme})`)
      .not.toBe(seen('--status-mdoc-fill'));
  });

  it('is defined in tokens.css and NOWHERE else — one palette, not one per screen', () => {
    for (const path of CONSUMER_SHEETS) {
      const css = code(path);
      for (const f of FILLS) {
        expect(css, `${path} re-declares ${fillName(f)}`).not.toMatch(new RegExp(`${fillName(f)}\\s*:`));
      }
      expect(css, `${path} re-declares --satin`).not.toMatch(/--satin\s*:/);
    }
  });

  /**
   * The ONE class that spends them (§2-ط-ج). A screen that wants a filled tile writes a tone NAME;
   * it cannot write a colour, because the map from name to fill lives here and only here.
   */
  it('spends them through a single `.ad-fill[data-tone]` map that names no colour', () => {
    const admin = sheetOf(TILE_SHEET);
    const tones = admin.all.filter((r) => /^\.ad-fill\[data-tone=/.test(r.selector.replace(/\s+/g, '')));
    expect(tones.length, `the tone map is not ${FILLS.length} rules long`).toBe(FILLS.length);
    for (const rule of tones) {
      const decls = declarationsOf(rule.style);
      // exactly one declaration, and it is a `var()` into the palette — never a literal
      expect(Object.keys(decls), `${rule.selector} does more than pick a fill`).toEqual(['--tile-fill']);
      expect(decls['--tile-fill'], `${rule.selector} names a colour instead of a family`)
        .toMatch(new RegExp(`^var\\(--status-(${FILLS.join('|')})-fill\\)$`));
    }
    // every family the palette declares is actually reachable by NAME, and no tone maps twice
    expect(tones.map((r) => /data-tone=['"]?([\w-]+)/.exec(r.selector)?.[1]).sort())
      .toEqual([...FILLS].sort());
    // and the surface itself takes the satin from the token rather than re-writing the gradient
    expect(declarationsOf(admin.rule('.ad-fill'))['background-image']).toBe('var(--satin)');
  });

  /**
   * §2-ط-د — hierarchy inside a fully-filled row is carried by MOTION, not by a louder colour, and
   * the frame it uses is the one tokens.css already owns (د1). A local `@keyframes` here would be a
   * second definition of one animation, and — worse — one the reduced-motion block in tokens.css
   * was written to cover.
   */
  it('pulses the late tile with the shared frame and defines no second copy of it', () => {
    const tiles = code(TILE_SHEET);
    expect(tiles).toMatch(/\.ad-kpi__dot--alert\s*\{[^}]*animation:\s*pulse-soft/);
    // the frame itself belongs to tokens.css: NO consumer sheet may declare a second `pulse-soft`,
    // or the reduced-motion block written to freeze it would be freezing the wrong copy
    for (const sheet of CONSUMER_SHEETS) {
      expect(code(sheet), `${sheet} declares a second pulse-soft`).not.toMatch(/@keyframes\s+pulse-soft/);
    }
    expect(code('apps/web/src/admin/admin.css'), 'admin.css defines its own keyframes').not.toContain('@keyframes');
  });

  /**
   * THE CASCADE GATE — the defect this test was written for actually shipped.
   *
   * The follow-up room's seven tiles are `<a>`, and `a.ad-kpi--link { color: inherit }` (0,1,1) is
   * declared EARLIER in admin.css than `.ad-fill { color: var(--status-on-fill) }` (0,1,0). Earlier
   * did not matter: the qualified selector simply out-specifies the class, so the element's colour
   * stayed the page ink — and `.ad-kpi__dot { background: currentColor }` painted the status dot in
   * `--text-1` on a measured fill, at 2.36–3.56 instead of 5.0–7.6. Every gate above passed while
   * it did, because every gate above measures the PALETTE and none of them measured the cascade.
   *
   * So this one resolves the cascade. It fails if `a.ad-fill` is deleted, if it is moved above
   * `a.ad-kpi--link`, or if anything is ever added that out-specifies it — which is the whole point.
   */
  it('lets the FILL win the ink on a link tile — the rule that paints `color` is the measured one', () => {
    const tile = document.createElement('a');
    tile.className = 'ad-kpi ad-fill ad-kpi--fill ad-kpi--link';
    tile.setAttribute('data-tone', 'delayed');
    tile.setAttribute('href', '#/admin/tenders?status=delayed');

    const won = winningDeclaration(TILE_SHEET, tile, 'color');
    expect(won, `nothing in ${TILE_SHEET} sets a colour on the filled link tile`).toBeTruthy();
    expect(won?.value, `\`${won?.selector}\` takes the ink away from the fill`).toBe('var(--status-on-fill)');
    // and it wins WITHOUT the sledgehammer — a measured palette that needs !important to land is
    // a palette one more rule away from losing again. Asserted on the tile family's own rules, so
    // the gate keeps measuring the block itself wherever the block lives.
    for (const rule of sheetOf(TILE_SHEET).all.filter((r) => /\.ad-(kpi|fill)/.test(r.selector))) {
      for (const prop of Object.keys(declarationsOf(rule.style))) {
        expect(rule.style.getPropertyPriority(prop), `\`${rule.selector}\` reaches for !important`).toBe('');
      }
    }
    expect(code('apps/web/src/admin/admin.css'), 'admin.css reaches for !important').not.toContain('!important');

    // the dot is `currentColor`, so the ink the cascade just settled IS the dot's fill: proving the
    // ratio for the ink proves it for the dot, in both themes and on every tone the room spends
    expect(declarationsOf(sheetOf(TILE_SHEET).rule('.ad-kpi--fill .ad-kpi__dot')).background)
      .toBe('currentColor');
  });

  /**
   * §2-ط-ب — the satin, brought INSIDE the measured gate instead of being argued for in prose.
   *
   * The gradient lays white over the fill, so the ratio the gate above proves is not the ratio a
   * glyph actually sits on. The geometry that makes it safe is real and checkable: the white decays
   * to its second stop within 6px, `.ad-kpi`'s block padding is 14px, so no text pixel is above
   * that stop and below it the white only fades further. That second stop's alpha is therefore the
   * honest CEILING on how much the satin can lighten the ground under any ink — and it is that
   * composite, not the flat fill, that has to clear AA.
   */
  describe('the satin cannot lighten a fill out of AA', () => {
    const admin = () => sheetOf(TILE_SHEET);
    /** Every colour stop of `--satin`, in order, as (colour, position). */
    const stops = (): { colour: Rgba; at: string }[] => {
      const raw = DECLS['--satin'] ?? '';
      const out: { colour: Rgba; at: string }[] = [];
      const re = /(rgba?\([^)]*\))\s*([\d.]+(?:px|%)?)/g;
      for (let m = re.exec(raw); m; m = re.exec(raw)) out.push({ colour: toRgba(m[1], 'light'), at: m[2] });
      return out;
    };

    it('keeps its highlight above the first line of ink — the geometry the ceiling rests on', () => {
      const s = stops();
      expect(s.length, '--satin declares fewer than two stops').toBeGreaterThanOrEqual(2);
      // the tile's own block padding, read off the rule rather than assumed
      const padTop = /^(\d+)px/.exec(declarationsOf(admin().rule('.ad-kpi')).padding ?? '');
      expect(padTop, '.ad-kpi no longer states its block padding in px').toBeTruthy();
      const decayAt = /^(\d+)px$/.exec(s[1].at);
      expect(decayAt, `--satin's second stop is at ${s[1].at}, not a px offset the padding can clear`).toBeTruthy();
      expect(Number(decayAt?.[1]), 'the highlight reaches past the first line of ink')
        .toBeLessThanOrEqual(Number(padTop?.[1]));
      // and it is DECAYING there: a second stop no lighter than the first would move the ceiling
      expect(s[1].colour[3], '--satin does not fade its highlight').toBeLessThan(s[0].colour[3]);
      // nothing further down re-lightens past that ceiling (the tail is the darkening half)
      for (const later of s.slice(2)) {
        expect(luminance(later.colour) * later.colour[3], `--satin re-lightens at ${later.at}`)
          .toBeLessThanOrEqual(luminance(s[1].colour) * s[1].colour[3]);
      }
    });

    /**
     * The measured floor, light mode only and deliberately: white over a light fill lightens it
     * TOWARDS the white ink, which is the direction that loses contrast. In dark mode the same
     * white moves a bright fill AWAY from near-black ink, so the highlight can only help there.
     */
    it.each(FILLS)('%s survives the highlight in light mode', (f) => {
      const ground = over(stops()[1].colour, tokenRgba(fillName(f), 'light'));
      expectRatio(tokenRgba('--status-on-fill', 'light'), ground, 4.5, `--status-on-fill on satined ${fillName(f)}`);
    });
  });
});

describe.each(THEMES)('§1 [%s] — the functional border and the meaningful mark clear 3:1', (theme) => {
  it('--border-control is the control edge and reaches 3:1 over every surface', () => {
    // v2 writes «≥3:1» beside #94A3B8 and does not reach it: 2.451 / 2.564 / 2.340 / 2.080.
    for (const surface of SURFACES) {
      expectRatio(tokenRgba('--border-control', theme), tokenRgba(surface, theme), 3, `--border-control on ${surface} (${theme})`);
    }
  });

  it('leaves the decorative scale below it — the two jobs stay separate', () => {
    // a card outline is decoration and WCAG 1.4.11 exempts it; the outline of an <input> is the
    // only thing that says «this is a field». Separating them is why --border-control exists.
    const card = tokenRgba('--bg-card', theme);
    const decorative = contrast(tokenRgba('--border-2', theme), card);
    expect(decorative).toBeLessThan(3);
    expect(contrast(tokenRgba('--border-1', theme), card)).toBeLessThan(decorative + 0.001);
    expect(contrast(tokenRgba('--border-control', theme), card)).toBeGreaterThan(decorative);
  });

  it('--mark-accent clears 3:1 on every surface — it is the one mark that carries meaning', () => {
    for (const surface of SURFACES) {
      expectRatio(tokenRgba('--mark-accent', theme), tokenRgba(surface, theme), 3, `--mark-accent on ${surface} (${theme})`);
    }
  });

  it('every --btn-*-fg reads on its bg, its hover and its active', () => {
    // this is the check that catches the two triples v2 got wrong: dark --btn-primary-active
    // #2563EB against #020617 (3.903) and dark --btn-danger-hover #EF4444 against white (3.763)
    for (const kind of ['primary', 'secondary', 'ghost', 'danger'] as const) {
      const fg = tokenRgba(`--btn-${kind}-fg`, theme);
      for (const state of ['bg', 'hover', 'active'] as const) {
        // the ghost button has no fill of its own; its rest state is the card it sits on
        const bgName = kind === 'ghost' && state === 'bg' ? '--bg-card' : `--btn-${kind}-${state}`;
        expectRatio(fg, painted(bgName, theme), 4.5, `--btn-${kind}-fg on ${bgName} (${theme})`);
      }
    }
  });

  it('the approval ladder is READABLE on the chart track and MONOTONIC in lightness', () => {
    // a rising scale of authority encoded as a lightness ramp is only a scale if it actually
    // rises: v2's dark ladder put jmc #3B82F6 darker than operator #60A5FA, breaking the order
    // that carries the meaning — a defect no contrast check can see.
    const TIERS = ['--tier-operator', '--tier-jmc', '--tier-mdoc'] as const;
    for (const tier of TIERS) {
      expectRatio(tokenRgba(tier, theme), tokenRgba('--chart-track', theme), 3, `${tier} on --chart-track (${theme})`);
    }
    // …and the SAME token is printed as 11px text inside `.ad-tier`, whose surface §4-د fixes as
    // the secondary-button wash. A swatch answers to 3:1 and a word to 4.5:1; v2's --primary-500
    // cleared the first (3.357) and failed the second (3.383), which is why the light rung moved
    // one step down. This is the check that would have caught it.
    for (const tier of TIERS) {
      expectRatio(tokenRgba(tier, theme), painted('--btn-secondary-bg', theme), 4.5, `${tier} on the tier chip (${theme})`);
    }
    const [op, jmc, mdoc] = TIERS.map((t) => luminance(tokenRgba(t, theme)));
    if (theme === 'light') {
      expect(op, 'light ladder must darken with authority').toBeGreaterThan(jmc);
      expect(jmc).toBeGreaterThan(mdoc);
    } else {
      expect(op, 'dark ladder must lighten with authority').toBeLessThan(jmc);
      expect(jmc).toBeLessThan(mdoc);
    }
  });

  it('the sidebar ink reads at BOTH ends of the gradient, resting and hovered', () => {
    // a gradient has no single background: --side-fg-2 at α 0.66 cleared 4.5 at the foot and sat
    // at 4.019 at the head, over --side-hover, which is exactly where a hovered nav label lives
    const hover = tokenRgba('--side-hover', theme);
    for (const [i, stop] of sidebarStops(theme).entries()) {
      const hovered = over(hover, stop);
      for (const ink of ['--side-fg', '--side-fg-2'] as const) {
        expectRatio(tokenRgba(ink, theme), stop, 4.5, `${ink} on gradient stop ${i} (${theme})`);
        expectRatio(tokenRgba(ink, theme), hovered, 4.5, `${ink} over --side-hover at stop ${i} (${theme})`);
      }
      expectRatio(tokenRgba('--focus-color-on-dark', theme), stop, 3, `--focus-color-on-dark on stop ${i} (${theme})`);
    }
  });

  it('the count pill reads on an ACTIVE nav row, where two washes stack', () => {
    // `.op-nav__count` paints --side-count over its row; on `.op-nav__btn--on` that row is itself
    // --side-active over the gradient. Two translucent washes, one on top of the other, lift the
    // ground far enough that the sidebar's own tinted ink stops clearing AA at the head of the
    // gradient — which is the whole reason the pill carries an ink of its own.
    const active = tokenRgba('--side-active', theme);
    const count = tokenRgba('--side-count', theme);
    for (const [i, stop] of sidebarStops(theme).entries()) {
      for (const [row, ground] of [['resting', stop], ['active', over(active, stop)]] as const) {
        expectRatio(tokenRgba('--side-count-fg', theme), over(count, ground), 4.5,
          `--side-count-fg on the ${row}-row count pill at stop ${i} (${theme})`);
      }
    }
  });
});

describe('§4-ط — the nav count pill, and why it does not take the sidebar ink', () => {
  it('spends --side-count-fg on the pill and nowhere else — the rule IS the mechanism', () => {
    const pill = declarationsOf(sheetOf('apps/web/src/operator/operator.css').rule('.op-nav__count, .ad-nav__count'));
    expect(pill.background).toBe('var(--side-count)');
    expect(pill.color).toBe('var(--side-count-fg)');
  });

  it('shows --side-fg falling short on the composite, which is what the extra ink buys', () => {
    // the lightest stop is the worst ground for a light ink, and it is where --side-fg lands at
    // 4.276 under the stacked washes. Pinning the failure keeps the pill from quietly inheriting.
    const lightest = sidebarStops('light').reduce((a, b) => (luminance(a) > luminance(b) ? a : b));
    const pill = over(tokenRgba('--side-count', 'light'), over(tokenRgba('--side-active', 'light'), lightest));
    expect(contrast(tokenRgba('--side-fg', 'light'), pill)).toBeLessThan(4.5);
    expect(contrast(tokenRgba('--side-count-fg', 'light'), pill)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('§1 — --btn-secondary-bd separates the button from its surface (L5)', () => {
  it.each(THEMES)('[%s] separates the button from every surface it lands on, and from its own fill', (theme) => {
    // neither v2's --primary-200 border (1.421) nor its --primary-50 fill (1.05) separated the
    // secondary button from the card behind it, and a button is a UI component under 1.4.11.
    // The dark theme carried the SAME gap one theme over (rgba(96,165,250,0.32) = 1.798) as a
    // named debt while `.op-btn-secondary` was unbuilt; the class exists now, so the floor is
    // asserted in BOTH themes and the debt line is gone from the sheet and from here.
    for (const surface of ['--bg-page', '--bg-card', '--bg-muted'] as const) {
      expectRatio(tokenRgba('--btn-secondary-bd', theme), tokenRgba(surface, theme), 3, `--btn-secondary-bd on ${surface} (${theme})`);
    }
    // …and from the fill it encloses, or the edge reads as part of the wash rather than as the
    // button's boundary. --bg-inset is out of scope in BOTH themes by the same margin (2.983
    // light · 2.721 dark): the symmetry is the decision — one rule, not one theme's rule.
    expectRatio(tokenRgba('--btn-secondary-bd', theme), painted('--btn-secondary-bg', theme), 3, `--btn-secondary-bd on its own fill (${theme})`);
  });

  it('bars the two edges that failed — one per theme', () => {
    expect(contrast(tokenRgba('--primary-200', 'light'), tokenRgba('--bg-card', 'light'))).toBeLessThan(3);
    expect(contrast(toRgba('rgba(96,165,250,0.32)', 'dark'), tokenRgba('--bg-card', 'dark'))).toBeLessThan(3);
    expect(TOKENS_CODE, 'the 0.32 dark edge is back').not.toContain('rgba(96,165,250,0.32)');
  });
});

describe('§1 — elevation and focus are named, and the navy sidebar gets its own ring', () => {
  it('has exactly three elevation names plus the single permitted lift', () => {
    expect(DECLS['--elev-rest']).toBe('var(--shadow-1)');
    expect(DECLS['--elev-hover']).toBe('var(--shadow-2)');
    expect(DECLS['--elev-overlay']).toBe('var(--shadow-pop)');
    expect(DECLS['--lift']).toBe('-1px');
    expect(DECLS['--elev-4']).toBeUndefined(); // there is no fourth level, by design
  });

  it('gives every shadow an inner highlight in BOTH themes — the v2 surface, not just its colour', () => {
    for (const name of ['--shadow-1', '--shadow-2', '--shadow-3', '--shadow-pop'] as const) {
      expect(DECLS[name], `${name} light`).toMatch(/^inset 0 1px 0 rgba\(255,\s*255,\s*255/);
      expect(DARK_DECLS[name], `${name} dark`).toMatch(/^inset 0 1px 0 rgba\(255,\s*255,\s*255/);
    }
  });

  it('routes :focus-visible through the tokens instead of a literal', () => {
    expect(DECLS['--focus-ring']).toBe('var(--focus-width) solid var(--focus-color)');
    expect(TOKEN_SHEET.rule(':focus-visible').getPropertyValue('outline')).toBe('var(--focus-ring)');
    expect(TOKEN_SHEET.rule(':focus-visible').getPropertyValue('outline-offset')).toBe('var(--focus-offset)');
  });

  it('keeps ONE name for the ring colour — no alias with zero consumers', () => {
    // --border-focus was `var(--focus-color)` with not one reference repo-wide. "One source of
    // truth" that nothing reads is dead code, and a dead alias is the thing a later edit changes
    // instead of the live token.
    expect(DECLS['--border-focus']).toBeUndefined();
    for (const path of SHEETS) expect(read(path), path).not.toContain('var(--border-focus)');
  });

  it('switches the ring COLOUR on BOTH navy sidebars, where the primary ring disappears', () => {
    // BUILD-2 §4-ط unified the two shells on one gradient, so .op-side joined the selector —
    // the BUILD-1 debt line that said it would is paid here.
    const deepest = sidebarStops('light').reduce((a, b) => (luminance(a) < luminance(b) ? a : b));
    expect(contrast(tokenRgba('--focus-color', 'light'), deepest)).toBeLessThan(3);
    const ring = TOKEN_SHEET.rule('.op-side :focus-visible, .ad-side :focus-visible');
    expect(ring.getPropertyValue('outline-color')).toBe('var(--focus-color-on-dark)');
    // and the ring is the ONLY mechanism: a --focus-color override on the sidebars themselves
    // would be a second way to reach the same outcome
    for (const path of SHEETS) {
      expect(read(path), path).not.toMatch(/\.(?:op|ad)-side[^{]*\{[^}]*--focus-color:/);
    }
  });
});

/* ================================================================== */
/*  §1-bridge — the legacy names, and what may no longer be said       */
/* ================================================================== */

describe('§1-bridge — the migration is COMPLETE: the block is gone and nothing still speaks it', () => {
  /** Every name the bridge ever carried, plus the ones that were deleted rather than bridged. */
  const RETIRED = [
    '--ink-1', '--ink-2', '--ink-3', '--ink-4', '--ink-disabled', '--ink-on-dark', '--ink-on-dark-2',
    '--fg-1', '--fg-2', '--fg-3', '--fg-4',
    '--paper-50', '--paper-100', '--paper-200', '--paper-300', '--paper-400', '--paper-500',
    '--paper-600', '--paper-700', '--paper-800', '--paper-900',
    '--brand-navy-50', '--brand-navy-100', '--brand-navy-500', '--brand-navy-600',
    '--brand-navy-700', '--brand-navy-800', '--brand-navy-900',
    '--r-xl', '--bg-dark', '--font-display', '--shadow-inset', '--ease-in-out', '--border-3',
  ] as const;

  it('deleted the alias block itself — §7-ب-11, the last step and the proof of completion', () => {
    // the block is what let BUILD-2 sweep the sheets one at a time; keeping it after the sweep
    // would leave a second, older name for every live token, which is the defect it was
    // introduced to make temporary
    const decls = TOKENS_CODE.slice(0, TOKENS_CODE.indexOf('@media screen'));
    for (const name of RETIRED) {
      expect(decls, `${name} is still declared`).not.toMatch(new RegExp(`${name}\\s*:`));
      expect(DECLS[name], `${name} should be gone`).toBeUndefined();
    }
  });

  it.each(RETIRED)('%s is not referenced by any sheet — an undefined var() is an invisible bug', (name) => {
    const uses = CONSUMER_SHEETS.filter((p) => read(p).includes(`var(${name})`));
    expect(uses, `${name} is still spent; it no longer resolves to anything`).toEqual([]);
  });

  it('retires the amber identity ramp across ALL nine sheets, not just the token file', () => {
    // §6-1: amber leaves the identity entirely and survives only as the `pending` status hue.
    // The BUILD-1 debt line promised this ban would widen once the sixty sites moved. It has.
    // Asserted on the CODE, not the prose: the corrections are explained by quoting the value
    // they replaced, so a ban read off the raw file would fail on its own rationale.
    for (const path of SHEETS) expect(code(path), path).not.toMatch(/--brand-amber/);
  });

  it('offers ONE way to put a subtree back on paper, and it re-uses the light block', () => {
    // `.theme-light` is not a second theme: it is the same declaration list under a second
    // selector, so the A4 sheet cannot drift from `:root`. A separate block restating the
    // values would be exactly the second source of truth the bridge was deleted to avoid.
    expect(TOKENS_CODE).toMatch(/:root,\s*\.theme-light\s*\{/);
    expect(TOKENS_CODE.match(/\.theme-light/g)?.length, '.theme-light appears more than once').toBe(1);
    expect(read('apps/web/src/report/report.css')).toContain('theme-light');
  });
});

/* ================================================================== */
/*  §4 — the surfaces BUILD-2 actually swept                           */
/* ================================================================== */

describe('§4-ب — one button shape, four kinds, and the six copies are gone', () => {
  const OP = 'apps/web/src/operator/operator.css';
  const KINDS = ['primary', 'secondary', 'ghost', 'danger'] as const;

  it('declares the shared shape ONCE, for all four kinds together', () => {
    const shape = sheetOf(OP).all.find((r) => r.selector.includes('.op-btn-danger') && r.selector.includes('.op-btn-ghost'));
    expect(shape, 'the four kinds do not share a shape rule').toBeTruthy();
    const d = declarationsOf(shape!.style);
    expect(d['block-size']).toBe('34px');
    expect(d['padding-inline']).toBe('14px');
    expect(d['border-radius']).toBe('var(--r-sm)');
    expect(d['font-weight']).toBe('var(--fw-semibold)');
    // and each kind adds ONLY its colours on top of it
    for (const kind of KINDS) expect(sheetOf(OP).rule(`.op-btn-${kind}`)).toBeTruthy();
  });

  it('deleted every duplicate of the primary button rather than leaving it shadowed', () => {
    // six copies of one button, plus the parallel `.btn` family that predated the redesign
    const GONE = [
      '.op-cta', '.op-btn-nav', '.wz-next', '.file-here__cta', '.file-tl__wiz',
      '.ad-decision__go', '.wz-draft', '.btn--primary', '.btn--danger',
    ];
    for (const path of SHEETS) {
      for (const sel of GONE) expect(code(path), `${sel} still lives in ${path}`).not.toContain(`${sel} `);
      // amber said «the decisive act»; amber now says «waiting for approval» — the class had to go
      expect(code(path), path).not.toContain('wz-next--amber');
    }
  });

  it('spends the busy state and the disabled state once, across the family', () => {
    const css = code(OP);
    expect(css).toMatch(/\[aria-busy='true'\]::before[\s\S]{0,400}animation:\s*spin/);
    // one appearance, reached two ways: `:disabled` for a button nothing can say anything about,
    // and `[aria-disabled='true']` for a gate that must EXPLAIN itself when pressed (D1-4)
    expect(css).toMatch(/\.op-btn-danger:disabled, \.op-btn-danger\[aria-disabled='true'\]\s*\{[^}]*opacity:\s*0\.45/);
    for (const kind of ['primary', 'secondary', 'ghost', 'danger']) {
      expect(css, `op-btn-${kind} answers only one of the two`).toContain(`.op-btn-${kind}[aria-disabled='true']`);
    }
    // the keyframe is defined in tokens.css and nowhere else
    expect(css).not.toContain('@keyframes spin');
    expect(TOKENS_CODE).toContain('@keyframes spin');
  });
});

describe('§4 — the ink that reads on a saturated fill is a token, not a literal', () => {
  it.each(THEMES)('[%s] --status-on-fill clears AA on every fill it is spent on', (theme) => {
    // light fills are dark and take white; dark fills are light and take near-black. One role,
    // two values — and the ~10 `color: #fff` literals that used to guess at it are gone.
    for (const fill of ['--status-done', '--status-delayed', '--st-pending-fg'] as const) {
      expectRatio(tokenRgba('--status-on-fill', theme), tokenRgba(fill, theme), 4.5, `--status-on-fill on ${fill} (${theme})`);
    }
  });

  it('leaves no bare white in the component sheets to disagree with it', () => {
    // report.css keeps two: the A4 sheet is paper in both themes, and styles.css keeps one in
    // @media print for the same reason. Everything else routes through a token.
    for (const path of CONSUMER_SHEETS) {
      if (path.includes('report.css') || path.includes('styles.css')) continue;
      expect(code(path), `${path} writes a colour literal`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });
});

describe('§4-و · §4-ز — the table and the toast', () => {
  it('reveals the row actions with opacity, never display — or they leave the tab order', () => {
    const css = code('apps/web/src/operator/operator.css');
    expect(css).toMatch(/\.op-rowbtns\s*\{[^}]*opacity:\s*0;/);
    expect(css).not.toMatch(/\.op-rowbtns\s*\{[^}]*display:\s*none/);
    expect(css).toMatch(/\.op-tbl__row:focus-within \.op-rowbtns/);
    // a touch screen has no hover, so they never hide there
    expect(css).toMatch(/@media \(hover: none\)\s*\{\s*\.op-rowbtns\s*\{\s*opacity:\s*1/);
  });

  it('separates every table column and moves the header onto the muted well', () => {
    const th = declarationsOf(sheetOf('apps/web/src/operator/operator.css').rule('.op-tbl th'));
    expect(th.background).toBe('var(--bg-muted)');
    expect(th.color).toBe('var(--text-muted)');
    // letter-spaced capitals do nothing for Arabic and cost it legibility
    expect(th['letter-spacing']).toBeFalsy();
    expect(code('apps/web/src/operator/operator.css')).toContain('.op-tbl th + th, .op-tbl td + td');
  });

  it('rebuilds the toast as a card that knows both themes', () => {
    const toast = declarationsOf(sheetOf('apps/web/src/toast.css').rule('.tv2-toast'));
    expect(toast.background).toBe('var(--bg-card)');
    expect(toast.color).toBe('var(--text-1)');
    // the kind is carried by ONE variable, so the bar and the mark can never disagree
    expect(toast['border-inline-start']).toContain('var(--tv2-bar)');
    expect(declarationsOf(sheetOf('apps/web/src/toast.css').rule('.tv2-toast__mark')).color).toBe('var(--tv2-bar)');
    for (const kind of ['success', 'error', 'warning']) {
      expect(code('apps/web/src/toast.css')).toMatch(new RegExp(`\\.tv2-toast--${kind}\\s*\\{\\s*--tv2-bar:`));
    }
  });
});

describe('§4-ج · §4-ط — the badge grew a border, and the two shells became one', () => {
  it.each(STATUSES)('.m-pill--%s carries all three of fg, bg and bd', (name) => {
    const d = declarationsOf(sheetOf('packages/ui/src/ui.css').rule(`.m-pill--${name}`));
    expect(d.color).toBe(`var(--status-${name})`);
    expect(d.background).toBe(`var(--status-${name}-bg)`);
    expect(d['border-color']).toBe(`var(--status-${name}-bd)`);
  });

  it('paints both sidebars from the one gradient, and the topbars are 58px of glass', () => {
    const css = code('apps/web/src/operator/operator.css');
    const side = declarationsOf(sheetOf('apps/web/src/operator/operator.css').rule('.op-side, .ad-side'));
    expect(side.background).toBe('var(--side-bg)');
    expect(side.color).toBe('var(--side-fg)');
    // admin.css no longer keeps a second, contradictory copy of the panel
    expect(code('apps/web/src/admin/admin.css')).not.toMatch(/\.ad-side\s*\{/);
    for (const bar of ['.op-topbar', '.wz-top']) {
      expect(declarationsOf(sheetOf('apps/web/src/operator/operator.css').rule(bar))['block-size']).toBe('58px');
    }
    expect(css).toMatch(/color-mix\(in srgb, var\(--bg-card\) 80%, transparent\)/);
    expect(declarationsOf(sheetOf('apps/web/src/styles.css').rule('.bar-in'))['block-size']).toBe('58px');
  });

  it('retires the hand-mixed «operations room» skin now that a real dark theme exists', () => {
    expect(code('packages/ui/src/ui.css')).not.toContain('m-skin--control');
    // and the key that named it is gone too — a skin that resolves to nothing is worse than none
    expect(read('packages/ui/src/index.ts')).not.toContain('control:');
  });
});

/* ================================================================== */
/*  §2 — fonts: self-hosted, four weights, no CDN                      */
/* ================================================================== */

describe('§2 — the type families are self-hosted, and the CDN is barred', () => {
  const MAIN = read('apps/web/src/main.tsx');
  const INDEX = read('apps/web/index.html');
  const PKG = read('apps/web/package.json');

  it('imports four weights of each family and nothing else', () => {
    const imports = [...MAIN.matchAll(/@fontsource\/([\w-]+)\/([\w-]*?)(\d+)\.css/g)]
      .map((m) => ({ family: m[1], subset: m[2].replace(/-$/, ''), weight: m[3] }));
    expect(imports.map((i) => `${i.family}/${i.subset || '*'}/${i.weight}`)).toEqual([
      'ibm-plex-sans-arabic/*/400', 'ibm-plex-sans-arabic/*/500',
      'ibm-plex-sans-arabic/*/600', 'ibm-plex-sans-arabic/*/700',
      'jetbrains-mono/latin/400', 'jetbrains-mono/latin/500',
      'jetbrains-mono/latin/600', 'jetbrains-mono/latin/700',
    ]);
    // the weight ladder is --fw-regular…--fw-bold and nothing else; 300 had no consumer at all
    expect(new Set(imports.map((i) => i.weight))).toEqual(new Set(['400', '500', '600', '700']));
  });

  it('ships no monospace glyph the product cannot render — Latin only', () => {
    // the aggregate bundle carries cyrillic, greek, vietnamese and latin-ext for a face spent
    // exclusively on LTR digit and code islands: 20 dead @font-face rules and 32 dead font files
    expect(MAIN, 'the aggregate jetbrains bundle is back').not.toMatch(/@fontsource\/jetbrains-mono\/\d+\.css/);
  });

  it('drops the two families that no longer appear in any font stack', () => {
    // 'IBM Plex Sans' left --font-sans (the Arabic family covers Latin) and 'IBM Plex Mono' left
    // --font-mono; keeping a package whose name no consumer mentions is a download nobody reads
    for (const gone of ['@fontsource/ibm-plex-sans"', '@fontsource/ibm-plex-mono"']) {
      expect(PKG, `${gone} is still a dependency`).not.toContain(gone);
    }
    expect(PKG).toContain('@fontsource/jetbrains-mono');
    expect(DECLS['--font-sans']).not.toContain('IBM Plex Sans,');
    expect(DECLS['--font-mono']).toContain('JetBrains Mono');
    // the critical fallback is Arabic Windows, so 'Segoe UI' precedes system-ui
    expect(DECLS['--font-sans'].indexOf('Segoe UI')).toBeLessThan(DECLS['--font-sans'].indexOf('system-ui'));
  });

  it('loads no font over the network — the reference file\'s Google links are barred', () => {
    for (const [label, src] of [['main.tsx', MAIN], ['index.html', INDEX]] as const) {
      expect(src, `${label} reaches for a CDN`).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
    }
  });
});

/* ================================================================== */
/*  §3 — two themes, one token set, and paper that is always light     */
/* ================================================================== */

describe('§3 — the dark palette is a screen concern, by construction', () => {
  it('wraps the dark root in @media screen so print falls back to :root with no second palette', () => {
    expect(TOKENS_CODE).toMatch(/@media screen\s*\{[\s\S]*:root\[data-theme=['"]dark['"]\]/);
  });

  it('re-declares no colour for print — the mechanism above is the whole mechanism', () => {
    // an `@media print { … }` here rewriting the palette would be exactly the second source of
    // truth the @media screen wrapper exists to avoid
    expect(TOKENS_CODE).not.toMatch(/@media\s+print/);
  });

  it('forces the printed page white where the wrapper cannot reach — html, body and color-scheme', () => {
    const printBlock = /@media print \{([\s\S]*?)\n\}/.exec(read('apps/web/src/report/report.css'));
    expect(printBlock, 'report.css has no @media print block').not.toBeNull();
    expect(printBlock![1]).toMatch(/:root\s*\{\s*color-scheme:\s*light/);
    expect(printBlock![1]).toMatch(/html,\s*body\s*\{\s*background:\s*#fff/i);
  });

  it('applies the theme BEFORE first paint, and survives a browser that throws on localStorage', () => {
    const html = read('apps/web/index.html');
    const script = /<script>([\s\S]*?)<\/script>/.exec(html);
    expect(script, 'index.html has no pre-paint script').not.toBeNull();
    // before #root, or the first paint is light and then flips — a white flash at the reader
    expect(html.indexOf('<script>')).toBeLessThan(html.indexOf('<div id="root">'));
    expect(script![1]).toContain("localStorage.getItem('masaar.theme')");
    expect(script![1]).toContain('prefers-color-scheme: dark');
    // localStorage throws in a private window and where site data is blocked; the page must still paint
    expect(script![1]).toMatch(/catch\s*\(\w+\)\s*\{\s*document\.documentElement\.setAttribute\('data-theme',\s*'light'\)/);
  });

  it('keeps the display preference OUTSIDE the business store keys', () => {
    // a chrome preference must not travel with — or be wiped by — a data migration
    expect(THEME_KEY).toBe('masaar.theme');
    expect(THEME_KEY.startsWith('masaar-operator')).toBe(false);
    expect(THEME_KEY.startsWith('masaar-session')).toBe(false);
  });
});

/* ================================================================== */
/*  §2 — motion                                                        */
/* ================================================================== */

/**
 * D1-1/2 — reduced motion used to be answered SEVEN times: four identical universal blocks
 * (operator · admin · registry · charts) and three hand-kept selector lists (ui · toast ·
 * whatsnew) that were already going stale. One decision, one place, and the authority now comes
 * from measured specificity rather than from `!important`.
 */
describe('§2-0 — reduced motion is ONE decision, stated once, without !important', () => {
  /** Every sheet in the product, including the one the token audit list does not carry. */
  const ALL_SHEETS = [...SHEETS, 'apps/web/src/whatsnew.css'];

  it('answers the preference in tokens.css and NOWHERE else — the six copies are retired', () => {
    const carriers = ALL_SHEETS.filter((p) => read(p).includes('prefers-reduced-motion'));
    expect(carriers, 'a second sheet still answers the preference').toEqual([TOKENS_PATH]);
  });

  it('states it exactly once inside that sheet, with selectors and no !important', () => {
    const css = read(TOKENS_PATH);
    expect((css.match(/@media \(prefers-reduced-motion: reduce\)/g) ?? []).length).toBe(1);
    const block = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(css);
    expect(block, 'the block is not a parseable at-rule').not.toBeNull();
    const body = block![1];
    // authority by specificity — `!important` is a blunt instrument nothing downstream can undo
    expect(body, 'the unified block reintroduced !important').not.toContain('!important');
    // (0,3,1) — one step above the highest-specificity animated rule measured in the repo,
    // `.op-btn-danger[aria-busy='true']::before` at (0,2,1). A bare `*` would be (0,0,0) and lose
    // to every class rule, because tokens.css is the FIRST sheet main.tsx imports.
    expect(body).toMatch(/:root:root:root \*/);
    expect(body).toContain('animation-duration: 0.01ms');
    expect(body).toContain('transition-duration: 0.01ms');
    // 0 would suppress transitionend/animationend, and the drawer teardown listens for exactly that
    expect(body).not.toMatch(/duration:\s*0(ms)?\s*;/);
  });

  it('defines pulse-soft in tokens.css only, and BELOW the block that covers it', () => {
    const css = read(TOKENS_PATH);
    expect((css.match(/@keyframes pulse-soft/g) ?? []).length).toBe(1);
    // §٧-أ-1: the ordering is the point — a keyframe written above the block would be the one
    // animation in the system born outside any reduced-motion coverage.
    expect(css.indexOf('@media (prefers-reduced-motion: reduce)'))
      .toBeLessThan(css.indexOf('@keyframes pulse-soft'));
    // opacity + scale only: a horizontal offset would reverse itself in English (§٧-أ-7)
    const kf = /@keyframes pulse-soft \{([^}]*\}[^}]*)\}/.exec(css)![1];
    expect(kf).not.toMatch(/translateX|margin-left|left:/);
    for (const p of ALL_SHEETS.filter((x) => x !== TOKENS_PATH)) {
      expect(read(p), `${p} defines a second pulse-soft`).not.toContain('@keyframes pulse-soft');
    }
  });

  it('spends the pulse only where a REAL overdue notice can light it', () => {
    expect(read('apps/web/src/operator/operator.css'))
      .toMatch(/\.op-notif__dot--late \{ animation: pulse-soft/);
    const bell = read('apps/web/src/NoticeBell.tsx');
    // the modifier is gated on the delayed subset of computeNotices, not on «any notice»
    expect(bell).toMatch(/lateCount = notices\.filter\(\(n\) => n\.severity === 'delayed'\)\.length/);
    expect(bell).toMatch(/lateCount > 0 \? ' op-notif__dot--late' : ''/);
    // and the figure reaches a screen reader, which an aria-label of the bare title had replaced
    expect(bell).toMatch(/aria-label=\{bellLabel\(/);
  });

  it('the drawer exit is a real animation the teardown can hear', () => {
    const css = read('apps/web/src/operator/operator.css');
    // a DISTINCT keyframe name for the exit: reusing the entry name with `reverse` leaves
    // animation-name unchanged, so the finished animation is updated rather than restarted and
    // no second animationend ever fires — the teardown would then hang on its fallback timer
    expect(css).toMatch(/\.op-drawer--closing\s*\{[^}]*animation:\s*dr-fade-out/);
    expect(css).toMatch(/\.op-drawer--closing \.op-drawer__panel\s*\{[^}]*animation:\s*dr-out/);
    expect(css).toMatch(/@keyframes dr-out/);
    expect(css).not.toMatch(/animation:[^;]*reverse/);
    // logical direction: one variable flips the offset, never a second keyframe block
    expect(css).toMatch(/html\[dir='ltr'\]\s*\{\s*--dr-dir:\s*-1;/);
    expect(css).not.toMatch(/@keyframes dr-in-ltr/);
  });
});

/**
 * D1-3 — the compact pill. A size modifier that also recoloured would hand the six closed
 * statuses a seventh reading, which is why this test is about what the rule does NOT say.
 */
describe('§4-ج — .m-pill--sm is a SIZE modifier, and nothing else', () => {
  const UI = 'packages/ui/src/ui.css';

  it('states no colour of its own — not a hex, not a status token, not a border', () => {
    const rule = /\.m-pill--sm \{([^}]*)\}/.exec(read(UI));
    expect(rule, '.m-pill--sm is not defined').not.toBeNull();
    const body = rule![1];
    expect(body).not.toMatch(/(^|[\s;])(color|background|background-color|border|border-color)\s*:/);
    expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    expect(body).not.toMatch(/--(status|st|tier|mark|primary|secondary|surface)-/);
  });

  it('turns only the three knobs the base rule declares', () => {
    const body = /\.m-pill--sm \{([^}]*)\}/.exec(read(UI))![1];
    const props = (body.match(/--[\w-]+(?=\s*:)/g) ?? []).sort();
    expect(props).toEqual(['--pill-fs', '--pill-pb', '--pill-pi']);
  });

  it('sizes the dot and the gap in em, so ONE modifier scales the whole pill', () => {
    const css = read(UI);
    expect(css).toMatch(/\.m-pill::before \{[^}]*inline-size: 0\.5em/);
    expect(css).toMatch(/\.m-pill \{[^}]*gap: 0\.58em/);
    // the px pair that used to be written twice is gone
    expect(css).not.toMatch(/\.m-pill::before \{[^}]*inline-size: 6px/);
  });

  it('is dispensed where the plan says — the dense registry columns', () => {
    for (const p of [
      'apps/web/src/operator/TendersList.tsx',
      'apps/web/src/admin/AdminTenders.tsx',
      'apps/web/src/admin/Schedule.tsx',
      'apps/web/src/operator/FileBidders.tsx',
    ]) {
      expect(read(p), `${p} keeps the full-size pill in a table column`).toMatch(/<StatusPill size="sm"/);
    }
  });
});

/**
 * D1-4 — a refused form used to say what was missing at the FOOTER and leave the field that
 * caused it looking exactly like the fields that did not. The refusal is now an event: the field
 * is marked, it says why beside itself, and the caret is moved to it.
 */
describe('§4-هـ — a refused wizard marks the field and moves the focus to it', () => {
  const KEY = 'masaar-operator-v13';

  beforeEach(() => {
    localStorage.clear();
    saveSession({
      name: 'كرار محسن', role: 'OPERATOR_USER', oid: 'oid-opuser-01',
      company: 'مشروع بدرة', companyId: 'op-badra',
    });
  });
  afterEach(() => {
    document.body.innerHTML = '';
    window.location.hash = '';
    localStorage.clear();
  });

  /** t2 sitting on its `approval` stage — the closing wizard's first step asks for two dates. */
  function seedClosable() {
    const s = seedState();
    s.tenders.find((x) => x.id === 't2')!.stages.find((x) => x.key === 'approval')!.uploadedDocs = ['stage-report'];
    localStorage.setItem(KEY, JSON.stringify(s));
  }

  it('refuses, names the field, describes the reason and takes the caret there', () => {
    seedClosable();
    const { container } = at('#/operator/t/t2/w/complete');

    const to = container.querySelector('#wizco-to') as HTMLInputElement;
    expect(to, 'the end-date field carries no id to point at').not.toBeNull();
    // before the attempt nothing is red: an error shown before the user acted is noise
    expect(to.getAttribute('aria-invalid')).toBeNull();
    expect(to.className).not.toContain('op-in--bad');

    fireEvent.click(screen.getByRole('button', { name: 'التالي' }));

    expect(to.getAttribute('aria-invalid')).toBe('true');
    expect(to.className).toContain('op-in--bad');
    expect(document.activeElement, 'the caret was left where it was').toBe(to);
    // the reason is TIED to the field, not only printed in the footer gate
    const errId = to.getAttribute('aria-describedby');
    expect(errId).toBe('wizco-to-err');
    const err = container.querySelector(`#${errId}`)!;
    expect(err.className).toContain('op-in__err');
    expect(err.textContent?.trim().length).toBeGreaterThan(0);
  });

  it('clears the mark when the edit that answers it lands', () => {
    seedClosable();
    const { container } = at('#/operator/t/t2/w/complete');
    fireEvent.click(screen.getByRole('button', { name: 'التالي' }));

    const to = container.querySelector('#wizco-to') as HTMLInputElement;
    expect(to.getAttribute('aria-invalid')).toBe('true');
    fireEvent.change(to, { target: { value: '2026-06-24' } });
    expect(container.querySelector('#wizco-to')!.getAttribute('aria-invalid')).toBeNull();
    expect(container.querySelector('#wizco-to-err')).toBeNull();
  });

  it('keeps the gate CLOSED — aria-disabled says so, and the step does not advance', () => {
    seedClosable();
    const { container } = at('#/operator/t/t2/w/complete');
    const nextBtn = screen.getByRole('button', { name: 'التالي' });
    // `disabled` would swallow the click, so the one moment the form has something to say never
    // happens and the control leaves the tab order; `aria-disabled` keeps both.
    expect(nextBtn.getAttribute('aria-disabled')).toBe('true');
    expect((nextBtn as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(nextBtn);
    // still on step 1 of 4: the refusal explained itself, it did not let anything through
    expect(container.querySelector('#wizco-to')).not.toBeNull();
  });

  it('gives every wizard the same wiring — no screen invents its own error shape', () => {
    for (const p of [
      'apps/web/src/operator/wizard/CompleteWizard.tsx',
      'apps/web/src/operator/wizard/RequestWizard.tsx',
      'apps/web/src/operator/wizard/AdvertiseWizard.tsx',
    ]) {
      const src = read(p);
      expect(src, `${p} does not hand its refusals back`).toContain('onReject={setBad}');
      expect(src, `${p} names no field on any condition`).toMatch(/field: '/);
      expect(src).toMatch(/FieldError rejected=\{bad\}/);
    }
    // and the red edge is a border swap on a fixed box, so a rejection moves nothing beside it
    expect(read('apps/web/src/operator/operator.css'))
      .toMatch(/\.op-in--bad \{ border-width: 1\.5px; border-color: var\(--st-cancelled-base\); \}/);
  });
});

describe('§2-1 — useCountUp', () => {
  function Probe({ value, format }: { value: number; format?: (n: number) => string }) {
    const ref = useCountUp(value, format ? { format } : undefined);
    return <span data-testid="v" ref={ref} />;
  }

  afterEach(() => {
    // auto-cleanup is off (vitest runs without `globals`), so each probe is torn down by hand
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('prints the final figure at once where there is no IntersectionObserver', () => {
    const { getByTestId } = render(<Probe value={42} />);
    expect(getByTestId('v').textContent).toBe('42');
  });

  it('applies the caller\'s formatter, not String()', () => {
    const pct = (n: number) => `${n}%`;
    const { getByTestId } = render(<Probe value={87} format={pct} />);
    expect(getByTestId('v').textContent).toBe('87%');
  });

  it('jumps to the final figure under prefers-reduced-motion, creating no observer at all', () => {
    // with an observer available, only the reduced-motion branch can explain an instant value
    const observe = vi.fn();
    class IO {
      observe = observe;
      disconnect = vi.fn();
    }
    vi.stubGlobal('IntersectionObserver', IO);
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduced-motion'), media: q }));

    const { getByTestId } = render(<Probe value={7} />);
    expect(getByTestId('v').textContent).toBe('7');
    expect(observe).not.toHaveBeenCalled();
  });

  it('observes rather than printing when motion is allowed', () => {
    const observe = vi.fn();
    class IO {
      observe = observe;
      disconnect = vi.fn();
    }
    vi.stubGlobal('IntersectionObserver', IO);
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q }));

    const { getByTestId } = render(<Probe value={7} />);
    expect(observe).toHaveBeenCalledTimes(1);
    expect(getByTestId('v').textContent).toBe(''); // the hook writes nothing before the reveal
  });
});

describe('§2-5 — the toast exit is faster than its entry', () => {
  it('animates out at --dur-fast, and the timer that unmounts it agrees', () => {
    expect(read('apps/web/src/toast.css')).toMatch(/\.tv2-toast--out\s*\{\s*animation:\s*tv2-out var\(--dur-fast\)/);
    // v2 moves the fast step 120 → 150ms; EXIT_MS must track it or the node outlives its animation
    expect(DECLS['--dur-fast']).toBe('150ms');
    expect(read('apps/web/src/Toasts.tsx')).toMatch(/const EXIT_MS = 150;/);
  });

  it('knows one easing curve and three durations, ordered', () => {
    expect(DECLS['--dur-slow']).toBe('250ms');   // was 320ms
    expect(DECLS['--ease-in-out']).toBeUndefined();
    const ms = (n: string) => parseInt(DECLS[n], 10);
    expect(ms('--dur-fast')).toBeLessThan(ms('--dur-base'));
    expect(ms('--dur-base')).toBeLessThan(ms('--dur-slow'));
  });
});

/* ================================================================== */
/*  §4 — the sidebar disclosure                                        */
/* ================================================================== */

const MDOC = { name: 'د. سارة الجبوري', role: 'MDOC_ADMIN' as const, oid: 'oid-roc-01' };
const OPERATOR = {
  name: 'م. أحمد عبد الرحمن', role: 'OPERATOR_ADMIN' as const, oid: 'oid-opadmin-01',
  company: 'شركة نفط الواحة الصينية', companyId: 'op-alwaha',
};

const disc = () => document.querySelector('.ad-nav__disc') as HTMLButtonElement;
const sec = () => document.querySelector('.ad-nav__sec') as HTMLElement;
const navHrefs = (root: Element | null) =>
  Array.from(root?.querySelectorAll('a.ad-nav__btn') ?? []).map((a) => a.getAttribute('href'));

/** The primary items are the .ad-nav children that are NOT inside the secondary container. */
const primaryHrefs = () =>
  Array.from(document.querySelectorAll('.ad-nav > a.ad-nav__btn')).map((a) => a.getAttribute('href'));

function at(hash: string) {
  window.location.hash = hash;
  return render(<App />);
}

describe('§4 — «أدوات ومراجع» is a real disclosure over a real preference', () => {
  beforeEach(() => {
    localStorage.clear();
    saveSession(MDOC);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    window.location.hash = '';
    localStorage.clear();
  });

  it('promotes the approval chain into the daily five and demotes reports and accounts', () => {
    at('#/admin');
    const primary = primaryHrefs();
    expect(primary).toEqual(['#/admin', '#/admin/tenders', '#/admin/approvals', '#/admin/contracts', '#/admin/entities']);
    // the two that moved the other way — periodic work, not the work of the day
    expect(navHrefs(sec())).toEqual(expect.arrayContaining(['#/admin/reports', '#/admin/users']));
  });

  it('starts collapsed, and collapsing hides the items for real', () => {
    at('#/admin');
    expect(disc().getAttribute('aria-expanded')).toBe('false');
    expect(sec().hasAttribute('hidden')).toBe(true);
    // the attribute is what a screen reader reads — and the CSS must not lose to display:flex
    expect(sheetOf('apps/web/src/admin/admin.css').rule('.ad-nav__sec[hidden]').getPropertyValue('display'))
      .toBe('none');
    expect(disc().getAttribute('aria-controls')).toBe(sec().id);
  });

  it('never swallows an alarm: the collapsed header carries the sum of what it folded away', () => {
    at('#/admin');
    const badge = disc().querySelector('.ad-nav__count');
    expect(badge).not.toBeNull();
    const hidden = Array.from(sec().querySelectorAll('.ad-nav__count')).reduce(
      (n, el) => n + Number(el.textContent),
      0,
    );
    expect(Number(badge!.textContent)).toBe(hidden);
    expect(Number(badge!.textContent)).toBeGreaterThan(0);
  });

  it('opening writes the preference, and the badge is retired once nothing is hidden', () => {
    at('#/admin');
    expect(disc().hasAttribute('aria-disabled')).toBe(false); // operable here, and it says so
    act(() => { fireEvent.click(disc()); });
    expect(disc().getAttribute('aria-expanded')).toBe('true');
    expect(sec().hasAttribute('hidden')).toBe(false);
    expect(localStorage.getItem(NAV_SEC_KEY)).toBe('1');
    expect(disc().querySelector('.ad-nav__count')).toBeNull();
  });

  it('closes again, and the preference follows it down', () => {
    localStorage.setItem(NAV_SEC_KEY, '1');
    at('#/admin');
    act(() => { fireEvent.click(disc()); });
    expect(disc().getAttribute('aria-expanded')).toBe('false');
    expect(sec().hasAttribute('hidden')).toBe(true);
    expect(localStorage.getItem(NAV_SEC_KEY)).toBe('0');
  });

  it('reads the stored preference back on the next mount', () => {
    localStorage.setItem(NAV_SEC_KEY, '1');
    at('#/admin');
    expect(disc().getAttribute('aria-expanded')).toBe('true');
    expect(sec().hasAttribute('hidden')).toBe(false);
  });

  it('keeps the preference OUTSIDE the business store key', () => {
    // a chrome preference must not travel with — or be wiped by — a data migration
    expect(NAV_SEC_KEY).toBe('masaar.nav.sec');
    expect(NAV_SEC_KEY.startsWith('masaar-operator')).toBe(false);
  });

  it('forces the group open for a deep link inside it — without corrupting the preference', () => {
    localStorage.setItem(NAV_SEC_KEY, '0');
    at('#/admin/audit');
    expect(sec().hasAttribute('hidden')).toBe(false);
    const active = sec().querySelector('a[aria-current="page"]');
    expect(active?.getAttribute('href')).toBe('#/admin/audit');
    // the forced open is a display decision only; what the reader chose is still what is stored
    expect(localStorage.getItem(NAV_SEC_KEY)).toBe('0');
  });

  it.each(['0', '1'])(
    'announces the forced-open disclosure as unavailable and never rewrites the preference (stored %s)',
    (stored) => {
      /**
       * The group cannot close while the current page is inside it, so on `#/admin/audit` the
       * button is not operable — and it has to SAY that. It used to compute `!secOpen`, i.e.
       * always `false` here: every click wrote `masaar.nav.sec = '0'` while `aria-expanded`
       * stayed `true` and `hidden` never moved. A screen-reader user activated a control that
       * announced "expanded", got no change, and had their stored OPEN preference destroyed —
       * destroyable there, never restorable there.
       */
      localStorage.setItem(NAV_SEC_KEY, stored);
      at('#/admin/audit');
      expect(disc().getAttribute('aria-disabled')).toBe('true');
      expect(disc().getAttribute('aria-expanded')).toBe('true');
      act(() => { fireEvent.click(disc()); });
      expect(disc().getAttribute('aria-expanded')).toBe('true');
      expect(sec().hasAttribute('hidden')).toBe(false);
      expect(localStorage.getItem(NAV_SEC_KEY)).toBe(stored);
    },
  );

  it('marks the current page in both shells', () => {
    at('#/admin/tenders');
    expect(document.querySelector('a.ad-nav__btn[aria-current="page"]')?.getAttribute('href'))
      .toBe('#/admin/tenders');
    document.body.innerHTML = '';

    localStorage.clear();
    saveSession(OPERATOR);
    at('#/operator/tenders');
    expect(document.querySelector('a.op-nav__btn[aria-current="page"]')?.getAttribute('href'))
      .toBe('#/operator/tenders');
  });

  /**
   * ق8 — the breadcrumb's ancestor link is DERIVED, in both shells.
   *
   * The admin shell reads its ancestor off `PRIMARY.find(...)`; the operator shell hand-wrote
   * `#/operator/tenders` beside it, so one shell obeyed the routing contract and the other kept a
   * copy of it. The invariant is deliberately NOT «the href is that string» — pinning the literal
   * is what created the problem. It is that the crumb links to the SAME address as the sidebar
   * entry it names, which is a property only a derivation can hold once either address moves.
   */
  it.each([
    ['admin', '#/admin/review/t1', 'a.ad-nav__btn'],
    ['operator', '#/operator/t/t1', 'a.op-nav__btn'],
  ])('links the %s file crumb at the nav entry it names, not at a copy of its address', (shell, hash, navSel) => {
    localStorage.clear();
    saveSession(shell === 'admin' ? MDOC : OPERATOR);
    at(hash);
    const link = document.querySelector('.op-crumb .op-crumb__a') as HTMLAnchorElement;
    expect(link, `${shell}: the file crumb has no ancestor link`).toBeTruthy();
    const named = link.textContent?.trim() ?? '';
    expect(named.length, `${shell}: the ancestor segment is unlabelled`).toBeGreaterThan(0);
    const entry = [...document.querySelectorAll(navSel)].find((a) => a.textContent?.includes(named));
    expect(entry, `${shell}: the crumb names «${named}», which is not a sidebar destination`).toBeTruthy();
    expect(link.getAttribute('href'), `${shell}: the crumb and the sidebar disagree about «${named}»`)
      .toBe(entry?.getAttribute('href'));
  });

  it('leaves the operator shell FLAT — two secondary items are still below the disclosure threshold', () => {
    localStorage.clear();
    saveSession(OPERATOR);
    at('#/operator');
    expect(document.querySelector('.op-nav__disc')).toBeNull();
    // a static heading instead, with both secondary destinations under it and nothing hidden.
    // د9 added «سلّم الموافقات»: the threshold in §4-ب is THREE, so two still print flat.
    expect(document.querySelector('.op-nav__group')).not.toBeNull();
    expect(
      Array.from(document.querySelectorAll('a.op-nav__btn')).map((a) => a.getAttribute('href')),
    ).toEqual(['#/operator', '#/operator/tenders', '#/operator/new', '#/operator/approvals', '#/operator/reports']);
  });
});

/* ================================================================== */
/*  د3 — the rail folds 260 → 72 and keeps its meaning                 */
/* ================================================================== */

/**
 * The collapse is the one change in this wave that can REMOVE information, so the guards are
 * written against exactly that: an icon-only rail is a compact rail if every row is still named
 * and every live counter is still announced, and an accessibility regression the moment it is not
 * (§7-أ-5). The three invariants below are the plan's own, in its own order.
 */
describe('د3 — the collapsed rail keeps every name, every count and «أين أنا»', () => {
  const shell = () => document.querySelector('.op-shell') as HTMLElement;
  const minBtn = () => document.querySelector('.op-side__min') as HTMLButtonElement;
  const rows = (sel: string) => Array.from(document.querySelectorAll(sel));
  /** what assistive tech would call the row: its `aria-label` if it has one, else its own text */
  const accName = (el: Element) => (el.getAttribute('aria-label') ?? el.textContent ?? '').trim();

  beforeEach(() => { localStorage.clear(); });
  afterEach(() => {
    document.body.innerHTML = '';
    window.location.hash = '';
    localStorage.clear();
  });

  it.each([
    ['admin', MDOC, '#/admin', 'a.ad-nav__btn', '.ad-nav__count'],
    ['operator', OPERATOR, '#/operator', 'a.op-nav__btn', '.op-nav__count'],
  ])('%s: collapsing drops no accessible name and no count', (name, who, hash, sel, countSel) => {
    saveSession(who);
    at(hash);
    expect(shell().classList.contains('op-shell--min')).toBe(false);

    // what the OPEN rail says, keyed by the row's tooltip (which is the plain label in both states)
    const before = new Map(
      rows(sel).map((a) => [a.getAttribute('title') ?? '', a.querySelector(countSel)?.textContent ?? '']),
    );
    expect(before.size).toBeGreaterThan(0);
    expect([...before.keys()].every((k) => k.length > 0)).toBe(true);
    // at least one row is actually carrying a live counter, or this test proves nothing about counts
    expect([...before.values()].some((v) => Number(v) > 0)).toBe(true);

    act(() => { fireEvent.click(minBtn()); });
    expect(shell().classList.contains('op-shell--min')).toBe(true);

    const after = rows(sel);
    expect(after.length, `${name}: the rail lost a destination on the way down`).toBe(before.size);
    for (const a of after) {
      const label = a.getAttribute('title') ?? '';
      expect(label.length, `${name}: an icon row lost its tooltip`).toBeGreaterThan(0);
      const said = accName(a);
      expect(said, `${name}: «${label}» is an unnamed icon on the shelf`).toContain(label);

      const was = before.get(label) ?? '';
      if (Number(was) > 0) {
        // the pill became a dot — and the number it used to print moved into the row's own name
        expect(said, `${name}: «${label}» folded its count away instead of announcing it`).toContain(was);
        const dot = a.querySelector(`${countSel}--dot`);
        expect(dot, `${name}: «${label}» lost the visible mark that it has something owed`).not.toBeNull();
        expect(dot!.getAttribute('aria-hidden')).toBe('true'); // the name says it; the dot must not repeat it
        expect(dot!.textContent).toBe(''); // digits do not fit, and a clipped digit is worse than none
      }
    }
  });

  it('folds the disclosure without swallowing what it hides', () => {
    // `hiddenCount` is the sum of the alarms the closed group is sitting on. On the shelf the
    // header has no room to print it, so it becomes a dot and the number moves into the button's
    // name — the same trade every row makes, and for the same reason (§2-ب/6: a live counter must
    // never degrade into decoration).
    saveSession(MDOC);
    at('#/admin');
    expect(disc().getAttribute('aria-expanded')).toBe('false');
    const printed = disc().querySelector('.ad-nav__count')?.textContent ?? '';
    expect(Number(printed)).toBeGreaterThan(0);

    act(() => { fireEvent.click(minBtn()); });
    expect(disc().querySelector('.ad-nav__count--dot')).not.toBeNull();
    expect(accName(disc())).toContain(printed);
    expect(accName(disc())).toContain(disc().getAttribute('title') ?? '');
  });

  it('keeps «أين أنا» on the shelf: activeInSecondary still forces its group open', () => {
    localStorage.setItem(NAV_MIN_KEY, '1');
    localStorage.setItem(NAV_SEC_KEY, '0'); // the reader's own choice is «closed»
    saveSession(MDOC);
    at('#/admin/audit');

    expect(shell().classList.contains('op-shell--min')).toBe(true);
    expect(sec().hasAttribute('hidden'), 'the collapsed rail hid the page the reader is on').toBe(false);
    expect(sec().querySelector('a[aria-current="page"]')?.getAttribute('href')).toBe('#/admin/audit');
    expect(disc().getAttribute('aria-expanded')).toBe('true');
    // …and the forced open is still only a display decision, exactly as it is on the open rail
    expect(localStorage.getItem(NAV_SEC_KEY)).toBe('0');
  });

  it('keeps the preference OUTSIDE the business store key, and remembers it across a remount', () => {
    expect(NAV_MIN_KEY).toBe('masaar.nav.min');
    expect(NAV_MIN_KEY.startsWith('masaar-operator')).toBe(false);
    expect(NAV_MIN_KEY).not.toBe(NAV_SEC_KEY);

    saveSession(MDOC);
    at('#/admin');
    const store = localStorage.getItem('masaar-operator-v13');
    act(() => { fireEvent.click(minBtn()); });

    expect(localStorage.getItem(NAV_MIN_KEY)).toBe('1');
    // a chrome preference must not travel with — or be wiped by — a data migration
    expect(localStorage.getItem('masaar-operator-v13')).toBe(store);
    expect(store ?? '').not.toContain('nav.min');

    // read back before the first paint of the next mount: the rail comes up folded, not flashing
    document.body.innerHTML = '';
    at('#/admin');
    expect(shell().classList.contains('op-shell--min')).toBe(true);
    expect(minBtn().getAttribute('aria-expanded')).toBe('false');
  });

  it('spends the named --side-w-min debt: the shelf width is the token, not a literal', () => {
    const sheet = sheetOf('apps/web/src/operator/operator.css');
    expect(sheet.rule('.op-shell--min .op-side, .op-shell--min .ad-side').getPropertyValue('inline-size'))
      .toBe('var(--side-w-min)');
    expect(sheet.rule('.op-side, .ad-side').getPropertyValue('inline-size')).toBe('var(--side-w)');
    expect(DECLS['--side-w-min']).toBe('72px');
    expect(DECLS['--side-w']).toBe('260px');
  });
});

/* ================================================================== */
/*  §3-د — the theme switch, rendered, in both shells                  */
/* ================================================================== */

describe('§3-د — one theme switch, mounted in both shells', () => {
  const toggle = () => document.querySelector('.op-top-actions .op-iconbtn[aria-pressed]') as HTMLButtonElement;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.setAttribute('data-theme', 'light');
  });

  afterEach(() => {
    document.body.innerHTML = '';
    window.location.hash = '';
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it.each([
    ['admin', '#/admin'],
    ['operator', '#/operator'],
  ])('the %s topbar carries it, before the language button', (shell, hash) => {
    saveSession(shell === 'admin' ? MDOC : OPERATOR);
    at(hash);
    const btn = toggle();
    expect(btn, `${shell} topbar has no theme switch`).not.toBeNull();
    const actions = Array.from(btn.parentElement!.children);
    expect(actions.indexOf(btn)).toBeLessThan(actions.findIndex((el) => el.classList.contains('op-langbtn')));
  });

  it('keeps ONE name and moves the state to aria-pressed, not to the label', () => {
    // a label that changes with the state («switch to dark» → «switch to light») renames the
    // control under a voice-command user's feet; the name stays put and aria-pressed carries the fact
    saveSession(MDOC);
    at('#/admin');
    const name = toggle().getAttribute('aria-label');
    expect(name).toBeTruthy();
    expect(toggle().getAttribute('aria-pressed')).toBe('false');
    const hint = toggle().getAttribute('title');

    act(() => { fireEvent.click(toggle()); });
    expect(toggle().getAttribute('aria-label')).toBe(name);
    expect(toggle().getAttribute('aria-pressed')).toBe('true');
    expect(toggle().getAttribute('title')).not.toBe(hint);   // the HINT is what changes
  });

  it('writes the document attribute and the stored preference together', () => {
    saveSession(OPERATOR);
    at('#/operator');
    act(() => { fireEvent.click(toggle()); });
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');

    act(() => { fireEvent.click(toggle()); });
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem(THEME_KEY)).toBe('light');
  });
});

/* ================================================================== */
/*  §2-1 — the KPI figure is a fact before it is an animation          */
/* ================================================================== */

describe('§2-1 — a KPI tile that is never revealed still shows the truth', () => {
  const kpiValues = () =>
    Array.from(document.querySelectorAll('.ad-kpi__v')).map((el) => el.textContent);

  beforeEach(() => {
    localStorage.clear();
    saveSession(MDOC);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    window.location.hash = '';
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('reads identically whether or not the reveal ever fires', () => {
    /**
     * The tile used to render a hard-coded `0` and wait for `IntersectionObserver` at
     * `threshold: 0.4`. Any tile that never reaches 40% visibility — a short viewport, a headless
     * print of the follow-up room — displayed and announced a figure of zero that no derivation
     * had produced, on a governance dashboard. The literal was a Latin `0` whatever the language,
     * and `0` rather than `0%` on the ratio tile.
     *
     * With no IntersectionObserver (jsdom) the hook writes the true figure synchronously; with an
     * observer that never fires, the markup is all a reader ever gets. The two must agree.
     */
    at('#/admin');
    const revealed = kpiValues();
    expect(revealed.length).toBeGreaterThan(0);
    expect(revealed.some((v) => /%$/.test(v ?? ''))).toBe(true); // the ratio tile keeps its unit
    document.body.innerHTML = '';

    class NeverFires {
      observe = vi.fn();
      disconnect = vi.fn();
    }
    vi.stubGlobal('IntersectionObserver', NeverFires);
    at('#/admin');
    expect(kpiValues()).toEqual(revealed);
  });
});

/* ================================================================== */
/*  د٢ — the search shortcuts, the listbox, and what Escape closes     */
/* ================================================================== */

/**
 * The reference deck answers `Ctrl+K` with a second surface — a command palette whose
 * «إجراءات» section has no endpoint behind any row. Nothing of the kind is built (plan §٧-ب):
 * the two shortcuts focus the LIVE field that already searches and already jumps deep into a
 * record. The three tests the plan names are here, each guarding a way that behaviour rots
 * silently into a nuisance.
 */
describe('د٢ — «/» and Ctrl+K focus the live search, and never steal a keystroke', () => {
  const field = () => document.querySelector('.op-search__in') as HTMLInputElement;
  const options = () => Array.from(document.querySelectorAll('.op-result')) as HTMLElement[];
  const panel = () => document.querySelector('.op-search__panel');
  /** matches the seeded codes (AH-DRL-0212 …) in either language, so this is not a translation test */
  const QUERY = '-0';

  const SHELLS: Array<[string, typeof MDOC | typeof OPERATOR, string]> = [
    ['admin', MDOC, '#/admin'],
    ['operator', OPERATOR, '#/operator'],
  ];

  /**
   * The seed gives each operating company exactly ONE tender, and the operator shell searches
   * only its own company (D4 scoping, `sessionScopedTenders`). Arrowing needs two rows, so a
   * second one is added for the same company — a copy of a real record, not an invented shape.
   */
  const STORE_KEY = 'masaar-operator-v13';
  function seedSecondRow() {
    const s = seedState();
    const first = JSON.parse(JSON.stringify(s.tenders.find((x) => x.id === 't1'))) as typeof s.tenders[number];
    first.id = 't1b';
    first.code = 'AH-DRL-0213';
    s.tenders.push(first);
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  }

  const openResults = () => {
    const el = field();
    act(() => { fireEvent.change(el, { target: { value: QUERY } }); });
    act(() => { el.focus(); });
    expect(options().length, 'the fixture must yield at least two rows to arrow between')
      .toBeGreaterThan(1);
    return el;
  };

  beforeEach(() => { localStorage.clear(); });
  afterEach(() => {
    document.body.innerHTML = '';
    window.location.hash = '';
    localStorage.clear();
  });

  it.each(SHELLS)('%s: «/» from the page focuses the field', (_name, who, hash) => {
    saveSession(who);
    at(hash);
    expect(document.activeElement).not.toBe(field());
    const ev = new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true });
    act(() => { document.body.dispatchEvent(ev); });
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(field());
  });

  it.each(SHELLS)('%s: Ctrl+K does the same — one field, not a second palette', (_name, who, hash) => {
    saveSession(who);
    at(hash);
    const ev = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true });
    act(() => { document.body.dispatchEvent(ev); });
    expect(document.activeElement).toBe(field());
    // nothing new was opened: no dialog, and still exactly one search field on the screen
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.querySelectorAll('.op-search__in').length).toBe(1);
  });

  /** §٧-أ-4 — the guard. A «/» typed into a date or a path is DATA, and stays where it was typed. */
  it.each(SHELLS)('%s: «/» while typing in another field does NOT hijack the focus', (_name, who, hash) => {
    saveSession(who);
    at(hash);
    for (const tag of ['input', 'textarea', 'select'] as const) {
      const el = document.createElement(tag);
      document.body.appendChild(el);
      act(() => { el.focus(); });
      const ev = new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true });
      act(() => { el.dispatchEvent(ev); });
      expect(document.activeElement, `${tag}: the caret moved`).toBe(el);
      expect(ev.defaultPrevented, `${tag}: the «/» was swallowed`).toBe(false);
      el.remove();
    }
    // a rich-text host is the same case, and its target is a DESCENDANT of the editable element
    const host = document.createElement('div');
    host.setAttribute('contenteditable', 'true');
    const inner = document.createElement('span');
    host.appendChild(inner);
    document.body.appendChild(host);
    const ev = new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true });
    act(() => { inner.dispatchEvent(ev); });
    expect(ev.defaultPrevented).toBe(false);
    expect(document.activeElement).not.toBe(field());
    host.remove();
  });

  /** قانون الصدق §٦ — a printed shortcut hint may not exist before the listener that answers it. */
  it.each(SHELLS)('%s: the «/» chip is rendered only once the listener is planted', (_name, who, hash) => {
    saveSession(who);
    at(hash);
    const chip = document.querySelector('.op-search__kbd');
    expect(chip?.textContent).toBe('/');
    expect(chip?.getAttribute('aria-hidden')).toBe('true'); // the field says it via aria-keyshortcuts
    expect(field().getAttribute('aria-keyshortcuts')).toBe('/ Control+K');
    // the SHAPE is stated once, in the token sheet; the shells only position it
    expect(sheetOf('packages/tokens/css/tokens.css').rule('kbd').getPropertyValue('font-size'))
      .toBe('var(--t-micro)'); // 11px — not the 10px of the deck, which is below our scale
    expect(read('apps/web/src/operator/operator.css')).not.toMatch(/\.op-search__kbd \{[^}]*font-size/);
  });

  it.each(SHELLS)('%s: ↑↓ moves aria-activedescendant along the listbox', (_name, who, hash) => {
    seedSecondRow();
    saveSession(who);
    at(hash);
    const el = openResults();
    const ids = options().map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length); // every option is addressable
    expect(panel()?.getAttribute('role')).toBe('listbox');
    expect(el.getAttribute('aria-expanded')).toBe('true');
    expect(el.getAttribute('aria-activedescendant')).toBeNull(); // nothing pre-selected

    act(() => { fireEvent.keyDown(el, { key: 'ArrowDown' }); });
    expect(el.getAttribute('aria-activedescendant')).toBe(ids[0]);
    expect(options()[0].getAttribute('aria-selected')).toBe('true');

    act(() => { fireEvent.keyDown(el, { key: 'ArrowDown' }); });
    expect(el.getAttribute('aria-activedescendant')).toBe(ids[1]);
    expect(options()[0].getAttribute('aria-selected')).toBe('false');

    act(() => { fireEvent.keyDown(el, { key: 'ArrowUp' }); });
    expect(el.getAttribute('aria-activedescendant')).toBe(ids[0]);
    // ↑ from the top wraps to the end rather than dropping the reader out of the list
    act(() => { fireEvent.keyDown(el, { key: 'ArrowUp' }); });
    expect(el.getAttribute('aria-activedescendant')).toBe(ids[ids.length - 1]);
    // and the focus never left the field — which is the whole point of activedescendant
    expect(document.activeElement).toBe(el);
  });

  it.each(SHELLS)('%s: Enter on the highlighted row makes the jump the click makes', (_name, who, hash) => {
    seedSecondRow();
    saveSession(who);
    at(hash);
    const el = openResults();
    act(() => { fireEvent.keyDown(el, { key: 'ArrowDown' }); });
    act(() => { fireEvent.keyDown(el, { key: 'Enter' }); });
    expect(window.location.hash).not.toBe(hash);
    expect(window.location.hash.length).toBeGreaterThan(hash.length);
  });

  it.each(SHELLS)('%s: Escape closes the list and KEEPS the focus in the field', (_name, who, hash) => {
    seedSecondRow();
    saveSession(who);
    at(hash);
    const el = openResults();
    expect(panel()).not.toBeNull();

    act(() => { fireEvent.keyDown(el, { key: 'Escape' }); });
    expect(panel(), 'the list is still open').toBeNull();
    expect(document.activeElement, 'Escape threw the reader out of the field').toBe(el);
    expect(el.value, 'Escape wiped what was typed').toBe(QUERY);
    expect(el.getAttribute('aria-expanded')).toBe('false');
    expect(el.getAttribute('aria-activedescendant')).toBeNull();

    // typing again revives it — the dismissal was about THIS answer, not about searching
    act(() => { fireEvent.change(el, { target: { value: `${QUERY}zzz` } }); });
    act(() => { fireEvent.change(el, { target: { value: QUERY } }); });
    expect(panel()).not.toBeNull();
  });

  it.each(SHELLS)('%s: ↑↓ stay ordinary caret keys while the list is closed', (_name, who, hash) => {
    saveSession(who);
    at(hash);
    const el = field();
    act(() => { el.focus(); });
    const notPrevented = fireEvent.keyDown(el, { key: 'ArrowDown' });
    expect(notPrevented, 'the arrow was hijacked with no list on screen').toBe(true);
    expect(el.getAttribute('aria-activedescendant')).toBeNull();
  });

  it('carries the same contract in both shells from ONE definition', () => {
    // two copies of a keyboard contract is how two surfaces start disagreeing about Escape
    for (const p of ['apps/web/src/operator/OperatorShell.tsx', 'apps/web/src/admin/AdminShell.tsx']) {
      expect(read(p), `${p} does not use the shared contract`).toMatch(/useShellSearch\(/);
      expect(read(p), `${p} plants a second document keydown listener`)
        .not.toMatch(/addEventListener\('keydown'/);
    }
  });
});
