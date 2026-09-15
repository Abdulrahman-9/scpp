# Prompt for Claude Code — نظام مسار / Masaar Orders System

> Copy everything below the line into Claude Code once it is connected to this project over MCP.
> انسخ كل ما تحت الخط إلى Claude Code بعد ربطه بالمشروع عبر MCP.

---

You are working on **مسار (Masaar)** — an Arabic, RTL, institutional procurement-tracking prototype for شركة نفط الوسط (petroleum licensing division). It tracks purchase orders (طلبيات) through a 12-stage workflow under the SCPP Rev 1.0 rulebook, across three roles: head-office admin, operator (مشغّل), and the Joint Management Committee (اللجنة المشتركة / JMC).

This is a **design prototype**, not a production app. There is no build step, no npm, no framework install. Fidelity of domain logic and visual consistency matter more than abstraction.

## 1. Read these first, in this order (do not read anything else until you have)

1. `orders-data.js` — the single source of truth for all data. Read it fully.
2. `tokens-v2.css` — every color, font, shadow, radius, duration. Read it fully.
3. `قائمة الطلبيات.dc.html` — the canonical example of a screen (table + filters + logic class).
4. Then only the screen you were asked to change.

Do **not** read all nine screens up front — they are large and repetitive. Read on demand.

## 2. Architecture: the Design Component (DC) format

Every screen is one self-contained `Name.dc.html` file with this shape:

```html
<!DOCTYPE html><html><head><script src="./support.js"></script></head><body>
<x-dc>
  <helmet>fonts + <link rel="stylesheet" href="tokens-v2.css"></helmet>
  ...template markup...
</x-dc>
<script type="text/x-dc" data-dc-script data-props="{...}">
class Component extends DCLogic { state = {}; renderVals() { return {...}; } }
</script>
</body></html>
```

`support.js` is the runtime — **never edit it**. The template is React-compiled markup; the logic class is a React class component without `render()`.

### Hard rules of the format (violating these silently breaks the screen)

- **Template holes are dotted lookups only**: `{{ user.name }}`, `{{ $index }}`. **No expressions** — `{{ a + b }}`, `{{ !x }}`, `{{ fn() }}` fail silently. Compute in `renderVals()` and expose by name.
- **Inline styles only.** No CSS classes, no stylesheets beyond `tokens-v2.css`. Pseudo-states are `style-hover` / `style-active` / `style-focus` attributes.
- **Control flow** is `<sc-for list="{{ arr }}" as="item" hint-placeholder-count="3">` and `<sc-if value="{{ flag }}" hint-placeholder-val="{{ false }}">`. Always set the `hint-*` attribute.
- Event handlers use JSX camelCase as whole-value holes: `onClick="{{ handler }}"`.
- `<script>` is legal **only** inside `<helmet>`.
- Close every non-void element explicitly; double-quote every attribute.
- Logic class is plain classic JS — no TypeScript, no `import`/`export` statements (use dynamic `import('./orders-data.js')` inside `componentDidMount`).
- The class must be named `Component`.
- Never build UI layout with `React.createElement` — it becomes uneditable in the visual editor. Template markup only.

## 3. Screens and their responsibilities

| File | Role | Notes |
|---|---|---|
| `تسجيل الدخول.dc.html` | all | 3-role tab switch routes to the right portal; demo credentials سيف / 123456 |
| `لوحة التحكم.dc.html` | admin | KPI cards, command palette (Ctrl+K) |
| `قائمة الطلبيات.dc.html` | admin | search + advanced filters, responsive table→cards, reads `?st=` and `?op=` |
| `تفاصيل الطلبية.dc.html` | admin | 4 tabs (البيانات · المسار الزمني · المرفقات · السجل), reads `?po=CODE` |
| `سلسلة الموافقات.dc.html` | admin | approval registry; stages 2–3 only; 45-day wait flag |
| `العقود.dc.html` | admin | post-signature 7-stage lifecycle + contract-cap health badges |
| `الجهات.dc.html` | admin | operator cards with order counts/values |
| `بوابة المشغل.dc.html` | operator | own orders only; submit new order with auto path suggestion; complete stage with actual duration + attachment |
| `بوابة اللجنة.dc.html` | JMC | tier-t2 orders only; approve / reject with **mandatory** reason; decision log |
| `نظام التصميم.dc.html` | — | token and component reference |

### Navigation contract (keep it working)

- Detail links: `تفاصيل الطلبية.dc.html?po=PO-2026-0148`
- Filtered list: `قائمة الطلبيات.dc.html?st=pending` · `?op=<encodeURIComponent(operator)>`
- Login routes by role: admin → `لوحة التحكم.dc.html`, operator → `بوابة المشغل.dc.html`, jmc → `بوابة اللجنة.dc.html`

### localStorage keys (the only three — do not invent more without saying so)

- `masaar2-theme` → `'light' | 'dark'`, read by every screen on mount
- `masaar2-orders-<operatorName>` → `{ orders: [...], counter: n }` (operator portal; empty `orders` array means "fall back to baseline data")
- `masaar2-jmc` → array of decisions `{ code, title, action, ok, reason, date }`

## 4. Domain rules — the part you must not improvise

All of these come from **SCPP Rev 1.0 (Jan 2026)**. Never invent a path, threshold, or stage.

