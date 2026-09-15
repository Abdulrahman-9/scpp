# Design

Authoritative source: `packages/tokens/css/tokens.css` (v2; self-hosted fonts via @fontsource). Never restate values inline — always `var(--…)`.

## Theme

Two first-class themes on one token set. `data-theme` on `<html>`, resolved before first paint from `masaar.theme` (falling back to the OS preference), toggled from both shells' topbars. Light is cool slate on white; dark is slate-900 on slate-800. **Print is always light** — the dark block lives inside `@media screen`, so paper needs no second palette. Indigo carries identity; the sky secondary marks *active/selected* and nothing else; status colour is a closed vocabulary and is never decoration.

## Color roles

- Brand: `--primary-50…950` (indigo; action `--primary-600`, link/hover `--primary-700`). Secondary: `--secondary-50…700` (sky) — active/selected and the one meaning-bearing mark (`--mark-accent`), never a status.
- Surfaces: `--surface-50…950` (cool slate), and from them `--bg-page`, `--bg-card`, `--bg-muted`, `--bg-inset`.
- Ink: `--text-1/2/3` (ladder steps) + `--text-muted` (derived, clears AA on all four surfaces) + `--text-disabled` (WCAG 1.4.3 inactive-component exemption, `:disabled` only).
- Borders: `--border-1`/`--border-2` are decorative (1.4.11 exempt); `--border-control` is functional and holds 3:1 on every surface.
- Status (fixed meanings, each with `-bg`/`-bd` pair): `--status-planned` (مخطط), `--status-progress` (قيد التنفيذ), `--status-done` (منجز), `--status-risk` (تحذير), `--status-delayed` (متأخر), `--status-blocked` (موقوف) — **projected onto the `--st-*` order families**, not a second ladder. Status color is information, never decoration.
- Approval tiers: `--tier-operator/jmc/mdoc` — a lightness ramp inside the brand hue, monotonic in both themes. Never a status.

Amber has left the identity entirely: it survives only as the `pending` status hue inside `--st-pending-*`.

## Typography

Arabic-first stacks from tokens (self-hosted). Mono (`.mono`, `.op-code`) for codes/dates/money — always LTR islands, Latin digits via `fmtCount(n, lang)`. Product scale: fixed rem steps, weight carries hierarchy. RTL note: `td.mono`/`td.op-code` re-anchor to column start edge (see styles.css rule).

## Layout & spacing

CSS logical properties exclusively (`inset-inline-*`, `padding-inline`, `margin-inline`, `text-align: start/end`, `border-start-*`). Radii/spacing from tokens (`--r-md` …). Pages are `.op-page` vertical stacks; density is welcome in tables.

## Component vocabulary (reuse before inventing)

- Primitives (`@masaar/ui`): StatusPill, PathBadge, KpiTile, CapMeter, WdRail, VerdictStrip, Stepper (2 skins: the ledger default and the blueprint explainer — the hand-mixed «operations room» inversion left with DESIGN-V2-SPEC §4-ط, superseded by the real dark theme).
- Shell/page: `.op-page`, `.op-page__head/__title/__sub`, `.op-tablecard` + `.op-tbl` (+ `.op-tbl__row/__name/__code`, `.op-end`), `.op-empty`, `.op-search`, `.op-panel`, `.op-drawer` (QuickLook), `.tv2-toast` (card + start-edge bar).
- Buttons: FOUR kinds on one 34px shape — `.op-btn-primary` (ONE per surface), `.op-btn-secondary` (export/print), `.op-btn-ghost`, `.op-btn-danger` — plus `.op-iconbtn`. `.op-cta`, `.op-btn-nav`, `.wz-next`, `.file-here__cta`, `.file-tl__wiz`, `.ad-decision__go`, `.wz-draft` and the `.btn` family were copies of these and are deleted; `op-btn-danger` is a kind, never a modifier on another kind. Labels are masdar + object («تسجيل دفعة»); confirms are «نعم، + الواقعة» / «تراجع».
- Wizard/notes: `.wz-note--info/warn/danger/ok`, `.wz-chip(--on)`, `.wz-gate(--ok)`, WizardShell.
- Admin: `.ad-kpis/.ad-kpi(__head/__l/__row/__v/__delta)`, `.ad-cols/.ad-panel`, `.ad-modal` (Modal.tsx), `.acc-*` registry family (filters, avatar, role pills, `.acc-open` row link).
- Registry layer (batch 1, `apps/web/src/registry/`): ReportColumn/exportCsv, useTableSort + SortableTh (aria-sort), usePagination + PaginationBar, EmptyState (dual-mode), SearchBox, FilterChips — the mandatory skeleton for every list screen.

## Motion

150–250ms ease-out state feedback only (open/close, hover tints). No entrance choreography. `prefers-reduced-motion` honored.

## Iconography

`Icon.tsx` only (stroke icons, named registry) — including `moon`/`sun` for the theme switch. No emoji anywhere. Forward chevrons use `.op-chev-fwd` (flips under LTR).

## Hard bans

Raw hex/palette classes in components; physical left/right CSS; disabled-without-explanation commits (use `.wz-gate`); placebo buttons; Latin digits mid-Arabic (use `fmtCount`); nested cards; side-stripe accent borders on new components. **No colour written outside `tokens.css`, and no value defined twice.** **No rule shadowing an older rule — the older one is deleted.**
