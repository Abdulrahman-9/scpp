import { guaranteeExpiringSoon, mctCycleStatus } from '@masaar/scpp-rules';
import { workingDaysBetween } from '@masaar/working-days';
import { aboveOwnFA, calendarOf, currentStage, type State } from './store';

/**
 * In-app notifications (phase 5) — derived live from state, never stored.
 * E-mail delivery is a backend concern; the same computation feeds it later.
 */

export interface Notice {
  id: string;
  severity: 'risk' | 'delayed';
  /** i18n key under notices.* */
  key: string;
  params: Record<string, string | number>;
  /** tender this notice opens to, when it is tender-scoped (operator panel jumps here). */
  tenderId?: string;
}

export function computeNotices(state: State, today: string): Notice[] {
  const out: Notice[] = [];
  const cal = calendarOf(state);

  for (const t of state.tenders) {
    // stage running past its plan
    const cur = currentStage(t);
    if (cur?.plannedTo && today > cur.plannedTo) {
      out.push({ id: `late-${t.id}`, severity: 'delayed', key: 'stageLate', params: { code: t.code }, tenderId: t.id });
    }

    // MCT deadlines approaching (≤ 3 WD) while the cycle is still open
    if (aboveOwnFA(state, t) && t.mct) {
      const s = mctCycleStatus({
        notifiedOn: t.mct.notifiedOn,
        meetingHeldOn: t.mct.meetingHeldOn,
        agreementReachedOn: t.mct.agreementReachedOn,
        asOf: today,
        calendar: cal,
      });
      if (s.prevailingEstimate === 'PENDING') {
        if (!t.mct.meetingHeldOn) {
          const left = workingDaysBetween(today, s.meetingDeadline, cal);
          if (left <= 3) {
            out.push({ id: `mctm-${t.id}`, severity: 'risk', key: 'mctMeeting', params: { code: t.code, days: left }, tenderId: t.id });
          }
        } else if (!t.mct.agreementReachedOn) {
          const left = workingDaysBetween(today, s.agreementDeadline, cal);
          if (left <= 3) {
            out.push({ id: `mcta-${t.id}`, severity: 'risk', key: 'mctAgreement', params: { code: t.code, days: left }, tenderId: t.id });
          }
        }
      }
    }
  }

  // guarantees expiring within 60 days
  for (const c of state.contracts) {
    for (const g of c.guarantees) {
      if (guaranteeExpiringSoon(g.expiresOn, today)) {
        out.push({
          id: `g-${c.id}-${g.kind}`,
          severity: 'risk',
          key: 'guarantee',
          params: { code: c.code, date: g.expiresOn },
        });
      }
    }
  }

  return out.sort((a, b) => (a.severity === 'delayed' ? -1 : 1) - (b.severity === 'delayed' ? -1 : 1));
}
