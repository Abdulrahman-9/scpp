import type { Method, MethodKey } from './types';

/**
 * The eight canonical contracting methods (SCPP §11).
 * Arabic/English names ported verbatim from the approved design handoff (Paths.jsx).
 * Framework Agreements (11.6) are a contract tool layered on top — not a 9th method.
 */
export const METHODS: readonly Method[] = [
  { id: 1, key: 'sole', scpp: '11.5', ar: 'المصدر الوحيد', en: 'Single / Sole Source' },
  { id: 2, key: 'low-value', scpp: '11.8.3', ar: 'عملية الشراء منخفضة القيمة', en: 'Low-Value Purchase' },
  { id: 3, key: 'fast-track', scpp: '11.7', ar: 'المسار السريع', en: 'Fast Track' },
  { id: 4, key: 'direct', scpp: '11.4', ar: 'الدعوة المباشرة', en: 'Direct Invitation' },
  { id: 5, key: 'rfp', scpp: '11.8.1', ar: 'استدراج عروض من (3) موردين', en: 'Request for Proposal (RFP)' },
  { id: 6, key: 'limited', scpp: '11.2', ar: 'المناقصة المحدودة', en: 'Limited Tender' },
  { id: 7, key: 'public', scpp: '11.1', ar: 'المناقصة العامة', en: 'Public Tender' },
  { id: 8, key: 'two-phased', scpp: '11.3', ar: 'المناقصة بمرحلتين', en: 'Two-Phased Tender' },
] as const;

export function methodByKey(key: MethodKey): Method {
  const m = METHODS.find((x) => x.key === key);
  if (!m) throw new Error(`Unknown method: ${key}`);
  return m;
}

/** The 7 exclusive justified cases (a–g) for Single/Sole Source (11.5). */
export type SoleSourceCase = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g';

export const LOW_VALUE_LIMIT_USD = 10_000; // 11.8.3
export const RFP_UPPER_LIMIT_USD = 100_000; // 11.8.1

export interface RoutingInput {
  estimatedValueUSD: number;
  /** present ⇒ one of the 7 exclusive cases applies (11.5) */
  soleSourceCase?: SoleSourceCase;
  /** bidders technically qualified ≤ 12 months ago on similar scope (11.7) */
  hasRecentQualifiedBidders?: boolean;
  /** specialized works or emergency (11.4) */
  specializedOrEmergency?: boolean;
  /** complex technical scope where specs settle in phase 1 (11.3) */
  technicallyComplex?: boolean;
  /** a maintained pre-qualified vendor list exists (11.2) */
  hasPreQualifiedList?: boolean;
}

export interface RoutingSuggestion {
  method: Method;
  reasonAr: string;
  reasonEn: string;
}

/**
 * Auto-suggest one of the 8 methods from the request facts (new-request screen).
 * The operator may override with a recorded justification.
 */
