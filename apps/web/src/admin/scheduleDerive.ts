import { scheduleCompliancePct } from '@masaar/scpp-rules';
import type { WorkingCalendar } from '@masaar/working-days';
import { stageDevWd, tenderDeviationWd } from '../operator/derive';
import { currentStage, type ContractStageKey, type ContractState, type StageState, type State, type Tender } from '../store';
import { actualDelivery, contractProgress, currentStageKey, plannedDelivery, plannedProgressPct, scheduleVariancePct } from './contractDerive';

/**
 * «الامتثال الزمني» (client request 10) — planned against actual, for requests and for contracts.
 *
 * Nothing here is new arithmetic. Every figure is the derivation the rest of the product already
 * argues from — `stageDevWd`, `tenderDeviationWd`, `scheduleVariancePct` — assembled into ONE table
 * so the question «ما الذي تأخّر، وبكم؟» has a registry to open instead of a percentage to stare at.
 * That percentage (the follow-up room's «الالتزام بالجداول») is the decomposition this screen holds.
 *
 * Two honesty rules, both load-bearing and both stated on the screen:
 *   · a stage with NO planned date cannot be judged — it is `unplanned`, never «on time». A zero
 *     deviation and an unmeasurable one are different facts, and averaging them together would
 *     quietly improve the portfolio every time a plan was left blank;
 *   · a COMPLETED request has no current stage, so its row reads its LAST CLOSED stage instead and
 *     says so. Dropping completed requests would make the registry describe only open work, which
 *     is not what «الالتزام الزمني» means.
 *
 * Pure: `today` and the working calendar are injected, never read from the clock.
 */

export type ScheduleStatus = 'onTime' | 'late' | 'ahead' | 'unplanned';

/**
 * «الالتزام بالجداول — منذ البداية»: ONE derivation, two surfaces.
 *
 * The follow-up room's ratio tile links here calling this screen its DECOMPOSITION. That claim was
 * false while each surface computed its own figure: the tile measured every stage ever closed
 * across the whole portfolio, and the screen measured the CURRENT stage of the rows a filter had
 * left standing — a different unit over a different population in a different window. Two numbers
 * that disagree cannot decompose one another.
 *
 * So the predicate lives here and BOTH surfaces call it. The tile and this screen's header KPI are
 * the same call over the same store, and a test pins them equal. The screen's own four KPIs still
 * measure the filtered rows on their current stage — a different, honestly-labelled window, stated
 * on the face of the screen rather than left for a reader to reconcile.
 *
 * Portfolio-wide by construction: it takes `state`, never the filtered rows, because that is what
 * the tile shows and what «منذ البداية» means. Rounded once, here, so neither surface can round
 * differently.
 */
export function allTimeSchedulePct(state: State): number {
  return Math.round(scheduleCompliancePct(
    state.tenders.flatMap((t) => t.stages
      .filter((s) => s.plannedTo)
      .map((s) => ({ plannedEnd: s.plannedTo!, actualEnd: s.actualTo }))),
  ));
}

/** Deviation in WORKING days → the status pill. Positive = late (redesign rule 6). */
export function scheduleStatusOf(devWd: number, planned: boolean): ScheduleStatus {
  if (!planned) return 'unplanned';
  if (devWd > 0) return 'late';
  if (devWd < 0) return 'ahead';
  return 'onTime';
}

export interface TenderScheduleRow {
  tender: Tender;
  /** the stage the row measures: the CURRENT one, or the last CLOSED one once the request is done */
  stage?: StageState;
  /** false when the request is complete and `stage` is therefore a closed stage, not a live one */
  open: boolean;
  plannedTo?: string;
  actualTo?: string;
  /** signed working days on `stage` — the deviation the row is about */
  devWd: number;
  /** worst signed working-day deviation across the WHOLE request (the registry's own column) */
  tenderDevWd: number;
  status: ScheduleStatus;
}

/** The last stage this request actually closed — the only honest anchor for a completed request. */
function lastClosed(t: Tender): StageState | undefined {
  for (let i = t.stages.length - 1; i >= 0; i -= 1) {
    const s = t.stages[i]!;
    if (s.actualTo) return s;
  }
  return undefined;
}

export function tenderScheduleRows(state: State, today: string, cal: WorkingCalendar): TenderScheduleRow[] {
  return state.tenders.map((t) => {
    const cur = currentStage(t);
    const stage = cur ?? lastClosed(t);
    const devWd = stage ? stageDevWd(stage, today, cal) : 0;
    return {
      tender: t,
      stage,
      open: cur !== undefined,
      plannedTo: stage?.plannedTo,
      actualTo: stage?.actualTo,
      devWd,
      tenderDevWd: tenderDeviationWd(t, today, cal),
      status: scheduleStatusOf(devWd, !!stage?.plannedTo),
    };
  });
}

export interface ContractScheduleRow {
  contract: ContractState;
  /** the stage it is parked at; undefined once every stage is closed */
  stageKey?: ContractStageKey;
  /** share of stages closed */
  progressPct: number;
  /** share of stages whose planned date has passed */
  plannedPct: number;
  /** actual − planned, in percentage points; negative = behind */
  variancePct: number;
  plannedDeliveryOn: string;
  actualDeliveryOn?: string;
  status: ScheduleStatus;
}

/**
 * The contract side. `scheduleVariancePct` is measured in PERCENTAGE POINTS of completed stages,
 * not in days — a different unit from the request side, and the screen says so rather than letting
 * a reader add the two columns together. A contract with no stages at all cannot be judged.
 */
export function contractScheduleRows(state: State, today: string): ContractScheduleRow[] {
  return state.contracts.map((c) => {
    const variancePct = scheduleVariancePct(c, today);
    return {
      contract: c,
      stageKey: currentStageKey(c),
      progressPct: contractProgress(c).pct,
      plannedPct: plannedProgressPct(c, today),
      variancePct,
      plannedDeliveryOn: plannedDelivery(c),
      actualDeliveryOn: actualDelivery(c),
      // the sign convention is inverted against the request side (behind = negative points), so it
      // is normalised here — one status vocabulary across both tables
      status: c.stages.length === 0 ? 'unplanned' : scheduleStatusOf(-variancePct, true),
    };
  });
}

export interface ScheduleKpis {
  onTime: number;
  late: number;
  ahead: number;
  /** rows with no planned date — the denominator the average is NOT computed over */
  unplanned: number;
  /** mean signed working-day deviation over the MEASURABLE rows, rounded; null when there are none */
  avgDevWd: number | null;
  /** how many rows that average was computed from — printed beside it, never implied */
  measured: number;
}

/**
 * The KPI strip. The average is taken over the rows that carry a planned date and NOTHING else:
 * an unplanned stage contributes no zero, because «no plan» is not «no deviation». `null` when
 * nothing is measurable — the strip prints «—», never a 0% that reads as perfect compliance.
 */
export function scheduleKpis(rows: readonly { devWd: number; status: ScheduleStatus }[]): ScheduleKpis {
  const measurable = rows.filter((r) => r.status !== 'unplanned');
  const sum = measurable.reduce((s, r) => s + r.devWd, 0);
  return {
    onTime: rows.filter((r) => r.status === 'onTime').length,
    late: rows.filter((r) => r.status === 'late').length,
    ahead: rows.filter((r) => r.status === 'ahead').length,
    unplanned: rows.filter((r) => r.status === 'unplanned').length,
    avgDevWd: measurable.length ? Math.round(sum / measurable.length) : null,
    measured: measurable.length,
  };
}
