# Product

## Register

product

## Users

Procurement operators (مشغّلون) at oil-field operating companies and central governance staff at the parent company MDOC / نفط الوسط (MDOC admins, evaluators, auditors) in an Arabic-first, formal governmental context. They are administrative professionals — often senior — working through legally intricate SCPP tender procedures under deadline pressure. Primary language Arabic (RTL); English is secondary. Keyboard access and larger-type readability matter.

## Product Purpose

Masaar (مسار) manages the full SCPP procurement lifecycle: tender requests → advertisement → evaluation → ratification → contracts → vendor governance, with working-day deadline math, ±20% verdicts, fairness masking (12.4.2), and append-only audit. Success = an operator always knows what is late, what to do next, and every governance act is confirmed, attributed, and auditable.

## Brand Personality

Institutional, calm, trustworthy. "Control room for a state process" — not a startup dashboard and no longer a paper file. Deep indigo carries identity from the sidebar gradient outward; cool slate is the ground; colour is spent only where it means something — a status, a deadline, an approval tier. There is no decorative accent: the palette has exactly one brand hue and one closed semantic vocabulary, and anything that is neither is grey. Authority comes from precision (clause citations, working-day math) and from a surface that reads identically at 8am on a projector and at 11pm in a dark room. Both themes are first-class; neither is a "mode" bolted onto the other.

## Anti-references

- Emoji in navigation or labels; playful/consumer tone.
- Raw palette classes or hex values in components (everything flows from `@masaar/tokens`).
- Fabricated UI: no button without a real action, no metric without a real field, no capability no endpoint enforces (governing law of the redesign).
- SaaS hero-metric clichés, gradient text, decorative motion.

## Design Principles

1. **One skeleton per surface class** — every registry, dialog, and wizard follows one learned anatomy; learning one screen teaches all.
2. **Confirmation asks about reality** — governance commits are phrased as the physical event with the after-state previewed, and confirmed through toast + audit entry.
3. **Complexity explained, not hidden** — plain-language model sentences, clause-grounded explainers, empty states that name the next button.
4. **Honest surfaces** — placebo actions are removed or labeled; client-only actions are flagged in API mode; exports show exactly what the screen shows.
5. **RTL-native precision** — logical CSS properties only, Latin digits via `fmtCount`, mono for codes/dates/money, direction islands for machine-format data.

## Accessibility & Inclusion

Arabic RTL first-class with full English mirror. Target WCAG AA contrast (tokens already tuned). Every row-level navigation is a real link (keyboard reachable); dialogs trap focus and close on Escape (batch 3 of ops/UI-METHODOLOGY-PLAN.md); planned root-level text-size scaling ("وضع كبار السن") and high-contrast toggle (batch 6b). Reduced motion respected; motion is 150–250ms state feedback only.
