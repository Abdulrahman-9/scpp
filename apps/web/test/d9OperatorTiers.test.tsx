// @vitest-environment jsdom
import { approvalTierFor, DEFAULT_APPROVAL_TIERS, mayRatifyTier } from '@masaar/scpp-rules';
import { render, screen, within } from '@testing-library/react';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '../src/i18n';
import App from '../src/App';
import ar from '../src/locales/ar.json';
import en from '../src/locales/en.json';
import { saveSession } from '../src/session';
import { tierMoves } from '../src/admin/OperatorLadderModal';
import {
  operatorsWithOwnTiers, reducer, resolveTiersFor, SEED_APPROVAL_TIERS, seedState,
  tenderApprovalTier, type Actor, type AuditEntry, type State,
} from '../src/store';

/**
 * د9 — سلالم الموافقة لكل مشغّل (ops/OPERATOR-TIERS-SPEC.md).
 *
 * The client decision of 2026-08-25 supersedes ق1's «one ladder for every operator» without
 * erasing it: the system default stands, and a supervisor may approve ceilings for ONE company
 * above it. Almost none of the product had to learn that — which is the property these tests
 * exist to hold. `tenderApprovalTier` is the single point where the resolution happens, so every
 * consumer downstream of it (the ratify gate, the chain, the counters, the filters) inherits the
 * per-operator ladder WITHOUT a line of its own. A test that recomputed a tier here would be a
 * second definition; each one below reads the product's own single derivation instead.
 */

const KEY = 'masaar-operator-v13';
const SUPER: Actor = { oid: 'oid-super-01', name: 'م. مصطفى الكرخي', role: 'SUPER_ADMIN' };
const JMC: Actor = { oid: 'oid-jmc-01', name: 'م. رافد الدليمي', role: 'JMC_APPROVER' };
const REASON = 'اعتماد سقوف خاصة لهذه الشركة بقرار السوبرفايزر المؤرخ 2026-08-25 وبناءً على حجم محفظتها';

const fresh = (): State => seedState();
const lastRow = (s: State): AuditEntry => s.audit[s.audit.length - 1]!;
const tender = (s: State, id: string) => s.tenders.find((t) => t.id === id)!;

/** Approve a ladder for one company through the REAL action — never by hand-patching state. */
function withOwnLadder(s: State, operatorId: string, operatorMaxUSD: number, jmcMaxUSD: number): State {
  return reducer(s, {
    type: 'SET_OPERATOR_TIERS', operatorId, tiers: { operatorMaxUSD, jmcMaxUSD }, reason: REASON, by: SUPER,
  });
}

beforeEach(() => {
  localStorage.clear();
  saveSession({ name: SUPER.name, role: 'SUPER_ADMIN', oid: SUPER.oid });
});
afterEach(() => {
  document.body.innerHTML = '';
  window.location.hash = '';
  localStorage.clear();
});

function at(hash: string, state?: State) {
  if (state) localStorage.setItem(KEY, JSON.stringify(state));
  window.location.hash = hash;
  return render(<App />);
}

/* ═══════════════ §8-1 — the boundaries, with an override in play ═══════════════ */

