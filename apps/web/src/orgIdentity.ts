import { serviceContractEffective } from '@masaar/scpp-rules';
import { loadSession } from './session';
import { sessionScopeCompanyId, type OperatorOrg, type State, type UserAccount } from './store';

/**
 * Who the signed-in operator actually works for — resolved from the registries, never named
 * by a literal. The shell chrome and the printed reports all read this one function, so the
 * company on a printed A4 report is the same record the sidebar shows.
 *
 * Every field is optional on purpose: an identity that cannot be resolved is OMITTED at the
 * call site, because a plausible-looking company name is exactly the fabrication this replaces.
 */
export interface SessionOrg {
  /** the resolved operating company (display name in the active language) */
  name?: string;
  /** reference chip for the company's Service Contract: '<code> · <signed>–<expiry>' (§7.1) */
  contractRef?: string;
}

/**
 * Resolution chain, most authoritative first:
 *   1. session.oid → the account in `state.users` → its `operatorId` → `state.operators`.
 *      This is the registry truth: the operator scope an admin actually granted the account.
 *   2. session.companyId → `state.operators` — same registry, keyed by the scope the session
 *      itself carries (used when the account list is not readable, e.g. a non-SUPER_ADMIN in
 *      API mode, where `/users` 403s and `state.users` is empty by design).
 *   3. session.company — the scope label the session was minted with. Still session data, not
 *      an invented name; it is Arabic-only, so the registry above is always preferred.
 * Nothing resolves → `{}`, and the chrome drops the row entirely.
 */
export function resolveSessionOrg(state: State, lang: 'ar' | 'en'): SessionOrg {
  const session = loadSession();
  if (!session) return {};

  const account = state.users.find((u) => u.azureOid === session.oid);
  const operatorId = account?.operatorId ?? session.companyId;
  const name = operatorName(state, operatorId, lang) ?? session.company;
  return { ...(name ? { name } : {}), ...(operatorId ? contractRefOf(state, operatorId) : {}) };
}

/**
 * د15-م3 — the SUBJECT of «تُعرض طلبيات {الشركة} فقط», or `undefined` where there is no such claim
 * to make.
 *
 * Two gates, and both have to hold. The first is `sessionScopeCompanyId()` — the one condition
 * `sessionScopedTenders` filters by — so the sentence appears exactly on the sessions whose lists
 * are actually narrowed: a platform session in local mode reads every company, and printing the
 * sentence there would be a false claim about the rows on screen (§6, لا ادعاء كاذب). The second
 * is the registry: a company it cannot name is not named, and the caller drops the line rather
 * than saying «طلبيات شركتك» to a reader who cannot tell which.
 *
 * NOTE the resolver it does NOT use. `resolveSessionOrg` answers a different question — «who does
 * this PERSON work for» — and prefers the account's `operatorId` over the session's `companyId`,
 * which is the right precedence for the chrome and for a printed report's letterhead. But the
 * list on screen was filtered by `companyId`, so a sentence built on the account's answer could
 * name one company over another company's rows the moment the two disagree. The claim is about
 * THE ROWS, so it is built from the id that produced them, and the fallback is the session's own
 * scope label rather than a registry lookup that never applied.
 *
 * Both operator surfaces read this, so the register and the inbox can never disagree about whose
 * work they are showing.
 */
export function sessionScopeOrgName(state: State, lang: 'ar' | 'en'): string | undefined {
  const companyId = sessionScopeCompanyId();
  if (!companyId) return undefined;
  return operatorName(state, companyId, lang) ?? loadSession()?.company;
}

/**
 * An operating company RECORD's display name in the active language.
 *
 * The English fallback is the Arabic name, never the record id: `nameEn` is optional on
 * `OperatorOrg`, and a company registered without one must read «شركة نفط الواحة الصينية» to an
 * English reader, not «op-alwaha». An id in a sentence is a leaked primary key — it names nothing
 * the reader can act on and reads as a defect. This is the one resolver every surface calls.
 */
export function orgName(o: OperatorOrg, lang: 'ar' | 'en'): string {
  return lang === 'ar' ? o.name : o.nameEn ?? o.name;
}

/** An operating company's display name straight from the registry — undefined when unknown.
 *  Used where the company is a property of the RECORD (a tender's operator) rather than of
 *  the session, so a document names the company that owns it, not whoever printed it. */
export function operatorName(state: State, operatorId: string | undefined, lang: 'ar' | 'en'): string | undefined {
  const o = operatorId ? state.operators.find((x) => x.id === operatorId) : undefined;
  return o ? orgName(o, lang) : undefined;
}

/**
 * Client question 18 — an operating company's CONTACT, DERIVED and never invented: the first
 * ENABLED account the registry holds for that company. It is the only person the registry can
 * vouch for, so it is the only person printed.
 *
 * `undefined` is a first-class answer, and the two surfaces that call this (the tender file's
 * side column and the operators registry) both render NOTHING when it comes back empty rather
 * than a name, a placeholder or a role with nobody behind it. This lived twice — once in
 * `FileSide`, once about to be copied into `Operators` — and a second copy is exactly how the
 * two screens start disagreeing about who to call.
 */
export function operatorContact(state: State, operatorId: string | undefined): UserAccount | undefined {
  return operatorId ? state.users.find((u) => u.operatorId === operatorId && !u.disabled) : undefined;
}

/**
 * The company's Service Contract reference (§7.1) — its code plus the term it runs, both read
 * off the contract row (the term is DERIVED from signedOn/expiresOn, never stored, C2). The
 * operator's fields are scanned in registry order and the first EFFECTIVE contract wins; the
 * code itself carries the field ('SC-RU-24'), so the chip says which contract it is. An
 * operator with no effective contract gets no chip rather than an expired or invented one.
 */
function contractRefOf(state: State, operatorId: string): { contractRef?: string } {
  for (const field of state.fields.filter((f) => f.operatorId === operatorId)) {
    const c = state.serviceContracts.find((sc) => sc.fieldId === field.id);
    if (c && serviceContractEffective(c)) {
      return { contractRef: `${c.code} · ${c.signedOn.slice(0, 4)}–${c.expiresOn.slice(0, 4)}` };
    }
  }
  return {};
}
