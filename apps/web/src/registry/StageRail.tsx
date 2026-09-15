import { stageByKey } from '@masaar/scpp-rules';
import { useTranslation } from 'react-i18next';
import { stageLabel } from '../admin/contractDerive';
import { fmtCount, railStageStatus, type RailStage } from '../operator/derive';
import { currentStage, type ContractState, type Tender } from '../store';

/**
 * د4 — the stage rail, written ONCE and worn by four surfaces: the operator registry row, the
 * admin registry row (ق4), the preview drawer and — since د13-ع1 — the contract registry row,
 * whose post-award lifecycle is a different stage set read by the same rules. It is the same shape of problem د2 answered for
 * the search keyboard and د3 for the collapsed sidebar — two registries about to grow one copy
 * each of the same rail, and then to disagree about it. The dress lives once in `operator.css`,
 * beside the `.op-segs` primitive this merges onto (the sheet that already owns the unified
 * `.op-side, .ad-side` rule and is loaded by both shells).
 *
 * THE STRUCTURAL RULE (معرض-20): the slots ARE `tender.stages`. There is no 7, no 11 and no 12
 * written anywhere here — the reference prototype prints a fixed rail and calls the fourth box
 * «الحالية», which is a lie the moment a request runs on a method with a different stage set. One
 * slot per real stage, and the index is the position of the stage `currentStage` actually returns.
 *
 * THE COLOUR RULE (معرض-21 · س7): the current slot is said by SIZE and a RING, never by red.
 * `stageViewStatus` is the only source of a slot's tone, and it returns `delayed` for exactly one
 * condition — a planned end that passed with no `actualTo`. So `--status-delayed` reaches the rail
 * on real lateness and on nothing else; a running stage is `--status-progress` however loudly the
 * reference sheet paints it.
 */

type Lang = 'ar' | 'en';
type Size = 'mini' | 'wide';

/**
 * د13-ع1 — the rail's BODY, extracted so the contract registry wears the very component the two
 * tender registries wear rather than a seventh copy of eleven boxes. What differed between the two
 * lifecycles was never the dress or the rules above: it is the name table (`stageByKey` ✕
 * `CONTRACT_STAGES`) and the sentence a pointer hears. Both are arguments, so both become
 * arguments — and `.op-segs` keeps exactly one definition, one colour rule and one guard.
 */
function Rail({
  slots,
  idx,
  total,
  lang,
  label,
  size,
  decorative,
}: {
  slots: { key: string; tone: string; name: string }[];
  idx: number;
  total: number;
  lang: Lang;
  label: string;
  size: Size;
  decorative: boolean;
}) {
  return (
    <span className="op-railwrap">
      <span
        className={`op-segs${size === 'mini' ? ' op-segs--mini' : ''}`}
        role={decorative ? undefined : 'img'}
        aria-hidden={decorative ? true : undefined}
        aria-label={decorative ? undefined : label}
      >
        {slots.map((s) => {
          // م1 — every slot names itself to a pointer. A colour with no name is a colour that
          // means nothing to the reader who cannot count boxes.
          const now = s.tone === 'progress' || s.tone === 'delayed';
          return <span key={s.key} className={`op-seg op-seg--${s.tone}${now ? ' op-seg--now' : ''}`} title={s.name} />;
        })}
      </span>
      {size === 'mini' && (
        <span className="op-segs__n" aria-hidden="true">
          {fmtCount(idx, lang)}/{fmtCount(total, lang)}
        </span>
      )}
    </span>
  );
}

/** Slots + position for any lifecycle whose stages carry `{ key, plannedTo?, actualTo? }`. */
function railOf(stages: RailStage[], today: string, nameOf: (key: string) => string) {
  return {
    slots: stages.map((s) => ({ key: s.key, tone: railStageStatus(stages, s, today), name: nameOf(s.key) })),
    // 1-based position of the stage that is actually open; a finished record has no open stage and
    // reads at the end of its OWN rail rather than at a hard-coded number.
    open: stages.find((s) => !s.actualTo),
  };
}

export function StageRail({
  tender,
  today,
  lang,
  size = 'mini',
  decorative = false,
}: {
  tender: Tender;
  today: string;
  lang: Lang;
  /** `mini` = the fixed-slot rail a registry row carries, with its `N/M`; `wide` = the drawer's
   *  full-width band, which sits under a label that already names what it is. */
  size?: 'mini' | 'wide';
  /**
   * `true` where the row ALREADY states the stage in words next to the rail and a second reading
   * would be noise — the admin registry (ق4), whose text stage column stays the readable name.
   * `false` exposes the rail as one image with a label carrying the position, which no other cell
   * of the operator row says.
   */
  decorative?: boolean;
}) {
  const { t } = useTranslation();
  const stages = tender.stages;
  const total = stages.length;
  // a request with no stages recorded gets no rail at all rather than an empty frame implying zero
  // progress through a path it was never put on
  if (total === 0) return null;
  const { slots } = railOf(stages, today, (k) => stageByKey(k)?.[lang] ?? k);
  const cur = currentStage(tender);
  const idx = cur ? stages.findIndex((s) => s.key === cur.key) + 1 : total;
  const curName = cur ? stageByKey(cur.key)?.[lang] ?? cur.key : '';
  const label = cur
    ? t('tenders.railAria', { n: fmtCount(idx, lang), total: fmtCount(total, lang), stage: curName })
    : t('tenders.railDone', { total: fmtCount(total, lang) });

  return <Rail slots={slots} idx={idx} total={total} lang={lang} label={label} size={size} decorative={decorative} />;
}

/**
 * ع1 — the same rail over the post-award lifecycle. It is always decorative and always mini: the
 * contracts row already prints the stage NAME on the line above it (exactly the ق4 arrangement),
 * so the shape is the second reading of a fact the row states in words, and `N/M` is the position
 * that no other cell of that row carries.
 *
 * There is no 7 written here either. The slots are `c.stages`, so a contract whose recorded
 * lifecycle is shorter (or longer) than the seeded seven draws its own path — the same structural
 * rule (معرض-20) the tender rail is guarded by, and the same guard proves it.
 */
export function ContractStageRail({ contract, today, lang }: { contract: ContractState; today: string; lang: Lang }) {
  const stages = contract.stages;
  const total = stages.length;
  if (total === 0) return null;
  const { slots, open } = railOf(stages, today, (k) => stageLabel(k as ContractState['stages'][number]['key'], lang));
  const idx = open ? stages.findIndex((s) => s.key === open.key) + 1 : total;
  return <Rail slots={slots} idx={idx} total={total} lang={lang} label="" size="mini" decorative />;
}