describe('§8-1 — one value, two companies, two different approving bodies', () => {
  it('the SAME estimate is ط1 for a company on the default and ط2 for its neighbour on a lower ladder', () => {
    // seed: t1 is op-alwaha at 4.20M — ط1 on the default 5M/10M ladder
    const base = fresh();
    expect(tenderApprovalTier(base, tender(base, 't1'))).toBe('OPERATOR');

    // approve a LOWER ladder for AlWaha alone: 1M/3M. Badra is untouched.
    const s = withOwnLadder(base, 'op-alwaha', 1_000_000, 3_000_000);
    expect(tenderApprovalTier(s, tender(s, 't1'))).toBe('MDOC'); // 4.20M > its own 3M JMC ceiling

    // a Badra tender of the very same value is still ط1: the neighbour is on the default
    const twin = { ...tender(s, 't1'), id: 'tw', operatorId: 'op-badra' };
    expect(tenderApprovalTier({ ...s, tenders: [...s.tenders, twin] }, twin)).toBe('OPERATOR');
  });

  it('the boundaries stay INCLUSIVE under a company ladder — equal to the ceiling is the LOWER tier', () => {
    const s = withOwnLadder(fresh(), 'op-alwaha', 2_000_000, 6_000_000);
    const t = (v: number) => tenderApprovalTier(s, { ...tender(s, 't1'), estimatedValueUSD: v });
    expect(t(2_000_000)).toBe('OPERATOR'); // AT the operator ceiling
    expect(t(2_000_001)).toBe('JMC');
    expect(t(6_000_000)).toBe('JMC');      // AT the JMC ceiling
    expect(t(6_000_001)).toBe('MDOC');
  });

  it('a structurally broken company ladder FAILS CLOSED to MDOC rather than falling back to the default', () => {
    // written past the action's gate on purpose: this is the LOAD hazard, not an editor path
    const s: State = { ...fresh(), operatorTiers: { 'op-alwaha': { operatorMaxUSD: Number.NaN, jmcMaxUSD: 3_000_000 } } };
    expect(tenderApprovalTier(s, tender(s, 't1'))).toBe('MDOC');
    // and emphatically NOT the default's verdict, which would have cleared it at the lowest gate
    expect(approvalTierFor(tender(s, 't1').estimatedValueUSD, SEED_APPROVAL_TIERS)).toBe('OPERATOR');
  });
});

/* ═══════════════ §8-2 — the fallback ═══════════════ */

describe('§8-2 — no entry means the system default, by identity', () => {
  it('resolveTiersFor returns the default OBJECT itself for a company with no approved ladder', () => {
    const s = fresh();
    expect(resolveTiersFor(s, 'op-badra')).toBe(s.approvalTiers); // identity, not a clone
    expect(s.approvalTiers).toBe(SEED_APPROVAL_TIERS);
  });

  it('an ORPHAN tender (no operator) reads the default — today’s behaviour verbatim', () => {
    const s = withOwnLadder(fresh(), 'op-alwaha', 1_000_000, 3_000_000);
    expect(resolveTiersFor(s, undefined)).toBe(s.approvalTiers);
    const orphan = { ...tender(s, 't1'), id: 'orph', operatorId: undefined };
    expect(tenderApprovalTier({ ...s, tenders: [orphan] }, orphan)).toBe('OPERATOR');
  });

  it('an entry left behind for an UNREGISTERED company is inert: counted nowhere, changing no tier', () => {
    const s: State = { ...fresh(), operatorTiers: { 'op-gone': { operatorMaxUSD: 1, jmcMaxUSD: 2 } } };
    expect(operatorsWithOwnTiers(s)).toEqual([]);            // not in the counter
    expect(tenderApprovalTier(s, tender(s, 't1'))).toBe('OPERATOR'); // no tender moved
  });

  it('the counter is the INTERSECTION of the map with the registry', () => {
    const s = withOwnLadder(fresh(), 'op-alwaha', 1_000_000, 3_000_000);
    expect(operatorsWithOwnTiers(s)).toEqual(['op-alwaha']);
    expect(operatorsWithOwnTiers({ ...s, operatorTiers: { ...s.operatorTiers, 'op-gone': { operatorMaxUSD: 1, jmcMaxUSD: 2 } } }))
      .toEqual(['op-alwaha']);
  });
});

/* ═══════════════ §8-4 — the governed action ═══════════════ */