export function suggestMethod(input: RoutingInput): RoutingSuggestion {
  const v = input.estimatedValueUSD;
  if (v < 0 || !Number.isFinite(v)) throw new Error('estimatedValueUSD must be a finite, non-negative number');

  if (input.soleSourceCase) {
    return {
      method: methodByKey('sole'),
      reasonAr: `تنطبق الحالة الحصرية (${input.soleSourceCase}) من حالات المصدر الوحيد السبع (11.5).`,
      reasonEn: `Exclusive justified case (${input.soleSourceCase}) of the seven sole-source cases applies (11.5).`,
    };
  }
  if (v < LOW_VALUE_LIMIT_USD) {
    return {
      method: methodByKey('low-value'),
      reasonAr: 'القيمة المخمّنة أقل من 10,000$ — شراء منخفض القيمة بلا مسار تنافسي (11.8.3).',
      reasonEn: 'Estimated value below $10,000 — low-value purchase, no competitive method required (11.8.3).',
    };
  }
  if (v <= RFP_UPPER_LIMIT_USD) {
    return {
      method: methodByKey('rfp'),
      reasonAr: 'القيمة بين 10,000$ و100,000$ — استدراج عروض من ثلاثة موردين في الأقل (11.8.1).',
      reasonEn: 'Value between $10,000 and $100,000 — request proposals from at least 3 suppliers (11.8.1).',
    };
  }
  if (input.hasRecentQualifiedBidders) {
    return {
      method: methodByKey('fast-track'),
      reasonAr: 'يوجد مؤهلون فنياً خلال الأشهر الـ12 الماضية بنطاق مماثل — عروض تجارية فقط (11.7).',
      reasonEn: 'Bidders technically qualified within the last 12 months on similar scope — commercial bids only (11.7).',
    };
  }
  if (input.specializedOrEmergency) {
    return {
      method: methodByKey('direct'),
      reasonAr: 'أعمال تخصصية أو حالة طارئة — دعوة مباشرة لثلاثة مدعوين مؤهلين في الأقل (11.4).',
      reasonEn: 'Specialized works or emergency — direct invitation to at least 3 pre-qualified invitees (11.4).',
    };
  }
  if (input.technicallyComplex) {
    return {
      method: methodByKey('two-phased'),
      reasonAr: 'نطاق فني معقّد تُحسم مواصفاته بمرحلة أولى — مناقصة بمرحلتين (11.3).',
      reasonEn: 'Technically complex scope settled in a first phase — two-phased tender (11.3).',
    };
  }
  if (input.hasPreQualifiedList) {
    return {
      method: methodByKey('limited'),
      reasonAr: 'قائمة تأهيل مسبق متاحة — مناقصة محدودة بمدعوين اثنين في الأقل (11.2).',
      reasonEn: 'A pre-qualified list exists — limited tender with at least 2 invitees (11.2).',
    };
  }
  return {
    method: methodByKey('public'),
    reasonAr: 'الأصل العام: مناقصة عامة — 3 صحف وموقعا المقاول وMDOC و21 يوماً في الأقل وبلا تأهيل مسبق (11.1).',
    reasonEn: 'Default: public tender — 3 newspapers, LC & MDOC websites, ≥ 21 days, no pre-qualification (11.1).',
  };
}

/** Minimum participants/invitees per method (0 = not applicable). */
export function minParticipants(key: MethodKey): number {
  switch (key) {
    case 'direct':
      return 3; // 11.4
    case 'rfp':
      return 3; // 11.8.1
    case 'limited':
      return 2; // 11.2
    case 'two-phased':
      return 2; // 11.3 — phase 2 invites the ≥2 technically qualified
    default:
      return 0;
  }
}

export interface PurchaseRequestLite {
  id: string;
  budgetCode: string;
  estimatedValueUSD: number;
  /** ISO date the request was raised */
  raisedOn: string;
}

export interface SplitRiskGroup {
  budgetCode: string;
  requestIds: string[];
  combinedValueUSD: number;
  clause: '7.2';
}

/**
 * Splitting requisitions to dodge Financial Authority is prohibited (7.2).
 * Flags groups of requests under the same budget code, raised within
 * `windowDays` of each other, where each sits below the FA threshold but
 * the combined value crosses it.
 */
export function detectSplitRisk(
  requests: readonly PurchaseRequestLite[],
  financialAuthorityUSD: number,
  windowDays = 90,
): SplitRiskGroup[] {
  const byCode = new Map<string, PurchaseRequestLite[]>();
  for (const r of requests) {
    if (r.estimatedValueUSD >= financialAuthorityUSD) continue; // not a split candidate
    const list = byCode.get(r.budgetCode) ?? [];
    list.push(r);
    byCode.set(r.budgetCode, list);
  }

  const groups: SplitRiskGroup[] = [];
  const DAY_MS = 86_400_000;
  for (const [budgetCode, list] of byCode) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => a.raisedOn.localeCompare(b.raisedOn));
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    const span = (Date.parse(last.raisedOn) - Date.parse(first.raisedOn)) / DAY_MS;
    if (span > windowDays) continue;
    const combined = sorted.reduce((s, r) => s + r.estimatedValueUSD, 0);
    if (combined >= financialAuthorityUSD) {
      groups.push({
        budgetCode,
        requestIds: sorted.map((r) => r.id),
        combinedValueUSD: combined,
        clause: '7.2',
      });
    }
  }
  return groups;
}