**The 8 procurement paths (§11)** — exactly these, with their section numbers in the label:
المصدر الوحيد (11.5) · شراء منخفض القيمة (11.8.3) · المسار السريع (11.7) · الدعوة المباشرة (11.4) · استدراج عروض (11.8.1) · المناقصة المحدودة (11.2) · المناقصة العامة (11.1) · المناقصة بمرحلتين (11.3)

**The 12 stages** live in `STAGES` in `orders-data.js`, each with a planned duration in days. Deviation (حيود) = `actual − planned`, accumulated on the order's `dev` field.

**Value thresholds** (as implemented): `< $10,000` → شراء منخفض القيمة · `$10,000–$100,000` → استدراج عروض (≥3 suppliers) · above → tender paths.

**Approval tiers** (`TIERS`): `t1` ضمن الصلاحية المالية · `t2` اللجنة المشتركة JMC · `t3` شركة نفط الوسط. Current mapping: ≤$100k → t1, ≤$2M → t2, above → t3. Financial Authority values are **not** in the SCPP — they are per-contract, so keep them in one place and label them as assumptions.

**Other enforced rules**: public tender ≥21 calendar days bidding · MCT cycle 14/21 working days with a ±20% estimate rule (§6.9) · variations ≤10% (§18) · extension ≤25% of term (§19.3) · LDs ≤10% (§21.2) · performance bond ≥5% · JMC rejection requires a documented reason · approval waiting >45 days is flagged.

## 5. Language, tone, typography

- Arabic first, RTL everywhere (`dir="rtl"`). Modern Standard / Iraqi-administrative register.
- **Numbers, codes, dates, currency are always LTR monospace**: `font-family:var(--font-mono);direction:ltr;unicode-bidi:isolate`.
- Institutional, third-person, passive for system facts: «تم تحديث الحالة»، «تمت المصادقة». Verb-noun action labels: «إضافة حقل»، «تقديم طلبية».
- **No emoji. Ever.** Status is communicated by pill color + Lucide-style stroke icons.
- Fonts: IBM Plex Sans Arabic (UI) + JetBrains Mono (numerics). Loaded per-screen in `<helmet>`.

## 6. Styling: use tokens, never raw values

Every color comes from `tokens-v2.css`. The most-used families:

- Surfaces: `--bg-page` · `--bg-card` · `--bg-muted` · `--bg-inset` · `--side-bg` · `--grad-brand`
- Text: `--text-1` (primary) · `--text-2` · `--text-3` · `--text-muted`
- Borders: `--border-1` (hairline) · `--border-2` · `--border-control`
- Status, per `k` in `pending|approved|preparing|delivered|cancelled`: `--st-{k}-fg` · `-bg` · `-bd` · `-base`
- Buttons: `--btn-primary-{bg,hover,active,fg}` · `--btn-secondary-{bg,bd,fg}`
- Motion: `--dur-fast` · `--dur-slow` · `--ease-out`. Shadows: `--shadow-1..3` + `--shadow-pop` (modals only).

**Critical trap:** `--st-{k}-fg` is the foreground *for that status's tinted background*, and for `delivered` it is near-white. Text on a white or muted surface must use `--st-{k}-base` (or `--st-approved-fg`), never `--st-delivered-fg`. This exact bug shipped once — do not reintroduce it.

Dark mode is `document.documentElement.setAttribute('data-theme','dark')` + the `masaar2-theme` key. Every new screen must honor it on mount.

## 7. How to add or change a screen (the fast path)

1. Copy the closest existing screen as the skeleton — the topbar, sidebar, theme toggle, and data-loading block are already correct there. Do not rewrite them from scratch.
2. Load shared data with `import('./orders-data.js')` in `componentDidMount`, store the module on `this.M`, and put derived rows in `renderVals()`.
3. Expose 2–3 real props in `data-props` JSON (`editor`, `default`, `tsType`, `section`) for things in-place editing can't do — role, variant, a flag that changes many elements. Read them as `this.props.x ?? default`. Do **not** add props for single copy strings or single colors.
4. Register keyboard shortcuts in `componentDidMount` and remove them in `componentWillUnmount`. Existing conventions: `N` = new, `/` = search, `Ctrl+K` = palette, `Esc` = close modal. Always bail out when `e.target` is an INPUT/TEXTAREA/SELECT.
5. Wire it into the navigation contract in §3 before calling it done.

**When the user asks for a small change, change only that.** No opportunistic refactors, no re-theming, no "while I was in there".

## 8. Known state and open items

- The bound Masaar design-system bundle (`_ds/masaar-design-system-…/_ds_bundle.js`) is **not** loaded; the project styles against its own `tokens-v2.css`, which mirrors the same palette. Migrating all screens to the bundle is a deliberate, project-wide task — do not start it unprompted.
- `orders-data.js` holds 12 orders, 9 operators, 6 contracts. Most orders have `items: null` / `log: null` and rely on `defaultItems()` / `defaultLog()` — respect those fallbacks.
- Everything is client-side; there is no API. Persistence is the three localStorage keys above.
- Attachments, invitations, and MCT correspondence are simulated (button click appends a filename). If a real upload is wanted, that is a new decision — ask.

## 9. Definition of done for any task here

- Renders with **zero console errors**, in both light and dark mode.
- No layout break at 390px width (tables scroll horizontally; they never hide columns).
- Arabic copy reads institutionally; all numerics LTR mono.
- Only tokens used for color; contrast checked for any status text on a light surface.
- Navigation links still resolve; localStorage keys unchanged unless the task says otherwise.
- SCPP numbers unchanged unless the task cites a section.