describe('§8-4 — SET_OPERATOR_TIERS: applied, refused, and the transition on the record', () => {
  it('applies the ladder and writes ONE attributed row carrying the default→ceilings transition', () => {
    const s = withOwnLadder(fresh(), 'op-alwaha', 1_000_000, 3_000_000);
    expect(s.operatorTiers['op-alwaha']).toEqual({ operatorMaxUSD: 1_000_000, jmcMaxUSD: 3_000_000 });
    const row = lastRow(s);
    expect(row.action).toBe('SET_OPERATOR_TIERS');
    expect(row.target).toBe('op-alwaha');       // the key the entry is stored under
    expect(row.outcome).toBe('applied');
    expect(row.by).toEqual(SUPER);
    expect(row.detail).toBe('default→$1,000,000/$3,000,000');
    // self-auditing: the generic wrapper must NOT have written a second row
    expect(s.audit.filter((r) => r.action === 'SET_OPERATOR_TIERS')).toHaveLength(1);
  });

  it('refuses an unregistered company with `unknown-operator`, leaving the map untouched', () => {
    const s = reducer(fresh(), { type: 'SET_OPERATOR_TIERS', operatorId: 'op-nope', tiers: { operatorMaxUSD: 1, jmcMaxUSD: 2 }, reason: REASON, by: SUPER });
    expect(s.operatorTiers).toEqual({});
    expect(lastRow(s)).toMatchObject({ outcome: 'refused', reasonCode: 'unknown-operator', target: 'op-nope' });
  });

  it('refuses a missing justification with `reason` — checked BEFORE the ladder itself', () => {
    const s = reducer(fresh(), { type: 'SET_OPERATOR_TIERS', operatorId: 'op-alwaha', tiers: { operatorMaxUSD: 1_000_000, jmcMaxUSD: 3_000_000 }, reason: 'قصير', by: SUPER });
    expect(s.operatorTiers).toEqual({});
    expect(lastRow(s)).toMatchObject({ outcome: 'refused', reasonCode: 'reason' });
  });

  it('refuses an INVERTED or EQUAL-CEILING ladder with `ladder-invalid` — the door is stricter than the engine', () => {
    const inverted = reducer(fresh(), { type: 'SET_OPERATOR_TIERS', operatorId: 'op-alwaha', tiers: { operatorMaxUSD: 9_000_000, jmcMaxUSD: 3_000_000 }, reason: REASON, by: SUPER });
    expect(lastRow(inverted)).toMatchObject({ outcome: 'refused', reasonCode: 'ladder-invalid' });
    // equal ceilings describe an EMPTY ط2 band: the engine tolerates it, the entry gate does not
    const equal = reducer(fresh(), { type: 'SET_OPERATOR_TIERS', operatorId: 'op-alwaha', tiers: { operatorMaxUSD: 3_000_000, jmcMaxUSD: 3_000_000 }, reason: REASON, by: SUPER });
    expect(lastRow(equal)).toMatchObject({ outcome: 'refused', reasonCode: 'ladder-invalid' });
    expect(approvalTierFor(4_000_000, { operatorMaxUSD: 3_000_000, jmcMaxUSD: 3_000_000 })).toBe('MDOC'); // engine unchanged
    // a ZERO operator ceiling is deliberately ALLOWED — a real policy, not a mistake
    const zero = withOwnLadder(fresh(), 'op-alwaha', 0, 3_000_000);
    expect(zero.operatorTiers['op-alwaha']).toEqual({ operatorMaxUSD: 0, jmcMaxUSD: 3_000_000 });
  });

  it('writes NO ROW for a no-op — the same ladder again, or a withdrawal from a company on the default', () => {
    const s = withOwnLadder(fresh(), 'op-alwaha', 1_000_000, 3_000_000);
    const again = withOwnLadder(s, 'op-alwaha', 1_000_000, 3_000_000);
    expect(again).toBe(s); // state identity preserved → no audit row of any kind

    const base = fresh();
    const dropNothing = reducer(base, { type: 'SET_OPERATOR_TIERS', operatorId: 'op-alwaha', tiers: null, reason: REASON, by: SUPER });
    expect(dropNothing).toBe(base);
  });

  it('null WITHDRAWS the ladder as a full governed act — attributed, justified, and back to the default', () => {
    const s = withOwnLadder(fresh(), 'op-alwaha', 1_000_000, 3_000_000);
    const back = reducer(s, { type: 'SET_OPERATOR_TIERS', operatorId: 'op-alwaha', tiers: null, reason: REASON, by: SUPER });
    expect(back.operatorTiers['op-alwaha']).toBeUndefined();
    expect(resolveTiersFor(back, 'op-alwaha')).toBe(back.approvalTiers);
    expect(lastRow(back)).toMatchObject({
      action: 'SET_OPERATOR_TIERS', outcome: 'applied', by: SUPER,
      detail: '$1,000,000/$3,000,000→default',
    });
  });

  it('THE PROOF THE GATE READS THE RESOLVED LADDER: JMC is refused `tier-MDOC` on a request that is ط2 by default', () => {
    // t3 is $7.80M — ط2 on the default ladder, which a JMC signature clears
    const base = fresh();
    expect(tenderApprovalTier(base, tender(base, 't3'))).toBe('JMC');
    expect(mayRatifyTier('JMC_APPROVER', 'JMC')).toBe(true);
    const ok = reducer(base, { type: 'RATIFY', tenderId: 't3', by: JMC });
    expect(tender(ok, 't3').ratification?.status).toBe('ratified');

    // now approve a ladder for t3's company (FZE / op-mansuria) that puts $7.80M above its JMC
    // ceiling. The value did not move; the ladder did — and the SAME signature is now refused.
    const s = withOwnLadder(base, tender(base, 't3').operatorId!, 1_000_000, 5_000_000);
    expect(tenderApprovalTier(s, tender(s, 't3'))).toBe('MDOC');
    const refused = reducer(s, { type: 'RATIFY', tenderId: 't3', by: JMC });
    expect(tender(refused, 't3').ratification).toBeUndefined();
    expect(lastRow(refused)).toMatchObject({ action: 'RATIFY', outcome: 'refused', reasonCode: 'tier-MDOC' });
  });

  it('`mayRatifyTier` itself is untouched — only the tier handed to it changed', () => {
    expect(mayRatifyTier('JMC_APPROVER', 'JMC')).toBe(true);
    expect(mayRatifyTier('JMC_APPROVER', 'MDOC')).toBe(false);
    expect(mayRatifyTier('MDOC_ADMIN', 'MDOC')).toBe(true);
  });
});

