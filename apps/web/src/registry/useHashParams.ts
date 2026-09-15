import { METHODS, type LocalContentScope } from '@masaar/scpp-rules';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ACCESS_TABS } from '../admin/access';
import { API_ROLES } from '../session';
import type { ContractStageKey } from '../store';

/**
 * Registry layer — the URL contract every clickable statistic lands through
 * (ops/VISUAL-REFRESH-SPEC.md §5-ج).
 *
 * THE BUG THIS EXISTS TO KILL: `Fields.tsx` read `?op=` with `useState(opParam())` — once, at
 * mount. A link that changes only the query string changes the hash without remounting the
 * screen, so the filter never moved. Every KPI tile, chart row, donut legend entry and
 * histogram column in this wave lands on a registry that is often the screen the reader is
 * already on, which turns that latent defect into a daily one. The fix is a hook: the params
 * are STATE, re-read on every `hashchange`.
 *
 * The router needs no change — `App.tsx` already matches `^#\/admin\/(\w+)(?:\?.*)?$`.
 */

function read(): URLSearchParams {
  const q = window.location.hash.split('?')[1];
  return new URLSearchParams(q ?? '');
}

/** The query string of the current hash, re-synced on every `hashchange`. */
export function useHashParams(): URLSearchParams {
  const [p, setP] = useState(read);
  useEffect(() => {
    const on = () => setP(read());
    window.addEventListener('hashchange', on);
    // the hash can also move between render and effect-attach (a link clicked during mount)
    setP(read());
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return p;
}

/* ---------------- the whitelist ---------------- */

/**
 * The accepted parameter names (§5-ج). A name outside this set is not read at all, and a value
 * outside its set is IGNORED — silently, with the full registry shown. A tampered or stale link
 * must never produce an error screen or an empty one: «nothing matches» and «nothing exists» are
 * different sentences, and only one of them is true.
 *
 * PHASE 4 (client request 7) added seven names, and each one is a DELIBERATE extension rather than
 * an ad-hoc read — every registry filter now travels in the address, which is what lets the export
 * stamp (`reportStamp`) describe the file it is writing:
 *   · `method` — the SCPP procurement path, a closed vocabulary (METHODS ids);
 *   · `scope`  — the §9 work scope, the four members of `LocalContentScope`;
 *   · `vmin` / `vmax` — an inclusive USD window on the row's value (estimated / contract);
 *   · `from` / `to`   — an inclusive ISO window on the row's own date (createdOn / signedOn);
 *   · `arch`   — which side of the archive (ق7) the registry is showing.
 * The two RANGE pairs are the only names with no closed vocabulary: they are validated by SHAPE
 * (a plain amount, a real calendar date) so a malformed link still narrows nothing.
 */
export type HashParamName =
  | 'op' | 'tier' | 'status' | 'prog' | 'pending' | 'stage' | 'field'
  | 'method' | 'scope' | 'vmin' | 'vmax' | 'from' | 'to' | 'arch'
  // د12 / س‌ل2 — the SETTLED half of the approval chain's one decision dimension. `pending` already
  // held the other half (and every follow-up-room tile links through it), so this name carries only
  // the two decisions that were actually taken. They are one dimension, not two: a writer sets one
  // and clears the other in a single `setMany`, which is why `?dec=ratified&pending=1` — a window
  // onto rows that cannot exist — is never written by any control on the screen.
  | 'dec'
  // PHASE 5 (client request 20): `tab` is the address contract of a section that holds several
  // views of ONE subject («الوصول والأدوار»). It goes through the same door as every other
  // parameter — a closed vocabulary, validated on read — so a stale or hand-typed tab lands on
  // the section's default view rather than on a blank one.
  | 'tab'
  // `role` narrows the ACCOUNTS register to one role's holders. It exists because the role cards
  // ask «who holds this today» and the answer is a list of people, which lives on the register —
  // so the card links there rather than growing a second, thinner copy of it. The chip row that
  // already sets this filter now writes the address too, so the two can never disagree.
  | 'role';

/** The four completion buckets, cut once (§3-د) — the histogram and the registry share them. */
export const PROGRESS_BUCKETS = ['0-25', '25-50', '50-75', '75-100'] as const;
export type ProgressBucket = (typeof PROGRESS_BUCKETS)[number];

/**
 * Contract stage keys as a runtime list. The TYPE is imported so a future stage added to the
 * union fails this file at compile time instead of silently dropping out of the whitelist —
 * a type-only import, so the registry layer takes on no runtime dependency on the store.
 */
const CONTRACT_STAGE_KEYS: readonly ContractStageKey[] = [
  'sign', 'bonds', 'mobilize', 'execute', 'provisional', 'warranty', 'final',
];

/**
 * `status=open` is an addition to the spec's four-value set, and it is here for an honesty
 * reason: the follow-up room's «المناقصات المفتوحة» tile counts every tender that still has an
 * open stage, which is progress + risk + delayed together. Landing it on `?status=progress`
 * (as §5-ب suggests) would show a registry SMALLER than the number the reader just clicked.
 * The tile and its destination must count the same rows, so the vocabulary gained the word the
 * tile actually means.
 */
/** The §9 work scopes as a runtime list, typed so a new member of the union fails compilation here. */
export const SCOPE_KEYS: readonly LocalContentScope[] = [
  'DRILLING', 'ENGINEERING_CONSTRUCTION', 'HEAVY_MATERIALS', 'OTHER',
];

/**
 * Which side of the archive (ق7) a registry is showing. `live` and `archived` are both real
 * narrowings — `all` is the widening — so a screen defaulting to `live` still has something
 * true to stamp on its export.
 */
export const ARCHIVE_VIEWS = ['live', 'archived', 'all'] as const;
export type ArchiveView = (typeof ARCHIVE_VIEWS)[number];

const FIXED: Partial<Record<HashParamName, readonly string[]>> = {
  tier: ['OPERATOR', 'JMC', 'MDOC'],
  // the section owns its own tab vocabulary (admin/access.ts ACCESS_TABS) — imported rather than
  // restated, so adding a view cannot leave the address contract one name behind
  tab: ACCESS_TABS,
  // the role universe itself, plus the register's one synthetic bucket. `API_ROLES` is imported
  // for the same reason `ACCESS_TABS` is: an eighth role must not be linkable from a card and
  // silently unfilterable at the register.
  role: [...API_ROLES, 'disabled'],
  status: ['open', 'progress', 'risk', 'delayed', 'done'],
  prog: PROGRESS_BUCKETS,
  pending: ['1'],
  // the two SETTLED members of `ApprovalDecision`. `pending` is deliberately absent — it is the
  // `?pending=1` gate, one concept with one name. `cancelled`/`suspended` are lifecycle states,
  // not decisions of an approving body, and the chain shows them without offering them as chips.
  dec: ['ratified', 'returned'],
  stage: CONTRACT_STAGE_KEYS,
  scope: SCOPE_KEYS,
  arch: ARCHIVE_VIEWS,
  // the paths are numbered by the spec, so the vocabulary is the registry of methods itself —
  // an id outside it would filter every row away, which is the empty screen this file exists to prevent
  method: METHODS.map((m) => String(m.id)),
};

/** A plain, non-negative amount — grouping separators and signs are not part of a URL contract. */
const AMOUNT_RE = /^\d{1,15}(?:\.\d{1,2})?$/;
export function isAmountParam(raw: string): boolean {
  return AMOUNT_RE.test(raw) && Number.isFinite(Number(raw));
}

/**
 * A REAL calendar date in ISO form. The shape test alone would accept `2026-02-31`; round-tripping
 * through `Date` is what rejects it, so a date window can never be opened on a day that does not
 * exist (and `2026-13-01` cannot silently become January 2027).
 */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export function isIsoDateParam(raw: string): boolean {
  if (!ISO_DATE_RE.test(raw)) return false;
  const d = new Date(`${raw}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === raw;
}

/** The names validated by SHAPE rather than by membership — the two range pairs. */
const VALIDATE: Partial<Record<HashParamName, (raw: string) => boolean>> = {
  vmin: isAmountParam,
  vmax: isAmountParam,
  from: isIsoDateParam,
  to: isIsoDateParam,
};

/**
 * One validated parameter, or `''` when it is absent or unacceptable.
 *
 * Three kinds of name, one door:
 *   · SHAPE-validated (`vmin`/`vmax`/`from`/`to`) — an amount or a real ISO date;
 *   · closed vocabulary (`tier`, `status`, `prog`, `pending`, `stage`, `scope`, `arch`, `method`);
 *   · record IDs (`op`, `field`) — their allowed set is the live store, so the caller passes it
 *     (`allowed`). Without a set they resolve to `''`: an id we cannot vouch for filters nothing,
 *     which is the same fail-open reading every other name gets.
 */
export function hashParam(p: URLSearchParams, name: HashParamName, allowed?: readonly string[]): string {
  const raw = p.get(name);
  if (!raw) return '';
  const shape = VALIDATE[name];
  if (shape) return shape(raw) ? raw : '';
  const set = FIXED[name] ?? allowed;
  if (!set) return '';
  return set.includes(raw) ? raw : '';
}

/**
 * Would `hashParam` accept `raw` for `name`? The WRITE-side half of the same contract.
 *
 * Record ids (`op`, `field`) have no static vocabulary — their allowed set is the live store,
 * which a module-level writer cannot see — so they pass here and are still refused on READ by
 * `hashParam` when the store does not know them. Every other name is checked against exactly the
 * set or shape the reader will check it against.
 */
export function isValidParamValue(name: HashParamName, raw: string): boolean {
  const shape = VALIDATE[name];
  if (shape) return shape(raw);
  const set = FIXED[name];
  return set ? set.includes(raw) : true;
}

/**
 * Rewrite ONE parameter on the current hash, keeping the path and every other parameter.
 * `null`/`''` removes it. This is what a removable filter chip calls, so the address bar never
 * disagrees with the screen and stays shareable (§5-ج).
 *
 * VALIDATES FIRST (phase-4 fix), and returns whether it wrote. A value of a shape the reader will
 * reject used to be written anyway: `?vmin=notanumber` reached the address bar, `hashParam` then
 * ignored it, and the screen showed an unnarrowed registry under an address that claimed a filter
 * — a link a reader could copy and send, promising a narrowing nobody would ever see. Refusing the
 * write keeps the address describing only narrowings that exist. The caller is responsible for
 * saying WHY it refused (`RangeFilter` prints «قيمة غير صالحة» on the end that holds the value);
 * a silent no-op and a silent wipe are both worse than the address simply not moving.
 */
export function writeHashParam(name: HashParamName, value: string | null): boolean {
  const one: Partial<Record<HashParamName, string | null>> = { [name]: value };
  return writeHashParams(one);
}

/**
 * The same act over SEVERAL dimensions at once, in ONE address rewrite.
 *
 * A counting tile is the reason it exists (ق2): «متأخرة» must land a registry holding exactly the
 * rows it counted, which means setting `status` AND dropping `pending` — two writes would push two
 * history entries, so one Back would leave the reader on a half-applied filter that no tile ever
 * offered. It is also the ONE implementation: `writeHashParam` is now a one-name call into it.
 *
 * Validation is ALL-OR-NOTHING, for the same reason the single write refuses: a patch that would
 * put a value the reader will ignore into the address writes nothing at all, rather than half of
 * an intent.
 */
export function writeHashParams(patch: Partial<Record<HashParamName, string | null>>): boolean {
  const entries = Object.entries(patch) as [HashParamName, string | null][];
  if (entries.some(([name, value]) => Boolean(value) && !isValidParamValue(name, value as string))) return false;
  const hash = window.location.hash;
  const cut = hash.indexOf('?');
  const path = cut === -1 ? hash : hash.slice(0, cut);
  const p = new URLSearchParams(cut === -1 ? '' : hash.slice(cut + 1));
  for (const [name, value] of entries) {
    if (value) p.set(name, value); else p.delete(name);
  }
  const q = p.toString();
  window.location.hash = q ? `${path}?${q}` : path;
  return true;
}

/**
 * Replace the WHOLE query string, keeping the path — what «أزل كل المرشّحات» does. Extracted
 * because five registries were each slicing the hash by hand at the `?`, and a screen that forgets
 * to do it re-seeds from the address the filters it just cleared (the defect §5-ج names). One
 * write, so nine dismissed filters cost one history entry rather than nine.
 *
 * `keep` re-states the few parameters a reset is not meant to drop — a registry whose default view
 * is itself a narrowing (Fields: `arch=live`) resets to the WIDEST view, not to its default, or
 * «أزل كل المرشّحات» would leave an all-archived registry still reading as empty.
 */
export function clearHashParams(keep?: Partial<Record<HashParamName, string>>): void {
  const h = window.location.hash;
  const cut = h.indexOf('?');
  const path = cut === -1 ? h : h.slice(0, cut);
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(keep ?? {})) if (v) p.set(k, v);
  const q = p.toString();
  window.location.hash = q ? `${path}?${q}` : path;
}

/* ---------------- the toolbar contract (phase 4) ---------------- */

export interface FilterParams {
  /** the current, VALIDATED value of one dimension — `''` when absent or unacceptable */
  get: (name: HashParamName, allowed?: readonly string[]) => string;
  /** set (or clear, with `''`) one dimension: the screen answers at once, the address follows.
   *  Returns false — and moves NEITHER — when the value is one the reader would reject. */
  set: (name: HashParamName, value: string) => boolean;
  /** set several dimensions in ONE act — one history entry, so a counting tile can set the
   *  narrowing it counted AND drop the one it did not, without leaving a half-state behind Back. */
  setMany: (patch: Partial<Record<HashParamName, string>>) => boolean;
  /** drop every dimension in ONE act — one address rewrite, so nothing re-seeds from a stale hash.
   *  `keep` re-states the few a reset must not drop (see `clearHashParams`). */
  clear: (keep?: Partial<Record<HashParamName, string>>) => void;
}

/**
 * The toolbar's single reader/writer of the address (client request 7).
 *
 * Request 7 took the four registries from two or three filters to nine, and mirroring each one
 * into its own `useState` + `useEffect` pair (the phase-3 shape) would have meant nine mirrors per
 * screen and nine address rewrites — nine history entries — behind «أزل كل المرشّحات». One mirror
 * holds them all instead:
 *
 *   · the ADDRESS is the source of truth whenever it moves (a KPI tile, a chart row, Back);
 *   · a control moves the mirror FIRST so the table answers the click in the same frame, and
 *     rewrites the address after — `hashchange` is asynchronous, and a purely address-driven
 *     select would visibly lag its own click;
 *   · `clear` empties both at once.
 *
 * Validation still runs through `hashParam`, so a tampered value narrows nothing here too.
 */
export function useFilterParams(): FilterParams {
  const urlParams = useHashParams();
  const key = urlParams.toString();
  const [local, setLocal] = useState(() => new URLSearchParams(key));
  useEffect(() => { setLocal(new URLSearchParams(key)); }, [key]);

  const get = useCallback(
    (name: HashParamName, allowed?: readonly string[]) => hashParam(local, name, allowed),
    [local],
  );
  const setMany = useCallback((patch: Partial<Record<HashParamName, string>>) => {
    const entries = Object.entries(patch) as [HashParamName, string][];
    // the mirror and the address move together or not at all — a mirror holding a value the
    // address refused is the same disagreement this hook exists to prevent
    if (entries.some(([name, value]) => Boolean(value) && !isValidParamValue(name, value))) return false;
    setLocal((prev) => {
      const next = new URLSearchParams(prev.toString());
      for (const [name, value] of entries) {
        if (value) next.set(name, value); else next.delete(name);
      }
      return next;
    });
    const wire: Partial<Record<HashParamName, string | null>> = {};
    for (const [name, value] of entries) wire[name] = value || null;
    writeHashParams(wire);
    return true;
  }, []);
  /** ONE dimension — the same act, named for the overwhelmingly common case. */
  const set = useCallback(
    (name: HashParamName, value: string) => {
      const one: Partial<Record<HashParamName, string>> = { [name]: value };
      return setMany(one);
    },
    [setMany],
  );
  const clear = useCallback((keep?: Partial<Record<HashParamName, string>>) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(keep ?? {})) if (v) next.set(k, v);
    setLocal(next);
    clearHashParams(keep);
  }, []);

  return useMemo(() => ({ get, set, setMany, clear }), [get, set, setMany, clear]);
}
