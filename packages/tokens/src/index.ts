/**
 * Masaar design tokens — TypeScript mirror of css/tokens.css (v2).
 *
 * The CSS file is the single source of truth; this file exists so a TS consumer can name a
 * token without retyping a hex. TypeScript cannot resolve `var()`, so every value here is the
 * RESOLVED one, and `visualRefresh.test.tsx › §1 mirror` resolves the CSS the same way and
 * fails this file the moment the two disagree.
 *
 * Light theme only, deliberately: a second literal table for the dark theme would be a second
 * source of truth for values no TS consumer reads. Dark lives in the sheet.
 */

/** Brand — indigo blue. 600 is the primary action, 700 the link and hover. */
export const primary = {
  50: '#EFF6FF',
  100: '#DBEAFE',
  200: '#BFDBFE',
  300: '#93C5FD',
  400: '#60A5FA',
  500: '#3B82F6',
  600: '#2563EB',
  700: '#1D4ED8',
  800: '#1E40AF',
  900: '#1E3A8A',
  950: '#172554',
} as const;

/** Secondary — sky. Active / selected and the one meaning-bearing mark. Never a status. */
export const secondary = {
  50: '#F0F9FF',
  100: '#E0F2FE',
  200: '#BAE6FD',
  300: '#7DD3FC',
  400: '#38BDF8',
  500: '#0EA5E9',
  600: '#0284C7',
  700: '#0369A1',
} as const;

/** Surfaces — cool slate. The ground of both themes. */
export const surface = {
  50: '#F8FAFC',
  100: '#F1F5F9',
  200: '#E2E8F0',
  300: '#CBD5E1',
  400: '#94A3B8',
  500: '#64748B',
  600: '#475569',
  700: '#334155',
  800: '#1E293B',
  900: '#0F172A',
  950: '#020617',
} as const;

/**
 * The ink scale. 1/2/3 are ladder steps; `muted` is DERIVED (--surface-500 falls to 4.344 on
 * --bg-muted while carrying read text), `disabled` sits under 3:1 on purpose — WCAG 1.4.3's
 * inactive-component exemption, claimed by name and spent on `:disabled` only.
 */
export const text = {
  1: '#0F172A',
  2: '#334155',
  3: '#475569',
  muted: '#5A687D',
  disabled: '#94A3B8',
} as const;

/**
 * The six platform statuses — one status language across all screens. Names are fixed (StatusKey,
 * i18n, StatusPill); the VALUES are a documented projection onto the `orderStatus` families
 * (DESIGN-V2-SPEC §1-د), except `planned`, which is grey by definition.
 */
export const status = {
  planned: { fg: '#475569', bg: '#E2E8F0', bd: '#CBD5E1' },
  progress: { fg: '#6D28D9', bg: '#F5F3FF', bd: '#DDD6FE' },
  done: { fg: '#147739', bg: '#F0FDF4', bd: '#BBF7D0' },
  risk: { fg: '#A84D08', bg: '#FFFBEB', bd: '#FDE68A' },
  delayed: { fg: '#BE123C', bg: '#FFF1F2', bd: '#FECDD3' },
  blocked: { fg: '#B91C1C', bg: '#FEF2F2', bd: '#FECACA' },
} as const;

export type StatusKey = keyof typeof status;

/**
 * Order lifecycle — the `--st-*` families the six statuses above project onto, plus `delivered`,
 * which nothing projects onto. `delivered` is kept by explicit client instruction for the order
 * screens; named debt, sunset review 2026-12-31.
 * `base` is the dot / graphical mark, `fg` the AA text over `bg`.
 */
export const orderStatus = {
  pending: { base: '#D97706', fg: '#A84D08', bg: '#FFFBEB', bd: '#FDE68A' },
  approved: { base: '#16A34A', fg: '#147739', bg: '#F0FDF4', bd: '#BBF7D0' },
  preparing: { base: '#7C3AED', fg: '#6D28D9', bg: '#F5F3FF', bd: '#DDD6FE' },
  delivered: { base: '#166534', fg: '#ECFDF5', bg: '#166534', bd: '#166534' },
  cancelled: { base: '#DC2626', fg: '#B91C1C', bg: '#FEF2F2', bd: '#FECACA' },
  late: { base: '#BE123C', fg: '#BE123C', bg: '#FFF1F2', bd: '#FECDD3' },
} as const;

export type OrderStatusKey = keyof typeof orderStatus;

/**
 * Two families, self-hosted via @fontsource. 'Segoe UI' precedes system-ui because the critical
 * fallback is Arabic Windows. JetBrains Mono carries no Arabic glyph, and every --font-mono
 * consumer is an LTR island.
 */
export const fonts = {
  sans: "'IBM Plex Sans Arabic','Segoe UI',system-ui,-apple-system,sans-serif",
  mono: "'JetBrains Mono',ui-monospace,'SF Mono',Menlo,Consolas,monospace",
} as const;

/** Motion system — three durations, one curve. v2 knows a single easing. */
export const motion = {
  durFast: 150,
  durBase: 200,
  durSlow: 250,
  easeOut: 'cubic-bezier(0.2,0.8,0.2,1)',
} as const;