/* ═══════════════ the editor's preview (§5-4) ═══════════════ */

describe('the impact preview counts exactly the live, undecided requests that change hands', () => {
  it('counts a pending tender that moves tier, and excludes decided and cancelled ones', () => {
    const s = fresh();
    const cur = SEED_APPROVAL_TIERS;
    const next = { operatorMaxUSD: 1_000_000, jmcMaxUSD: 3_000_000 };

    // t1 (op-alwaha, 4.20M) is pending and moves OPERATOR → MDOC
    expect(tierMoves(s.tenders, 'op-alwaha', cur, next).map((m) => m.tender.id)).toEqual(['t1']);
    expect(tierMoves(s.tenders, 'op-alwaha', cur, next)[0]).toMatchObject({ from: 'OPERATOR', to: 'MDOC' });

    // a request already signed is NOT reopened by a new ladder, so it is not promised as moving
    const decided = s.tenders.map((t) => (t.id === 't1' ? { ...t, ratification: { status: 'ratified' as const, by: 'x', on: '2026-06-01' } } : t));
    expect(tierMoves(decided, 'op-alwaha', cur, next)).toEqual([]);

    // nor is a cancelled one — it left the process
    const cancelled = s.tenders.map((t) => (t.id === 't1' ? { ...t, lifecycle: { status: 'cancelled' as const, reason: 'r', on: '2026-06-01', by: 'x' } } : t));
    expect(tierMoves(cancelled, 'op-alwaha', cur, next)).toEqual([]);

    // and another company's requests are never counted against this company's ladder
    expect(tierMoves(s.tenders, 'op-badra', cur, next).every((m) => m.tender.operatorId === 'op-badra')).toBe(true);
  });

  it('an unchanged ladder moves nothing', () => {
    expect(tierMoves(fresh().tenders, 'op-alwaha', SEED_APPROVAL_TIERS, SEED_APPROVAL_TIERS)).toEqual([]);
  });
});

/* ═══════════════ §8-5 — no literal threshold in any screen ═══════════════ */

