import { isPriceVisible, type EvaluationStep } from '@masaar/scpp-rules';
import type { AuthUser, Role } from '../auth/auth.types.js';

/**
 * Fairness redaction (SCPP 12.4.2 / rule #9) — the single server-side gate that
 * decides what bidder data leaves the API. Pure and testable; applied to every
 * tender the service returns so masking is structural, not presentational.
 *
 *  - Price: emitted only when isPriceVisible(step, bidder). An excluded bidder's
 *    price is NEVER on the wire, for any role, pre- or post-award.
 *  - Identity: hidden from MDOC/auditor until the award stage; operators (own
 *    tender) and evaluation committees run the process so they see real names.
 */

const EVAL_STEPS: readonly EvaluationStep[] = ['technical-opening', 'technical-analysis', 'commercial-opening', 'commercial-analysis'];

/** Roles that legitimately see bidder identities before award (they conduct 12.4 evaluation). */
export const IDENTITY_ROLES_PREAWARD: readonly Role[] = ['SUPER_ADMIN', 'OPERATOR_ADMIN', 'OPERATOR_USER', 'EVALUATION'];

interface PresentableBidder {
  id: string;
  name?: string;
  vendorId?: string | null;
  technicalResult?: string | null;
  priceUSD?: unknown;
  [k: string]: unknown;
}
interface PresentableStage {
  key: string;
  order: number;
  actualTo?: Date | string | null;
}
export interface PresentableTender {
  evaluationStep?: number;
  stages?: PresentableStage[];
  bidders?: PresentableBidder[];
  ratification?: { status?: string } | null;
  [k: string]: unknown;
}

/** Award reached (or imminent): identities may be disclosed to reviewers/auditors. */
function isAwardState(t: PresentableTender): boolean {
  if (t.ratification?.status === 'RATIFIED') return true;
  const stages = [...(t.stages ?? [])].sort((a, b) => a.order - b.order);
  const current = stages.find((s) => !s.actualTo);
  if (!current) return true; // every stage closed
  return current.key === 'ratify' || current.key === 'sign';
}

export function presentTender<T extends PresentableTender>(tender: T, user: AuthUser): T {
  const bidders = tender.bidders;
  if (!bidders || bidders.length === 0) return tender;

  const step = EVAL_STEPS[Math.min(Math.max(tender.evaluationStep ?? 0, 0), 3)]!;
  const maskIdentity = !IDENTITY_ROLES_PREAWARD.includes(user.role) && !isAwardState(tender);
  // stable label index — sort by id so "مقدّم عطاء N" never reshuffles between fetches
  const labelIndex = new Map([...bidders].sort((a, b) => a.id.localeCompare(b.id)).map((b, i) => [b.id, i + 1] as const));

  const presentedBidders = bidders.map((b) => {
    const technicalResult = typeof b.technicalResult === 'string' ? (b.technicalResult.toLowerCase() as 'pass' | 'fail') : undefined;
    const out: PresentableBidder = { ...b };
    if (!isPriceVisible(step, { technicalResult })) out.priceUSD = null;
    if (maskIdentity) {
      out.name = `مقدّم عطاء ${labelIndex.get(b.id)}`;
      out.vendorId = null;
    }
    return out;
  });

  return { ...tender, bidders: presentedBidders } as T;
}
