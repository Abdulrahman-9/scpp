import { stageDeviationWorkingDays } from '@masaar/scpp-rules';
import { workingDaysBetween, type WorkingCalendar } from '@masaar/working-days';
import { currentStage, type StageState, type State, type Tender } from '../store';

/**
 * Operator-portal derivations — the "3 layers" redesign computes everything
 * from the store; nothing about status, deviation or tasks is stored.
 * All deviation is in WORKING days (redesign rule 6) via the engine.
 */

export type OpStatus = 'progress' | 'risk' | 'delayed' | 'done';
export type TaskGroup = 'late' | 'today' | 'week';

/** Live status of a tender from its current stage vs today (working days).
 *  `cal` is the live calendar (calendarOf(state)) so a holiday inside the window pulls "risk" earlier. */
export function tenderStatus(t: Tender, today: string, cal: WorkingCalendar): OpStatus {
  const cur = currentStage(t);
  if (!cur) return 'done';
  if (cur.plannedTo && today > cur.plannedTo) return 'delayed';
  if (cur.plannedTo && workingDaysBetween(today, cur.plannedTo, cal) <= 2) return 'risk';
  return 'progress';
}

/**
 * Sequence-aware stage status: only the CURRENT stage (first still open) is
 * active — stages after it stay 'planned' even if their planned dates already
 * passed, so exactly one stage is actionable. Prefer this over the raw
 * store `stageStatus` for per-stage display in the file/drawer.
 */
export function stageViewStatus(t: Tender, s: StageState, today: string): 'planned' | 'progress' | 'done' | 'delayed' {
  return railStageStatus(t.stages, s, today);
}

/** The three fields a lifecycle slot is coloured by — all a tender stage and a contract stage
 *  share (د13-ع1). Naming the shape lets ONE rule serve both instead of two copies drifting. */
export type RailStage = { key: string; plannedTo?: string; actualTo?: string };

/**
 * The rule above, written over the shape rather than over `Tender` — so the post-award contract
 * lifecycle (`ContractStage[]`, seven stages, its own key space) is toned by the SAME sentence
 * that tones a tender: closed = done; the first still-open one = running, and red only if its
 * planned end has passed; everything after it = planned. A second copy of this rule is how two
 * rails come to disagree about what «الحالية» means.
 */
export function railStageStatus(stages: RailStage[], s: RailStage, today: string): 'planned' | 'progress' | 'done' | 'delayed' {
  if (s.actualTo) return 'done';
  const cur = stages.find((x) => !x.actualTo);
  if (cur && cur.key === s.key) return s.plannedTo && today > s.plannedTo ? 'delayed' : 'progress';
  return 'planned';
}

/** Signed working-day deviation for one stage (closed → actual−planned; open+overdue → since planned). */
export function stageDevWd(s: StageState, today: string, cal: WorkingCalendar): number {
  if (s.actualTo && s.plannedTo) return stageDeviationWorkingDays(s.plannedTo, s.actualTo, cal);
  if (!s.actualTo && s.plannedTo && today > s.plannedTo) return workingDaysBetween(s.plannedTo, today, cal);
  return 0;
}

/** Share of stages closed, 0–100. */
export function progressPct(t: Tender): number {
  if (t.stages.length === 0) return 0;
  const done = t.stages.filter((s) => s.actualTo).length;
  return Math.round((done / t.stages.length) * 100);
}

/**
 * Worst signed working-day deviation across a tender: max lateness among closed
 * stages plus the current stage's overdue days. Positive = late, negative = the
 * tender is running ahead, 0 = on schedule.
 */
export function tenderDeviationWd(t: Tender, today: string, cal: WorkingCalendar): number {
  const devs: number[] = [];
  for (const s of t.stages) {
    if (s.actualTo && s.plannedTo) devs.push(stageDeviationWorkingDays(s.plannedTo, s.actualTo, cal));
  }
  const cur = currentStage(t);
  if (cur?.plannedTo && today > cur.plannedTo) devs.push(workingDaysBetween(cur.plannedTo, today, cal));
  if (devs.length === 0) return 0;
  const max = Math.max(...devs);
  if (max > 0) return max;
  return Math.max(...devs); // all ≤ 0 → the least-early (closest to 0) still reflects "ahead"
}

/** SCPP clause shown on each stage's task chip (governing article). */
export const STAGE_CLAUSE: Record<string, string> = {
  cost: '6.9',
  approval: '11',
  preq: '11.2',
  announce: '11.1',
  invite: '11.8.1',
  'tech-open': '12.4',
  'tech-analysis': '12.4',
  'comm-open': '12.4.2',
  'comm-analysis': '12.4.2',
  ratify: '6.6',
  sign: '14.3',
};

/** Which action wizard opens for a given stage (mirrors the design's WIZ_LINK). */
export function wizardTypeFor(stageKey: string): 'advertise' | 'evaluate' | 'complete' {
  if (stageKey === 'announce' || stageKey === 'invite') return 'advertise';
  if (stageKey === 'tech-analysis' || stageKey === 'comm-open' || stageKey === 'comm-analysis') return 'evaluate';
  return 'complete';
}