describe('§8-5 — the ceilings live in the engine, never typed into a screen', () => {
  const ROOT = join(__dirname, '..', 'src');
  /**
   * Two named exemptions, and neither is a ladder:
   *  · `store.tsx` is the SEED's home — the demo universe's Service-Contract authorities (§7.1)
   *    are figures about fields, not ladder ceilings, and the ladder itself is re-exported from
   *    the engine there rather than retyped.
   *  · `Gallery.tsx` is the component showcase (#/ui): its `CONTRACT` is a demo contract VALUE fed
   *    to `variationOrdersCap`, a coincidental numeric match that never reaches a tier.
   */
  const EXEMPT = new Set(['store.tsx', 'Gallery.tsx']);
  const LITERAL = /5_000_000|10_000_000|5000000|10000000/;
  /** Comments are PROSE: a threshold quoted while explaining why it is not hardcoded is not a
   *  hardcoded threshold, and a guard that could not tell the two apart would push the
   *  documentation out of the code it documents. Only what the compiler sees is scanned. */
  const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  function tsxFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) return tsxFiles(p);
      return name.endsWith('.tsx') && !EXEMPT.has(name) ? [p] : [];
    });
  }

  it('no .tsx under src restates a ladder ceiling', () => {
    const offenders = tsxFiles(ROOT).filter((p) => LITERAL.test(code(readFileSync(p, 'utf8'))));
    expect(offenders.map((p) => p.slice(ROOT.length + 1))).toEqual([]);
  });

  it('the engine still holds the seeded figures, so the guard is a relocation and not a deletion', () => {
    expect(DEFAULT_APPROVAL_TIERS).toEqual({ operatorMaxUSD: 5_000_000, jmcMaxUSD: 10_000_000 });
    expect(SEED_APPROVAL_TIERS).toBe(DEFAULT_APPROVAL_TIERS);
  });
});

/* ═══════════════ §8-6 — api-mode honesty ═══════════════ */

describe('§8-6 — the drift alarms stay green, because the DEFAULT never moved', () => {
  it('the seeded ladder is still the engine constant the server gates on', () => {
    expect(SEED_APPROVAL_TIERS).toBe(DEFAULT_APPROVAL_TIERS);
    expect(seedState().approvalTiers).toBe(DEFAULT_APPROVAL_TIERS);
    // and no override is seeded, so a fresh install shows the default as a FACT, not by accident
    expect(seedState().operatorTiers).toEqual({});
  });

  it('the action is CLIENT_ONLY and the editor is withheld in api-mode — the debt is stated in words', () => {
    // the banner exists in both locales, and names the reason rather than only the absence
    expect(ar.opladder.apiBlocked.length).toBeGreaterThan(40);
    expect(en.opladder.apiBlocked.length).toBeGreaterThan(40);
    const src = readFileSync(join(__dirname, '..', 'src', 'admin', 'Operators.tsx'), 'utf8');
    // the row action is rendered only when NOT in api mode: a disabled button would still be a
    // control the server has no answer for, and the banner replaces it rather than joining it
    expect(src).toMatch(/!isApiMode &&[\s\S]{0,400}opladder\.action/);
    expect(src).toContain("t('opladder.apiBlocked')");
  });
});

/* ═══════════════ §8-7 — the surfaces ═══════════════ */

describe('§8-7 — every surface reads the ladder that actually governs its subject', () => {
  it('the tender file’s tier pill states the bands of ITS company’s ladder, not the default', () => {
    const s = withOwnLadder(fresh(), 'op-alwaha', 1_000_000, 3_000_000);
    at('#/admin/review/t1', s);
    const pill = document.querySelector('.ad-tier') as HTMLElement;
    // the tooltip carries the figures; they must be the COMPANY's ceilings, not 5M/10M
    expect(pill.title).toContain('3,000,000');
    expect(pill.title).not.toContain('10,000,000');
  });

  it('the system explainer LABELS its ladder as the default and counts the companies outside it', () => {
    at('#/admin/approvals', withOwnLadder(fresh(), 'op-alwaha', 1_000_000, 3_000_000));
    const explain = document.body.textContent ?? '';
    expect(explain).toContain(ar.tier.srcDefault);
    // «N من الشركات… على سلّم خاص» with N = 1
    expect(explain).toContain(ar.tier.ownCount.replace('{{n}}', '1'));
  });

  it('with nobody on a custom ladder the same surface says SO, rather than staying silent', () => {
    at('#/admin/approvals', fresh());
    expect(document.body.textContent).toContain(ar.tier.ownCountNone);
  });

  it('the operators registry badges each row and the KPI equals the intersection count', () => {
    at('#/admin/operators', withOwnLadder(fresh(), 'op-alwaha', 1_000_000, 3_000_000));
    const own = [...document.querySelectorAll('.ad-ladder__src--own')];
    expect(own).toHaveLength(1);
    expect(own[0]!.textContent).toBe(ar.tier.srcOwn);
    // exactly one KPI tile carries the counter, and it reads 1
    const tile = [...document.querySelectorAll('.ad-kpi')].find((el) => el.textContent?.includes(ar.opladder.kpiOwn))!;
    expect(within(tile as HTMLElement).getByText('1')).toBeTruthy();
  });

  it('the operator portal shows ITS OWN company’s ladder, tagged with where it came from', () => {
    const s = withOwnLadder(fresh(), 'op-alwaha', 1_000_000, 3_000_000);
    localStorage.setItem(KEY, JSON.stringify(s));
    saveSession({ name: 'م. أحمد عبد الرحمن', role: 'OPERATOR_ADMIN', oid: 'oid-opadmin-01', companyId: 'op-alwaha' });
    at('#/operator/approvals');
    expect(screen.getByText(ar.tier.srcOwnCo)).toBeTruthy();
    expect(document.body.textContent).toContain('3,000,000');
    // read-only: not one control that would write anything
    expect(document.querySelectorAll('.op-page button, .op-page input, .op-page textarea')).toHaveLength(0);
  });

  it('an operator on the DEFAULT is told that, in the same place and in the same words', () => {
    localStorage.setItem(KEY, JSON.stringify(fresh()));
    saveSession({ name: 'كرار محسن', role: 'OPERATOR_USER', oid: 'oid-opuser-01', companyId: 'op-badra' });
    at('#/operator/approvals');
    expect(screen.getByText(ar.tier.srcDefaultCo)).toBeTruthy();
    expect(document.body.textContent).toContain('10,000,000');
  });
});

