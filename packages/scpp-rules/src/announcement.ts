import type { RuleCheck, RuleResult } from './types';

/**
 * Pre-publish checks for the announcement & invitations screen.
 * The publish button stays disabled until every check passes —
 * and the API re-runs the same checks on write.
 */

export type AnnouncementMode = 'public' | 'limited' | 'direct';

export interface AnnouncementInput {
  mode: AnnouncementMode;
  /** bid period in calendar days */
  periodDays: number;
  /** distinct newspaper names (public mode) */
  newspapers?: readonly string[];
  publishedOnLcWebsite?: boolean;
  publishedOnRocWebsite?: boolean;
  /** number of invitees (limited / direct modes) */
  inviteeCount?: number;
  /** all invitees are on the pre-qualified list */
  inviteesPreQualified?: boolean;
  /** public tender must NOT impose pre-qualification (11.1) */
  preQualificationRequired?: boolean;
}

const check = (id: string, clause: string, ok: boolean, ar: string, en: string): RuleCheck => ({
  id,
  clause,
  ok,
  ar,
  en,
});

export function checkAnnouncement(input: AnnouncementInput): RuleResult {
  const checks: RuleCheck[] = [];

  if (input.mode === 'public') {
    const papers = (input.newspapers ?? []).map((n) => n.trim()).filter(Boolean);
    const distinct = new Set(papers).size;
    checks.push(
      check(
        'period-21d',
        '11.1',
        input.periodDays >= 21,
        'مدة الإعلان 21 يوماً تقويمياً في الأقل.',
        'Announcement period is at least 21 calendar days.',
      ),
      check(
        'newspapers-3',
        '11.1',
        distinct >= 3,
        'تسمية ثلاث صحف مختلفة في الأقل.',
        'At least 3 distinct newspapers are named.',
      ),
      check(
        'lc-website',
        '11.1',
        input.publishedOnLcWebsite === true,
        'النشر على موقع المقاول الرئيس.',
        'Published on the Lead Contractor website.',
      ),
      check(
        // check id stays 'roc-website' — it is a stable engine key that persisted results and
        // tests address by name; the sentences beside it are what a human reads.
        'roc-website',
        '11.1',
        input.publishedOnRocWebsite === true,
        'النشر على موقع الشركة الأم (نفط الوسط).',
        'Published on the parent company (MDOC) website.',
      ),
      check(
        'no-preq',
        '11.1',
        input.preQualificationRequired !== true,
        'لا يجوز اشتراط التأهيل المسبق في المناقصة العامة.',
        'Public tender must not require pre-qualification.',
      ),
    );
  }

  if (input.mode === 'limited') {
    checks.push(
      check(
        'invitees-2',
        '11.2',
        (input.inviteeCount ?? 0) >= 2,
        'دعوة مقدّمَي عطاء اثنين في الأقل.',
        'At least 2 invitees.',
      ),
      check(
        'invitees-preq',
        '11.2',
        input.inviteesPreQualified === true,
        'جميع المدعوين من قائمة التأهيل المسبق.',
        'All invitees come from the pre-qualified list.',
      ),
    );
  }

  if (input.mode === 'direct') {
    checks.push(
      check(
        'invitees-3',
        '11.4',
        (input.inviteeCount ?? 0) >= 3,
        'دعوة ثلاثة مدعوين في الأقل.',
        'At least 3 invitees.',
      ),
      check(
        'invitees-preq',
        '11.4',
        input.inviteesPreQualified === true,
        'جميع المدعوين مؤهلون مسبقاً.',
        'All invitees are pre-qualified.',
      ),
    );
  }

  return { ok: checks.every((c) => c.ok), checks };
}