/** Icon glyph per stage for the task list. */
export const STAGE_ICON: Record<string, string> = {
  cost: 'doc',
  approval: 'doc',
  preq: 'upload',
  announce: 'bell',
  invite: 'send',
  'tech-open': 'doc',
  'tech-analysis': 'doc',
  'comm-open': 'doc',
  'comm-analysis': 'doc',
  ratify: 'check',
  sign: 'edit',
};

export interface DerivedTask {
  tender: Tender;
  stageKey: string;
  group: TaskGroup;
  /** remaining working days to the planned close: <0 overdue, 0 due today, >0 upcoming */
  dueWd: number;
}

/**
 * "المطلوب مني اليوم" — one actionable task per open tender (its current stage),
 * grouped by urgency and sorted most-urgent first. Extracted from the tender
 * stages and SCPP deadlines, never hand-authored.
 */
export function deriveTasks(state: State, today: string, cal: WorkingCalendar): DerivedTask[] {
  const tasks: DerivedTask[] = [];
  for (const t of state.tenders) {
    const cur = currentStage(t);
    if (!cur) continue; // fully complete → nothing required
    const overdue = !!cur.plannedTo && today > cur.plannedTo;
    const remaining = cur.plannedTo ? workingDaysBetween(today, cur.plannedTo, cal) : Number.POSITIVE_INFINITY;
    let group: TaskGroup;
    let dueWd: number;
    if (overdue) {
      group = 'late';
      dueWd = cur.plannedTo ? -workingDaysBetween(cur.plannedTo, today, cal) : 0;
    } else if (remaining <= 0) {
      group = 'today';
      dueWd = 0;
    } else {
      group = 'week';
      dueWd = remaining;
    }
    tasks.push({ tender: t, stageKey: cur.key, group, dueWd });
  }
  const order: Record<TaskGroup, number> = { late: 0, today: 1, week: 2 };
  return tasks.sort((a, b) => order[a.group] - order[b.group] || a.dueWd - b.dueWd);
}

export function groupTasks(tasks: DerivedTask[]): Record<TaskGroup, DerivedTask[]> {
  return {
    late: tasks.filter((t) => t.group === 'late'),
    today: tasks.filter((t) => t.group === 'today'),
    week: tasks.filter((t) => t.group === 'week'),
  };
}

/* ---------------- display formatters ---------------- */

/**
 * Numbers render with Latin digits in both languages (client decision 2026-07-23:
 * «كل الأرقام لاتينية»). Comma grouping only — matches the `$2,000,000` money style.
 * The `lang` param is kept for call-site stability (23 callers) but no longer branches.
 */
export function fmtCount(n: number, _lang: 'ar' | 'en'): string {
  return n.toLocaleString('en-US');
}

/** Money is always Latin mono, LTR. */
export function fmtMoney(usd: number): string {
  return `$${usd.toLocaleString('en-US')}`;
}

/**
 * Money in a narrow column («$132.4M»), for chart rows where the full grouped figure would not
 * fit. Same Latin-digit, dollar-sign discipline as `fmtMoney`; the suffixes are unit letters,
 * not translated words, so the string stays an LTR machine island in both languages. Anything
 * below a million keeps its exact grouped value — rounding a small figure hides it.
 */
export function fmtMoneyShort(usd: number): string {
  const abs = Math.abs(usd);
  if (abs >= 1_000_000_000) return `$${(usd / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
  return fmtMoney(usd);
}

/**
 * ASCII-fold any Arabic-Indic (U+0660–0669) or Persian (U+06F0–06F9) digit.
 * The character class is built from code points so the source stays ASCII-only — the
 * `latin-digits` source guard would otherwise flag the very function that strips them.
 */
const AR_INDIC_DIGITS = new RegExp(
  `[${String.fromCharCode(0x0660)}-${String.fromCharCode(0x0669)}${String.fromCharCode(0x06f0)}-${String.fromCharCode(0x06f9)}]`,
  'g',
);
export function toLatinDigits(s: string): string {
  return s.replace(AR_INDIC_DIGITS, (d) => {
    const c = d.charCodeAt(0);
    return String(c >= 0x06f0 ? c - 0x06f0 : c - 0x0660);
  });
}

/**
 * A localized date with Arabic month/weekday names but **guaranteed** Latin digits.
 * The one governed door for dates — a raw `toLocaleDateString('ar', …)` re-leaks Arabic-Indic
 * digits that the source-literal guard cannot catch (the digits are runtime-generated).
 * `ar-u-nu-latn` requests Latin; the normalizer makes it deterministic under any ICU build.
 */
export function fmtDate(iso: string, lang: 'ar' | 'en', opts?: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US';
  return toLatinDigits(dt.toLocaleDateString(locale, opts ?? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
}