/* ═══════ §7-5 و§7-7 — رقمٌ مقروء من الافتراضي لا يُطبع بلا تأهيل ═══════ */

/**
 * The adversarial finding these hold shut: a surface may print a figure the DEFAULT ladder gave it
 * (the role card's «يوافق حتى», the room's donut ceilings) and, by saying nothing more, assert it
 * of every company. Two rules, one component:
 *   · the figure wears «الافتراضي النظامي»;
 *   · the caveat appears IF AND ONLY IF a company is actually measured by something else.
 * The second half is the one worth a test: a caveat that is always there is noise, and a caveat
 * that is never there is the bug. So both poles are asserted — silence at N = 0, and the RIGHT
 * count at N > 0 — on both surfaces, against the same string.
 */
describe('§7-5/§7-7 — the default ceiling is tagged, and caveated only when an exception exists', () => {
  /** the clause with its interpolation filled, so the assertion never restates the sentence */
  const caveat = (n: string) => ar.tier.mayDiffer.replace('{{n}}', n);
  const notes = () => [...document.querySelectorAll('.ad-ladder__note')];

  it('the role card tags its ceiling as the DEFAULT rather than presenting it as the only ladder', () => {
    at('#/admin/users?tab=roles', fresh());
    const card = [...document.querySelectorAll('.acc-rc')].find((el) => el.querySelector('.acc-rc__money'))!;
    expect(card.textContent).toContain(ar.tier.srcDefault);
  });

  it('N = 0 ⇒ NO caveat line anywhere on the role cards — the default is the whole truth', () => {
    at('#/admin/users?tab=roles', fresh());
    expect(notes()).toHaveLength(0);
    expect(document.body.textContent).not.toContain(caveat('0'));
  });

  it('ONE approved ladder ⇒ the line appears with the RIGHT count, on the cards that quote a figure', () => {
    at('#/admin/users?tab=roles', withOwnLadder(fresh(), 'op-alwaha', 1_000_000, 3_000_000));
    expect(notes().length).toBeGreaterThan(0);
    for (const p of notes()) expect(p.textContent).toBe(caveat('1'));
    // exactly the cards that PRINT a ceiling: «لا يوافق» names none, and «يوافق على الكل» is the
    // unbounded top rung, which no override can move
    expect(notes()).toHaveLength(document.querySelectorAll('.acc-rc__money').length);
  });

  it('N = 0 ⇒ the room’s donut carries no caveat either', () => {
    at('#/admin', fresh());
    expect(document.querySelector('.ad-panel--fig .ad-ladder__note')).toBeNull();
  });

  it('the room quotes the SAME clause and the SAME count as the card — one component, not two', () => {
    at('#/admin', withOwnLadder(fresh(), 'op-alwaha', 1_000_000, 3_000_000));
    expect(document.querySelector('.ad-panel--fig .ad-ladder__note')!.textContent).toBe(caveat('1'));
  });

  it('the count is the live registry intersection: a second ladder makes it 2, an orphan entry does not', () => {
    const two = withOwnLadder(withOwnLadder(fresh(), 'op-alwaha', 1_000_000, 3_000_000), 'op-badra', 2_000_000, 4_000_000);
    const withOrphan: State = { ...two, operatorTiers: { ...two.operatorTiers, 'op-gone': { operatorMaxUSD: 1, jmcMaxUSD: 2 } } };
    at('#/admin', withOrphan);
    expect(document.querySelector('.ad-panel--fig .ad-ladder__note')!.textContent).toBe(caveat('2'));
  });
});

/* ═══════════════ §8-12 — the untouched consumers, proven rather than assumed ═══════════════ */

describe('the inherited consumers were right without a line of their own', () => {
  it('the room’s tier counters and the registry’s tier filter both move when a ladder is approved', async () => {
    const { tierCountsOf } = await import('../src/admin/dashboardDerive');
    const { approvalChain } = await import('../src/admin/adminDerive');
    const base = fresh();
    const s = withOwnLadder(base, 'op-alwaha', 1_000_000, 3_000_000);

    // t1 was ط1 (outside the approval chain entirely) and is now ط3 — the chain gained a row
    expect(approvalChain(base).map((r) => r.tender.id)).not.toContain('t1');
    expect(approvalChain(s).map((r) => r.tender.id)).toContain('t1');
    expect(approvalChain(s).find((r) => r.tender.id === 't1')!.tier).toBe('MDOC');

    // and the donut/tile counts followed, without either of them knowing about operatorTiers
    expect(tierCountsOf(base, base.tenders).MDOC + 1).toBe(tierCountsOf(s, s.tenders).MDOC);
    expect(tierCountsOf(base, base.tenders).OPERATOR - 1).toBe(tierCountsOf(s, s.tenders).OPERATOR);
  });
});

/* ═══════════════ i18n parity for this wave ═══════════════ */

describe('every key this wave added exists in BOTH locales', () => {
  it('the three new blocks are complete on both sides', () => {
    for (const block of ['opladder', 'opapprovals'] as const) {
      expect(Object.keys(ar[block]).sort()).toEqual(Object.keys(en[block]).sort());
    }
    for (const k of ['srcDefault', 'srcOwn', 'srcOwnCo', 'srcDefaultCo', 'defaultTagged', 'ownCount', 'ownCountNone', 'mayDiffer', 'ownLink'] as const) {
      expect(typeof ar.tier[k]).toBe('string');
      expect(typeof en.tier[k]).toBe('string');
    }
    // the caveat is a COUNTED sentence on both sides: a locale that dropped `{{n}}` would print a
    // qualification with no scale, which is the vaguer half of the bug it was added to fix
    expect(ar.tier.mayDiffer).toContain('{{n}}');
    expect(en.tier.mayDiffer).toContain('{{n}}');
    expect(typeof ar.onav.approvals).toBe('string');
    expect(typeof en.onav.approvals).toBe('string');
  });

  it('no key in this wave’s blocks is defined without a consumer — `opapprovals.colCount` was one', () => {
    // the screen renders a ladder LIST, not a table, so the column heading never had a caller;
    // a dead string is a promise the product does not keep, and the parity check above cannot see it
    expect('colCount' in ar.opapprovals).toBe(false);
    expect('colCount' in en.opapprovals).toBe(false);
    const src = readFileSync(join(__dirname, '..', 'src', 'operator', 'Approvals.tsx'), 'utf8');
    expect(src).not.toContain('colCount');
  });

  it('the two sentences that claimed ONE ladder for everyone no longer do', () => {
    expect(ar.approvals.explainIntro).not.toContain('سلّم واحد يسري على المشغّلين جميعاً');
    expect(ar.operators.ladderNote).not.toContain('لا سقوف خاصة بمشغّل');
    expect(en.approvals.explainIntro).not.toMatch(/one ladder that applies to all/i);
    expect(en.operators.ladderNote).not.toMatch(/no per-operator ceilings/i);
  });
});
