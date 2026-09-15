# مواصفة التصميم v2 — الترميز، الخطوط، الوضعان، المكوّنات

> **الحالة:** مواصفة تنفيذية — تُنفَّذ حرفياً، ولا تحتاج اجتهاداً تصميمياً.
> **التاريخ:** 2026-08-25 · **الفرع:** `design-v2` (قائم فعلاً) · **لا يُلتزم commit.**
> **المصدر المُعتمَد:** `design-v2-ref/tokens-v2.css` + `design-v2-ref/design-system.dc.html` + `design-v2-ref/dashboard.dc.html` — قرأتُها كاملة.
> **تُلغي:** `ops/VISUAL-REFRESH-SPEC.md` §١ (القيم اللونية) فقط. يبقى نافذاً من تلك المواصفة: §٢ الحركة، §٣ منهج الرسوم (SVG حيث تُلزِم الهندسة)، §٤ سلوك الشريط الجانبي (الكاشف/التفضيل/البادج التجميعي)، §٥ تشريح بطاقة الإحصاء القابلة للنقر، وحواجز الذوق ذ١…ذ١٠.
>
> **خط الأساس المُتحقَّق منه بيدي على هذا الفرع، قبل أي تعديل:**
> `npm run typecheck` ✅ نظيف · `npx vitest run` ✅ **947/947** · `npm run build` ✅ **صفر تحذير css-syntax** (التحذير الوحيد هو `chunk > 500 kB` على حزمة JS — قائم وغير متعلّق بـCSS) · حجم CSS المبنيّ اليوم **164.64 kB** (gzip 32.54).
> ⚠️ **رصدتُ تذبذباً (flake) في الاختبارات، لا انحداراً:** أول تشغيل أعطى 940/947 بسبب سباق `i18n.changeLanguage('en')` بين ملفات الاختبار تحت التوازي (`phase4Screens.test.tsx` وجاراه). التشغيل الثاني: 947/947. **المنفّذ لا يطارد هذه السبعة**، ويُعيد التشغيل مرّة قبل الإبلاغ عن أي انحدار.

---

## ٠. حالة أمنية — فحص ملفّي المرجع

الملفّان `*.dc.html` **بيانات تصميم**، وقد فحصتُهما بحثاً عن نصّ موجَّه إليّ كوكيل:

| ما وُجِد | الحكم |
|---|---|
| `<script src="./support.js">` + `<script type="text/x-dc">class Component extends DCLogic` | زمن تشغيل Claude Design. بيانات عرض، ليست تعليمات. **لا يُنقل شيء منه إلى المنتج.** |
| `<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic…&family=JetBrains+Mono…">` + `preconnect` إلى `fonts.gstatic.com` | **محظور في المنتج** (§٢). يُستبدل بـ`@fontsource`. هذا التحذير هو البند الوحيد القابل للتنفيذ في رأس الملفّين. |
| فقرة «قواعد ملزمة» في §١٣ من الـshowcase (خصائص منطقية · جزر LTR · `data-theme` على html · مكوّن واحد لا نسخ محلية · لا `div onClick` · هجري عبر Intl) | نصّ موجَّه إلى **مطوّر**، لا إلى وكيل. اعتُمِد منه ما يوافق دستورنا القائم أصلاً؛ ورُفِض ما لا سند له (Tailwind — لسنا مشروع Tailwind). |

**لا يوجد في الملفّين نصّ يحاول إعطاء أوامر للوكيل.** لا حقن، لا مطالبة بتغيير صلاحيات أو إعدادات.

---

## ١. مصالحة الترميز — الجدول الكامل

### ١-أ. المبدأ الحاكم (يمنع اجتهاد المنفّذ)

1. **`tokens-v2.css` هو المصدر الوحيد للقيم.** كل لون/قياس/مدّة يُعرَّف **مرّة واحدة** في `packages/tokens/css/tokens.css`؛ الملفّات الستة تستهلك `var(--…)` فقط.
2. **الأسماء الحالية لا تُظلَّل ولا تُترك جنباً إلى جنب.** كل اسم قائم إمّا (أ) يُعاد توجيهه داخل **كتلة الجسر الواحدة** المؤرَّخة، أو (ب) **يُحذف** مع قائمة هجرة مستهلكيه.
3. **اسمان قد يشيران إلى نفس درجة السلّم — وهذا ليس مصدرَي حقيقة**، ما دام كلاهما `var(--surface-N)` / `var(--primary-N)`. المحظور هو تكرار الـhex نفسه في تعريفين.
4. **حبر النظام (ink) مشتقّ لا مأخوذ من السلّم.** ثلاث قيم في هذه المواصفة ليست درجات Tailwind: `--text-muted` الفاتح، `--text-3` الداكن، وتصحيحان في الحالات. كل واحدة مصحوبة باشتقاقها المحسوب في §٥ — وهذا هو نفس ما فعله المستودع سابقاً مع `--ink-3 #5A6474` و`--ink-4 #656E7D`.

### ١-ب. كتلة الجسر — واحدة، مؤرَّخة، ذات اختبار يمنع تعفّنها

`BUILD-1` يكتب سلّم v2 كاملاً ويضيف **كتلة واحدة** في نهاية `:root`، بهذا النصّ حرفياً:

```css
  /* ══════════════════════════════════════════════════════════════════
     جسر الأسماء القديمة — BLOCK واحد، لا أسماء متناثرة.
     يوجد ليمرّ BUILD-2 على الأسطح ورقة ورقة دون أن تنكسر الستّ ملفّات
     دفعةً واحدة. كل سطر هنا **دَين**، لا تصميم.

     غروب: 2026-09-30. عند إتمام BUILD-2 تُحذف هذه الكتلة كلها.
     يحرسها `visualRefresh.test.tsx › §1-bridge`: أي اسم هنا بلا مستهلك
     واحد في الملفّات الستة = فشل الاختبار (اسم ميت لا يُترك «للاحتياط»).
     ══════════════════════════════════════════════════════════════════ */
  --ink-1: var(--text-1);        --fg-1: var(--text-1);
  --ink-2: var(--text-2);        --fg-2: var(--text-2);
  --ink-3: var(--text-3);        --fg-3: var(--text-3);
  --ink-4: var(--text-muted);    --fg-4: var(--text-muted);
  --ink-disabled: var(--text-disabled);
  --ink-on-dark: var(--side-fg); --ink-on-dark-2: var(--side-fg-2);
  --paper-50: var(--surface-50); --paper-100: var(--surface-100);
  --paper-200: var(--surface-200); --paper-300: var(--surface-300);
  --brand-navy-900: var(--primary-950); --brand-navy-800: var(--primary-900);
  --brand-navy-700: var(--primary-700); --brand-navy-600: var(--primary-600);
  --brand-navy-500: var(--primary-500); --brand-navy-100: var(--primary-200);
  --brand-navy-50:  var(--primary-50);
  --r-xl: var(--r-lg);
```

**`--brand-amber-*` لا يدخل الجسر إطلاقاً.** الكهرماني يُحذف من النظام (§٦-١)، وكل موقع من مواقعه الستّين ينتقل إلى وجهة مسمّاة في §١-ج — أي أنّ BUILD-2 لا يستطيع «تأجيل» الكهرماني، لأنّه لن يجد اسماً يعمل.

### ١-ج. الجدول الكامل — كل توكن قائم ومصيره

المصائر ثلاثة: **↦v2** (يُعاد توجيهه/تُستبدل قيمته) · **=** (يبقى كما هو) · **✖** (يُحذف + قائمة هجرة).

#### العلامة التجارية — النيلي (١٢٤ موقع استهلاك في `src/`)

| التوكن الحالي | القيمة | المصير | الوجهة في v2 | ملاحظة الهجرة |
|---|---|---|---|---|
| `--brand-navy-900` | `#061826` | ✖ | `--primary-950 #172554` | `.ad-side` (تُستبدل بـ`--side-bg`)، `.wz-next--amber` نصّ، `--tier-mdoc`، `.ad-nav__btn--on` نصّ، `.acc-avatar` |
| `--brand-navy-800` | `#0B2540` | ✖ | **دوران** — كتعبئة زرّ ↦ `--btn-primary-bg`؛ كسطح هوية ↦ `--primary-900` | ٥٣ موقعاً. **ليست عملية sed**: `.op-btn-primary/.op-cta/.op-btn-nav/.wz-next/.file-here__cta/.file-tl__wiz/.ad-decision__go` ↦ `--btn-primary-bg`؛ `.file-codechip/.rp-hdr/.rp-tbl th/.op-side__logo` ↦ `--primary-900`؛ `.nav-link--on/.skin-tab--on/.subnav__link--on/.seg__btn--on/.rp-modeseg__btn--on` ↦ `--btn-primary-bg` |
| `--brand-navy-700` | `#143A5E` | ✖ | `--primary-700` (= `--link`) | كل `:hover` على الأزرار ↦ `--btn-primary-hover`؛ `.tcard__code/.hbar__fill/.rp-bar__fill/.wn__mark` ↦ `--link` |
| `--brand-navy-600` | `#1F5180` | ✖ | `--primary-600` | `--focus-color` (يصبح تعريفاً مباشراً)، `.acc-tab--on`، `.bidderadd-row--on`، `--chart-neutral` (↦`--primary-700`) |
| `--brand-navy-500` | `#2E6BA1` | ✖ | `--primary-500` | `--tier-operator`، `.m-rail__fill` تحت skin التحكّم (يزول مع §٤-ط) |
| `--brand-navy-100` | `#DDE7F1` | ✖ | `--primary-200 #BFDBFE` | `.ent-state` حدّ، `.acc-rc__people .acc-avatar:hover`، `.wn__link` حدّ، `.wn__fold:hover` |
| `--brand-navy-50` | `#EEF3F8` | ✖ | `--primary-50 #EFF6FF` | `.wz-step--on/.wz-cardbtn--on/.file-tl__row--on/.op-task__icon--week/.ad-decision__icon/.acc-*/.rp-row--now/.wn` |

#### العلامة التجارية — الكهرماني (٦٠ موقعاً) — **يُحذف كاملاً**

| التوكن | القيمة | المصير | الوجهة |
|---|---|---|---|
| `--brand-amber-700` | `#8C5A18` | ✖ | حسب الدور: صناديق الشرح `.wz-why__body/.file-guide__body/.op-guide` ↦ `--st-pending-fg`؛ رقاقات المادّة `.m-clause/.op-scpp/.wz-why__ref/.file-guide__ref` ↦ **`--text-3` على `--bg-muted`** (مرجع تشريعي = بيانات وصفية محايدة، ليس تحذيراً)؛ `.rp-eyebrow/.rp-sec__n` ↦ `--link`؛ `.acc-conflict` ↦ `--st-pending-fg`؛ `.ad-tier--jmc/.acc-role--jmc/.acc-cell--scoped/.ad-searchchip--entity` ↦ §١-و |
| `--brand-amber-600` | `#B5751F` | ✖ | `--mark-accent` يصبح تعريفاً مباشراً (`--secondary-600`)؛ `.wz-next--amber:hover` يزول مع الزرّ |
| `--brand-amber-500` | `#C9892C` | ✖ | `.ad-nav__btn--on` ↦ `--side-active` + `--side-fg`؛ `.ad-avatar` ↦ `--grad-brand`؛ `.ctr-stage__dot--now` ↦ `--st-pending-base`؛ `.tab--on` ↦ `--mark-accent`؛ **`.wz-next--amber` يُحذف كصنف** (§٤-ب) |
| `--brand-amber-400` | `#DBA659` | ✖ | `--focus-color-on-dark` ↦ `--secondary-400`؛ مواقع skin التحكّم تزول مع §٤-ط |
| `--brand-amber-100` | `#F4E4C4` | ✖ | حدود صناديق الشرح ↦ `--st-pending-bd`؛ حدود رقاقات المادّة ↦ `--border-1` |
| `--brand-amber-50` | `#FAF1DD` | ✖ | خلفيات صناديق الشرح ↦ `--st-pending-bg`؛ خلفيات رقاقات المادّة ↦ `--bg-muted` |

#### الورق → الأسطح

| الحالي | المصير | v2 | ملاحظة |
|---|---|---|---|
| `--paper-50/100/200/300` | ↦v2 عبر الجسر ثم ✖ | `--surface-50/100/200/300` | ٢٠ موقعاً (و`--paper-100` بصفر مستهلك — يُحذف مع الأربعمئة فما فوق)؛ الأكثر: `.wz-step__c/.cf-sec__n/.wz-cond__m/.wz-check__m` (خلفية `--surface-200`)، `.file-tl__planned/.op-task__mdot` (`--surface-300`) |
| `--paper-400…900` | ✖ فوراً في BUILD-1 | — | **صفر مستهلك** اليوم. كود ميت. |

#### الحبر

| الحالي | القيمة | المصير | v2 | التبرير |
|---|---|---|---|---|
| `--ink-1` | `#0B1320` | ✖ (جسر) | `--text-1` | فاتح `#0F172A` · داكن `#F1F5F9` |
| `--ink-2` | `#364254` | ✖ (جسر) | `--text-2` | فاتح `#334155` · داكن `#CBD5E1` |
| `--ink-3` | `#5A6474` | ✖ (جسر) | `--text-3` | فاتح `#475569` · داكن **`#A0AEC0` (مصحَّح، §٥-د١)** |
| `--ink-4` | `#656E7D` | ✖ (جسر) | `--text-muted` | فاتح **`#5A687D` (مصحَّح، §٥-ل١)** · داكن `var(--text-3)` — الوضع الداكن لا يتّسع لدرجة خامسة فوق أرضية AA؛ يُصرَّح بالاندماج بدل تركه صدفة |
| `--ink-disabled` | `#98A1B0` | ✖ (جسر) | `--text-disabled` | يبقى استثناء WCAG 1.4.3 (`:disabled` حصراً) بنفس الاختبار الدلالي القائم |
| `--ink-on-dark` | `#F4F1EA` | ✖ (جسر) | `--side-fg` | مواقع الشريط الجانبي؛ مواقع التنبيه تنتقل إلى `--text-1` بعد إعادة تصميم Toast (§٤-ز) |
| `--ink-on-dark-2` | `#B6BAC3` | ✖ (جسر) | `--side-fg-2` | نفس القاعدة |
| `--fg-1…4` | أسماء مستعارة | ✖ (جسر) | `--text-1/2/3/muted` | ٤٢ موقعاً لـ`--fg-*` مقابل ٢٩٠ لـ`--ink-*`؛ الاسم المزدوج (ink+fg) كان مصدرَي تسمية لقيمة واحدة — ينتهي هنا |

#### الأسطح والحدود

| الحالي | المصير | v2 |
|---|---|---|
| `--bg-page` | ↦ | `var(--surface-50)` فاتح · `var(--surface-900)` داكن |
| `--bg-card` | ↦ | `#FFFFFF` · `var(--surface-800)` |
| `--bg-muted` | ↦ | `var(--surface-100)` · `#26334B` |
| `--bg-inset` | ↦ | `var(--surface-200)` · `#334155` |
| `--bg-dark` | ✖ فوراً | **صفر مستهلك**. الشريط الداكن صار `--side-bg` (تدرّج). |
| `--border-1` | ↦ | `#E2E8F0` · `rgba(148,163,184,.16)` — زخرفي، معفى |
| `--border-2` | ↦ | `#CBD5E1` · `rgba(148,163,184,.24)` — زخرفي، معفى |
| `--border-3` | ✖ | **يُحذف.** v2 لا يعرف سلّماً ثلاثياً للحدود، ودرجة ثالثة بلا معنى دلالي ≠ نظام. تسعة مواقع، **بوجهتين مختلفتين لا واحدة**: (أ) حدّ يشتدّ عند التحويم/البؤرة ↦ **`--border-control`** — `a.ad-kpi--link:hover` (admin:124)، `.acc-tab:hover` (414)، `.acc-tab:focus-visible` (625)، `.op-task:hover` (operator:310)؛ (ب) حدّ ساكن على عنصر ليس حقلاً ↦ **`--border-2`** — `.acc-cell--open` المتقطّع (370)، `.op-report-thumb` (operator:580)، وحدّان مضمّنان في `AdvertiseWizard.tsx:149` و`EvaluateWizard.tsx:113`. (ج) `--m-bd-strong` في `ui.css:14` ↦ `--border-control` (مستهلكاه `.m-meter__tick` و`.m-rail__mk` علامتان رسوميتان تخضعان لأرضية 3:1). |
| `--border-control` | ↦ **بقيمة مصحَّحة** | **`#788496` فاتح · `rgba(148,163,184,.82)` داكن** — قيمة v2 `#94A3B8` تُسقِط ادّعاءها «≥3:1» إلى 2.08–2.56. §٥-ل٤ |
| `--mark-accent` | ↦ | `var(--secondary-600) #0284C7` فاتح · `var(--secondary-400) #38BDF8` داكن — قاعدة v2 نفسها: «التركوازي للعناصر النشطة والتحديد» |

#### الحالات والطبقات → §١-د · §١-هـ · §١-و

#### الطباعة والقياس

| الحالي | المصير | v2 |
|---|---|---|
| `--font-sans` | ↦ | `'IBM Plex Sans Arabic','Segoe UI',system-ui,sans-serif` |
| `--font-mono` | ↦ | `'JetBrains Mono',ui-monospace,'SF Mono',Menlo,Consolas,monospace` |
| `--font-display` | ✖ فوراً | **صفر مستهلك**. كود ميت. |
| `--t-display-1/2`, `--t-h1…h4`, `--t-body`, `--t-body-sm`, `--t-caption`, `--t-micro` | **=** | مطابق حرفياً لـv2 (44/32/24/20/17/15/14/13/12/11). لا تغيير. |
| `--lh-tight/snug/normal/loose` | **=** | v2 صامت عنها (يستعمل `line-height:1.5` على body). ٥٠ مستهلكاً. تبقى. |
| `--fw-regular/medium/semibold/bold` | **=** | مطابق. |
| `--space-1…10` | **=** | مطابق. `--space-6…10` بلا مستهلك اليوم — **استثناء مصرَّح به لقاعدة «صفر غير مستعمل»: السلّم قطعة واحدة، لا عشر قطع.** BUILD-2 يصرف 6 و7 في إيقاع الصفحة الجديد. |
| `--r-xs` | ↦ | `3px` → **`4px`** |
| `--r-sm` | ↦ | `5px` → **`6px`** (زوايا الأزرار والحقول) |
| `--r-md` | **=** | `8px` (زوايا البطاقات) |
| `--r-lg` | **=** | `12px` (النوافذ) |
| `--r-xl` | ✖ (جسر) | v2 لا يعرفه. ١١ موقعاً ↦ `--r-lg`: `.ad-modal__card` (الـshowcase نفسه: `border-radius:12px`)، `.wz-card`، `.op-report-card`، `.login-card`، `.skin-stage`، `.wz-done__card` |
| `--r-pill` | **=** | `999px` |

#### الظلال والارتفاع والبؤرة والحركة

| الحالي | المصير | v2 |
|---|---|---|
| `--shadow-1/2/3/pop` | ↦ **بقيم v2 حرفياً** | تكتسب **إبرازاً داخلياً** `inset 0 1px 0 rgba(255,255,255,.65…)` فاتح، و`inset 0 1px 0 rgba(255,255,255,.07…)` داكن. هذا هو الفرق البصري الأكبر بعد اللون. |
| `--shadow-inset` | ✖ فوراً | **صفر مستهلك**. |
| `--elev-rest/hover/overlay` | **=** | ثلاثة أسماء ولا رابع (قاعدة قائمة). تبقى `var(--shadow-1/2/pop)`. |
| `--lift` | **=** | `-1px`. **انحراف مصرَّح به:** الـshowcase يستعمل `-2px` على بطاقات KPI المملوءة وصناديق المراحل — وهما مكوّنان **لا نتبنّاهما** (§٤-ي)، فلا مبرّر لدرجة ارتفاع ثانية. |
| `--focus-color` | ↦ | `var(--primary-600)` فاتح · `var(--primary-400)` داكن |
| `--focus-color-on-dark` | ↦ | `var(--secondary-400) #38BDF8` — على تدرّج الشريط الفاتح 4.84/6.86، وعلى الداكن 7.89/8.33 ✅ |
| `--focus-width/offset/ring` | **=** | `2px`/`2px`/`var(--focus-width) solid var(--focus-color)` — يطابق v2 عدداً، ويبقى مُرمَّزاً عندنا (١٢ مستهلكاً). |
| `--ease-out` | **=** | `cubic-bezier(0.2,0.8,0.2,1)` مطابق. |
| `--ease-in-out` | ✖ | مستهلك واحد (`.skin-stage`) ↦ `--ease-out`. v2 يعرف منحنى واحداً. |
| `--dur-fast` | ↦ | `120ms` → **`150ms`** ⚠️ **يجرّ تغييرين إلزاميين**: `apps/web/src/Toasts.tsx` `const EXIT_MS = 120` → `150`، و`visualRefresh.test.tsx §2-5` الذي يثبّت الاثنين. |
| `--dur-base` | **=** | `200ms` |
| `--dur-slow` | ↦ | `320ms` → **`250ms`** |
| `--chart-track` (في `charts.css`) | ↦ + **يُرقَّى إلى tokens.css** | **`var(--surface-100)` فاتح** (لا `--surface-200` كما في v2: `--tier-operator` يسقط إلى 2.983 عليه — §٥-ل٦) · `var(--surface-700)` داكن |
| `--chart-neutral` (في `charts.css`) | ↦ + يُرقَّى | `var(--primary-700)` · `#93C5FD` |
| `--chart-sep` | **جديد من v2** | `var(--bg-card)` — لون فجوة الـ2px بين شريحتين. عندنا اليوم مكتوب كتعليق لا كتوكن. |
| `--dr-dir` (في `operator.css`) | **=** | يبقى في `operator.css` — سلوك اتجاهي لمكوّن واحد، ليس رمزاً للنظام. |
| `--m-*` (١١ متغيّراً في `.m-skin`) | ✖ جزئياً | §٤-ط |

### ١-د. الحالات الست لمراحل SCPP — القرار الصعب، مبرَّراً واحدة واحدة

**الحقيقة الملزِمة:** الأسماء الستة `planned/progress/done/risk/delayed/blocked` مثبَّتة بـ`packages/tokens/src/index.ts`، وبـ`visualRefresh.test.tsx §1`، وبـ`StatusKey` في `packages/ui`، وبمعاني i18n. **الأسماء لا تُمَسّ. القيم فقط تنتقل إلى عائلات v2.**

**القيد الأول:** الأزرق صار **لون العلامة** (`--primary`, `--link`, `--btn-primary-bg`). حالة زرقاء على شاشة فيها زرّ أساسي أزرق ورابط أزرق = التباس. ⇒ **`--status-progress` يفقد الأزرق**، ولا رجعة.
**القيد الثاني:** قاعدة v2 الصريحة في §٠١ من الـshowcase: «التركوازي للعناصر النشطة والتحديد، **لا للحالات**». ⇒ التركوازي ممنوع كذلك.
**النتيجة:** بعد استبعاد الأزرق والتركوازي، تبقى ست عائلات لست حالات — **الإسقاط مُجبَر، أحادي، وشامل**:

| حالتنا | معناها | عائلة v2 | التبرير النصّي من المرجع نفسه | التعريف الجديد |
|---|---|---|---|---|
| `planned` مخطّط | لم تبدأ | **الرمادي البارد** (`--surface`) | أسطورة صندوق المراحل في الـshowcase: «**لم تبدأ — رمادي ممتلئ**» بـ`--surface-500`. دليل مباشر. | `--status-planned: var(--surface-600)` فاتح · `var(--surface-300)` داكن |
| `progress` قيد التنفيذ | جارية | **البنفسجي** (`preparing`) | تعريف v2 لـ`preparing`: «جارٍ تجهيز المواد / **تنفيذ المراحل**». مطابقة معنى حرفية. | `--status-progress: var(--st-preparing-fg)` |
| `done` منجز | مكتملة | **الأخضر** (`approved`) | «تمت المصادقة — يبدأ التنفيذ». مطابقة. | `--status-done: var(--st-approved-fg)` |
| `risk` تحذير | انتباه | **الكهرماني** (`pending`) | «قُدِّمت وبانتظار الاعتماد» + قاعدة v2 «الكهرماني للانتظار». أقرب هوية للتحذير في مفردات v2. | `--status-risk: var(--st-pending-fg)` |
| `delayed` متأخر | حيود زمني | **الوردي القاني** (`late`) | v2 يسمّيه «**متأخر**» بالحرف. مطابقة تامّة. | `--status-delayed: var(--st-late-fg)` |
| `blocked` موقوف | أوقِفت بقرار | **الأحمر** (`cancelled`) | «أُوقفت نهائياً بقرار موثَّق». مطابقة معنى. | `--status-blocked: var(--st-cancelled-fg)` |

> **قرار مسمّى — تبادل الهوية بين `progress` و`blocked`:** البنفسجي كان «موقوف» وصار «قيد التنفيذ»؛ والأحمر كان «متأخر فقط» وصار يشمل «موقوف». هذه **كلفة إعادة تعلّم حقيقية** على مستخدم اعتاد النظام. قبولها مبرَّر بثلاثة: (١) الإسقاط أحادي — لا لونين لحالة ولا حالتين للون؛ (٢) كل زوج مبرَّر بنصّ v2 العربي لا بمصادفة v1؛ (٣) **اللون ليس الحامل الوحيد** — الشارة تحمل نصّها العربي دائماً، وهذه قاعدة قائمة في `DESIGN.md`. تخفيف مطلوب من BUILD-2: شريط «الجديد في مسار» (`.wn`) يحمل سطراً واحداً يشرح التبديل في أول دخول بعد الإطلاق.

**قيم النتيجة (كلها إشارات، لا hex مكرَّر):**

```css
  /* مفردات مراحل SCPP — إسقاط موثَّق على عائلات v2، لا سلّم ثانٍ.
     التعريف الفعلي للقيم يعيش في كتلة --st-* أعلاه؛ هنا أسماء المعنى فقط. */
  --status-planned:    var(--surface-600);
  --status-planned-bg: var(--surface-200);
  --status-planned-bd: var(--surface-300);
  --status-progress:    var(--st-preparing-fg);
  --status-progress-bg: var(--st-preparing-bg);
  --status-progress-bd: var(--st-preparing-bd);
  --status-done:    var(--st-approved-fg);
  --status-done-bg: var(--st-approved-bg);
  --status-done-bd: var(--st-approved-bd);
  --status-risk:    var(--st-pending-fg);
  --status-risk-bg: var(--st-pending-bg);
  --status-risk-bd: var(--st-pending-bd);
  --status-delayed:    var(--st-late-fg);
  --status-delayed-bg: var(--st-late-bg);
  --status-delayed-bd: var(--st-late-bd);
  --status-blocked:    var(--st-cancelled-fg);
  --status-blocked-bg: var(--st-cancelled-bg);
  --status-blocked-bd: var(--st-cancelled-bd);
```

**زوجا `-bg` الناعمان محفوظان كما أُمِر** — وأُضيف ثالث `-bd` لأنّ شارة v2 لها حدّ (§٤-ج). **لا يُضاف `-dot`:** النقطة تبقى `currentColor` كما في `.m-pill::before` اليوم — قيمة `fg` تتجاوز 4.5:1 فتتجاوز أرضية الـ3:1 الرسومية بالبناء. انحراف مصرَّح به عن المرجع (الذي يستعمل `base` أشدّ إشباعاً)، ثمنه صفر توكن جديد.

**تحديث إلزامي مرافق:** `packages/tokens/src/index.ts` — كائن `status` يحمل اليوم hex حرفياً، ويحرسه اختبار المرآة. يصبح `{ fg, bg, bd }` بالقيم **المحلولة** (لا `var()`؛ TypeScript لا يحلّ متغيّرات CSS)، والاختبار يُوسَّع ليطابق الحلّ لا النصّ.

### ١-هـ. حالات الطلبية الست `--st-*` — توكنات جديدة من الدرجة الأولى

تُضاف حرفياً من v2 **مع تصحيحَي §٥**، لشاشات الطلبيات القادمة، وهي في الوقت نفسه **مصدر القيم** الذي تشير إليه §١-د:

| المفتاح | fg فاتح | bg فاتح | bd فاتح | fg داكن | bg داكن | bd داكن |
|---|---|---|---|---|---|---|
| `pending` معلّق | **`#A84D08`** ⚠️مصحَّح | `#FFFBEB` | `#FDE68A` | `#FBBF24` | `rgba(217,119,6,.15)` | `rgba(251,191,36,.32)` |
| `approved` معتمد | **`#147739`** ⚠️مصحَّح | `#F0FDF4` | `#BBF7D0` | `#4ADE80` | `rgba(34,197,94,.13)` | `rgba(74,222,128,.32)` |
| `preparing` قيد التجهيز | `#6D28D9` | `#F5F3FF` | `#DDD6FE` | **`#C4B5FD`** ⚠️مصحَّح | `rgba(124,58,237,.17)` | `rgba(167,139,250,.34)` |
| `delivered` مُسلَّم | `#ECFDF5` | `#166534` | `#166534` | `#BBF7D0` | `#14532D` | `#14532D` |
| `cancelled` ملغي | `#B91C1C` | `#FEF2F2` | `#FECACA` | **`#FCA5A5`** ⚠️مصحَّح | `rgba(220,38,38,.15)` | `rgba(248,113,113,.32)` |
| `late` متأخر | `#BE123C` | `#FFF1F2` | `#FECDD3` | `#FDA4AF` | `rgba(190,18,60,.17)` | `rgba(251,113,133,.32)` |

`--st-*-base` (النقطة/الرسم) تُضاف كذلك بقيم v2 حرفياً؛ خمس منها مستهلكة عبر §١-د + `.ctr-stage__dot--now`، والسادسة أدناه.

> **📌 سطر دَين مسمّى — `--st-delivered-*`:** العائلة الوحيدة بلا مستهلك، لأنّ مفردات SCPP الست لا تُسقِط عليها. تبقى **بأمر العميل الصريح** (شاشات الطلبيات)، ويثبّتها اختبار اكتمال العائلة الست. **مراجعة الغروب: 2026-12-31** — إن لم تُبنَ شاشات الطلبيات حتى ذلك التاريخ، تُحذف.

### ١-و. طبقات الموافقة — v2 حرفياً في الفاتح، ومصحَّحة في الداكن

```css
  /* سلّم ترتيبي داخل درجة أساس واحدة — ليس حالة. لا تُصرف عليه أي --status-*.
     السلّم الفاتح: v2 حرفياً (تعتيم متزايد = سلطة متصاعدة).
     السلّم الداكن: v2 كما كُتب غير رتيب (jmc #3B82F6 أعتم من operator #60A5FA
     فينكسر الترتيب البصري) ويسقط إلى 2.815 على --chart-track. مصحَّح إلى
     تفتيح متزايد — نفس المنطق معكوساً. §٥-د٧ */
  --tier-operator: var(--primary-500);  /* #3B82F6 · 3.357 على المسار */
  --tier-jmc:      var(--primary-700);  /* #1D4ED8 · 6.117 */
  --tier-mdoc:     var(--primary-950);  /* #172554 · 13.414 */
/* داكن */
  --tier-operator: var(--primary-400);  /* #60A5FA · 4.073 */
  --tier-jmc:      var(--primary-300);  /* #93C5FD · 5.742 */
  --tier-mdoc:     var(--primary-100);  /* #DBEAFE · 8.487 */
```

**تبعية على `.ad-tier--*` و`.acc-role--jmc`:** الرقاقة اليوم تلبس النيلي/الكهرماني. تصبح: `--tier-operator/jmc/mdoc` كنصّ على `--primary-50` فاتح / `rgba(59,130,246,.14)` داكن، **بزوايا `--r-sm` مربّعة** لتُميَّز عن شارة الحالة القرصية — وهي قاعدة v2 المكتوبة في §٠١ من الـshowcase: «الرقاقة مربّعة الزوايا لتمييزها عن شارة الحالة القرصية». `.acc-role--jmc` يلبس `--tier-jmc` (جسم واحد، لون واحد — القاعدة القائمة). `.acc-cell--scoped` و`.ad-searchchip--entity` ↦ `--st-pending-*` (كلاهما «مقيَّد/انتباه»).

### ١-ز. `packages/tokens/css/tokens.css` — الملف النهائي

```css
/* ========================================================================
   مسار — الرموز التأسيسية (v2)
   الأساسي: أزرق نيلي · الثانوي: تركوازي · الأسطح: رمادي بارد
   وضعان: :root فاتح · [data-theme="dark"] داكن (داخل @media screen)
   الخطوط ذاتية الاستضافة عبر @fontsource — لا CDN في الإنتاج.
   كل نسبة تباين في التعليقات محسوبة على القيم الفعلية بمعادلة WCAG 2.x،
   غير مقرَّبة، ومقابلَة بأسوأ سطح تهبط عليه — لا بأفضلها.
   ======================================================================== */
:root {
  /* ---------- السلالم (المصدر الوحيد لكل hex في النظام) ---------- */
  --primary-50:#EFF6FF; --primary-100:#DBEAFE; --primary-200:#BFDBFE; --primary-300:#93C5FD;
  --primary-400:#60A5FA; --primary-500:#3B82F6; --primary-600:#2563EB; --primary-700:#1D4ED8;
  --primary-800:#1E40AF; --primary-900:#1E3A8A; --primary-950:#172554;
  --secondary-50:#F0F9FF; --secondary-100:#E0F2FE; --secondary-200:#BAE6FD; --secondary-300:#7DD3FC;
  --secondary-400:#38BDF8; --secondary-500:#0EA5E9; --secondary-600:#0284C7; --secondary-700:#0369A1;
  --surface-50:#F8FAFC; --surface-100:#F1F5F9; --surface-200:#E2E8F0; --surface-300:#CBD5E1;
  --surface-400:#94A3B8; --surface-500:#64748B; --surface-600:#475569; --surface-700:#334155;
  --surface-800:#1E293B; --surface-900:#0F172A; --surface-950:#020617;

  --grad-brand: linear-gradient(135deg,#1E3A8A 0%,#2563EB 55%,#3B82F6 100%);

  /* ---------- الأسطح ---------- */
  --bg-page: var(--surface-50);
  --bg-card: #FFFFFF;
  --bg-muted: var(--surface-100);
  --bg-inset: var(--surface-200);

  /* ---------- الحبر — أربع درجات حيّة + استثناء واحد ----------
     text-1/2/3 درجات سلّم. --text-muted **مشتقّ**: --surface-500 #64748B يسقط
     إلى 4.344 على --bg-muted و3.860 على --bg-inset، وهو يحمل نصّاً يُقرأ
     (عنوان عمود، سطر فرعي، مهلة). أُعتِم حتى يجتاز الأسوأ من الأربعة:
       #5A687D → 5.409 / 5.659 / 5.165 / 4.590 على page/card/muted/inset.
     --text-disabled يبقى تحت 3:1 عمداً: استثناء WCAG 1.4.3 للمكوّن غير القابل
     للتشغيل، ويُصرف على :disabled وحدها — لا على علامة حيّة مهما بدت هادئة. */
  --text-1: var(--surface-900);
  --text-2: var(--surface-700);
  --text-3: var(--surface-600);
  --text-muted: #5A687D;
  --text-disabled: var(--surface-400);

  /* ---------- الحدود — الزخرفي مفصول عن الوظيفي ----------
     border-1/2 زخرفيان (حدّ بطاقة) وWCAG يعفيهما؛ 1.419 و1.485 على الورق.
     --border-control هو ما يقول «هذا حقل»، فيخضع لـ1.4.11 عند 3:1. قيمة v2
     #94A3B8 تدّعي ذلك ولا تبلغه (2.451/2.564/2.340/2.080). أُعتِمت حتى:
       #788496 → 3.623 / 3.791 / 3.460 / 3.075. */
  --border-1: var(--surface-200);
  --border-2: var(--surface-300);
  --border-control: #788496;
  --link: var(--primary-700);
  /* العلامة الرسومية الوحيدة الحاملة لمعنى: «اليوم» على الخط الزمني، وغير
     المقروء، والتبويب النشط. قاعدة v2: التركوازي للنشط والتحديد. 3.32 على أسوأ سطح. */
  --mark-accent: var(--secondary-600);

  /* ---------- حالات الطلبية (§1-هـ) ---------- */
  --st-pending-base:#D97706;   --st-pending-fg:#A84D08;   --st-pending-bg:#FFFBEB; --st-pending-bd:#FDE68A;
  --st-approved-base:#16A34A;  --st-approved-fg:#147739;  --st-approved-bg:#F0FDF4; --st-approved-bd:#BBF7D0;
  --st-preparing-base:#7C3AED; --st-preparing-fg:#6D28D9; --st-preparing-bg:#F5F3FF; --st-preparing-bd:#DDD6FE;
  --st-delivered-base:#166534; --st-delivered-fg:#ECFDF5; --st-delivered-bg:#166534; --st-delivered-bd:#166534;
  --st-cancelled-base:#DC2626; --st-cancelled-fg:#B91C1C; --st-cancelled-bg:#FEF2F2; --st-cancelled-bd:#FECACA;
  --st-late-base:#BE123C;      --st-late-fg:#BE123C;      --st-late-bg:#FFF1F2;     --st-late-bd:#FECDD3;

  /* ---------- مفردات مراحل SCPP — إسقاط، لا سلّم ثانٍ (§1-د) ---------- */
  --status-planned: var(--surface-600); --status-planned-bg: var(--surface-200); --status-planned-bd: var(--surface-300);
  --status-progress: var(--st-preparing-fg); --status-progress-bg: var(--st-preparing-bg); --status-progress-bd: var(--st-preparing-bd);
  --status-done: var(--st-approved-fg); --status-done-bg: var(--st-approved-bg); --status-done-bd: var(--st-approved-bd);
  --status-risk: var(--st-pending-fg); --status-risk-bg: var(--st-pending-bg); --status-risk-bd: var(--st-pending-bd);
  --status-delayed: var(--st-late-fg); --status-delayed-bg: var(--st-late-bg); --status-delayed-bd: var(--st-late-bd);
  --status-blocked: var(--st-cancelled-fg); --status-blocked-bg: var(--st-cancelled-bg); --status-blocked-bd: var(--st-cancelled-bd);

  /* ---------- طبقات الموافقة + ركيزة الرسوم (§1-و) ---------- */
  --tier-operator: var(--primary-500); --tier-jmc: var(--primary-700); --tier-mdoc: var(--primary-950);
  --chart-track: var(--surface-100); --chart-sep: var(--bg-card); --chart-neutral: var(--primary-700);

  /* ---------- الأزرار ----------
     حدّ الزرّ الثانوي: قيمة v2 --primary-200 تعطي 1.421 على البطاقة، وتعبئته
     --primary-50 تعطي 1.05 — فلا الحدّ ولا التعبئة يفصل الزرّ عن سطحه، وهو
     مكوّن واجهة يخضع لـ1.4.11. الحدّ يرتفع إلى --primary-500 = 3.678. */
  --btn-primary-bg:var(--primary-600); --btn-primary-hover:var(--primary-700);
  --btn-primary-active:var(--primary-800); --btn-primary-fg:#FFFFFF;
  --btn-secondary-bg:var(--primary-50); --btn-secondary-hover:var(--primary-100);
  --btn-secondary-active:var(--primary-200); --btn-secondary-fg:var(--primary-700);
  --btn-secondary-bd:var(--primary-500);
  --btn-ghost-fg:var(--text-2); --btn-ghost-hover:var(--bg-muted); --btn-ghost-active:var(--bg-inset);
  --btn-danger-bg:#DC2626; --btn-danger-hover:#B91C1C; --btn-danger-active:#991B1B; --btn-danger-fg:#FFFFFF;

  /* ---------- الشريط الجانبي ---------- */
  --side-bg: linear-gradient(180deg,#1E3A8A 0%,#172554 70%);
  --side-fg:#E0E7FF;
  /* ‏0.66 من v2 تعطي 4.019 فوق --side-hover عند قمّة التدرّج — نصّ يُقرأ تحت
     المؤشّر. رُفِعت إلى 0.75: 4.695 عند القمّة و6.235 عند القاع. */
  --side-fg-2: rgba(224,231,255,0.75);
  --side-active: rgba(255,255,255,0.12); --side-hover: rgba(255,255,255,0.07);
  --side-border: rgba(224,231,255,0.14); --side-count: rgba(224,231,255,0.16);
  --side-w: 260px; --side-w-min: 72px;

  /* ---------- الطباعة ---------- */
  --font-sans:'IBM Plex Sans Arabic','Segoe UI',system-ui,-apple-system,sans-serif;
  --font-mono:'JetBrains Mono',ui-monospace,'SF Mono',Menlo,Consolas,monospace;
  --t-display-1:44px; --t-display-2:32px; --t-h1:24px; --t-h2:20px; --t-h3:17px; --t-h4:15px;
  --t-body:14px; --t-body-sm:13px; --t-caption:12px; --t-micro:11px;
  --lh-tight:1.15; --lh-snug:1.3; --lh-normal:1.5; --lh-loose:1.65;
  --fw-regular:400; --fw-medium:500; --fw-semibold:600; --fw-bold:700;

  /* ---------- المسافات · الزوايا · الظلال ---------- */
  --space-1:4px; --space-2:8px; --space-3:12px; --space-4:16px; --space-5:20px;
  --space-6:24px; --space-7:32px; --space-8:40px; --space-9:48px; --space-10:64px;
  --r-xs:4px; --r-sm:6px; --r-md:8px; --r-lg:12px; --r-pill:999px;

  --shadow-1:inset 0 1px 0 rgba(255,255,255,0.65),0 1px 2px rgba(15,23,42,0.05),0 1px 3px rgba(15,23,42,0.06);
  --shadow-2:inset 0 1px 0 rgba(255,255,255,0.75),0 2px 4px rgba(15,23,42,0.06),0 10px 22px rgba(30,58,138,0.10);
  --shadow-3:inset 0 1px 0 rgba(255,255,255,0.6),0 4px 12px rgba(15,23,42,0.09),0 14px 30px rgba(30,58,138,0.10);
  --shadow-pop:inset 0 1px 0 rgba(255,255,255,0.5),0 16px 40px rgba(15,23,42,0.20),0 3px 8px rgba(15,23,42,0.08);
  --elev-rest:var(--shadow-1); --elev-hover:var(--shadow-2); --elev-overlay:var(--shadow-pop);
  --lift:-1px;

  /* ---------- البؤرة والحركة ---------- */
  --focus-color: var(--primary-600);
  --focus-color-on-dark: var(--secondary-400);
  --focus-width:2px; --focus-offset:2px;
  --focus-ring: var(--focus-width) solid var(--focus-color);
  --ease-out:cubic-bezier(0.2,0.8,0.2,1);
  --dur-fast:150ms; --dur-base:200ms; --dur-slow:250ms;

  color-scheme: light;

  /* ══ كتلة الجسر §1-ب تُلصق هنا حرفياً، وتُحذف كلها عند إتمام BUILD-2 ══ */
}

/* ════════════════════════════════════════════════════════════════════════
   الوضع الداكن — داخل @media screen عمداً.
   الطباعة ورقية دائماً، والورق أبيض. لفّ الكتلة بـ@media screen هو ما يجعل
   المطبوع يعود إلى :root تلقائياً **بلا إعادة تعريف للوحة كاملة** — أي بلا
   مصدر حقيقة ثانٍ. لا تحوّلها إلى @media print { … } يعيد كتابة الألوان.
   ════════════════════════════════════════════════════════════════════════ */
@media screen {
  :root[data-theme='dark'] {
    --bg-page: var(--surface-900);
    --bg-card: var(--surface-800);
    --bg-muted: #26334B;
    --bg-inset: var(--surface-700);

    /* --text-3: قيمة v2 #94A3B8 تعطي 4.038 على --bg-inset، وهو سطح تهبط عليه
       تسميات .acc-rc__facts و.acc-triad__body و.cf-slug. فُتِّحت حتى 4.591.
       --text-muted: لا مكان لدرجة خامسة فوق أرضية AA في الداكن؛ الاندماج
       مُصرَّح به بدل أن يبقى صدفةً كما في tokens-v2.css (كانت الدرجتان #94A3B8). */
    --text-1: var(--surface-100);
    --text-2: var(--surface-300);
    --text-3: #A0AEC0;
    --text-muted: var(--text-3);
    --text-disabled: var(--surface-500);

    --border-1: rgba(148,163,184,0.16);
    --border-2: rgba(148,163,184,0.24);
    /* 0.45 من v2 = 2.29 على البطاقة. 0.82 → 5.083/4.339/3.849/3.245. */
    --border-control: rgba(148,163,184,0.82);
    --link: var(--primary-300);
    --mark-accent: var(--secondary-400);

    --st-pending-base:#F59E0B;   --st-pending-fg:#FBBF24;   --st-pending-bg:rgba(217,119,6,0.15);   --st-pending-bd:rgba(251,191,36,0.32);
    --st-approved-base:#22C55E;  --st-approved-fg:#4ADE80;  --st-approved-bg:rgba(34,197,94,0.13);  --st-approved-bd:rgba(74,222,128,0.32);
    --st-preparing-base:#8B5CF6; --st-preparing-fg:#C4B5FD; --st-preparing-bg:rgba(124,58,237,0.17); --st-preparing-bd:rgba(167,139,250,0.34);
    --st-delivered-base:#22C55E; --st-delivered-fg:#BBF7D0; --st-delivered-bg:#14532D;              --st-delivered-bd:#14532D;
    --st-cancelled-base:#EF4444; --st-cancelled-fg:#FCA5A5; --st-cancelled-bg:rgba(220,38,38,0.15); --st-cancelled-bd:rgba(248,113,113,0.32);
    --st-late-base:#FB7185;      --st-late-fg:#FDA4AF;      --st-late-bg:rgba(190,18,60,0.17);      --st-late-bd:rgba(251,113,133,0.32);

    --status-planned: var(--surface-300);
    --status-planned-bg: rgba(148,163,184,0.16);
    --status-planned-bd: rgba(148,163,184,0.30);

    --tier-operator: var(--primary-400); --tier-jmc: var(--primary-300); --tier-mdoc: var(--primary-100);
    --chart-track: var(--surface-700); --chart-neutral: var(--primary-300);

    /* الثلاثي معكوس: الأساس فاتح والتحويم أفتح والضغط يعود أعتم — والنصّ
       شبه أسود. #2563EB الذي يقترحه v2 كـactive يعطي 3.903 مع #020617. */
    --btn-primary-bg: var(--primary-400); --btn-primary-hover: var(--primary-300);
    --btn-primary-active: var(--primary-500); --btn-primary-fg: var(--surface-950);
    --btn-secondary-bg:rgba(59,130,246,0.14); --btn-secondary-hover:rgba(59,130,246,0.22);
    --btn-secondary-active:rgba(59,130,246,0.30); --btn-secondary-fg:var(--primary-300);
    --btn-secondary-bd:rgba(96,165,250,0.32);
    --btn-ghost-hover:rgba(148,163,184,0.12); --btn-ghost-active:rgba(148,163,184,0.2);
    /* #EF4444 الذي يقترحه v2 كـhover يعطي 3.763 مع الأبيض. الثلاثي 700/600/800. */
    --btn-danger-bg:#B91C1C; --btn-danger-hover:#DC2626; --btn-danger-active:#991B1B;

    --side-bg: linear-gradient(180deg,#111C36 0%,var(--surface-900) 70%);
    --side-fg:var(--primary-100); --side-fg-2:rgba(219,234,254,0.6);
    --side-active:rgba(96,165,250,0.16); --side-hover:rgba(148,163,184,0.09);
    --side-border:rgba(148,163,184,0.16); --side-count:rgba(148,163,184,0.16);

    --shadow-1:inset 0 1px 0 rgba(255,255,255,0.07),0 1px 2px rgba(2,6,23,0.4);
    --shadow-2:inset 0 1px 0 rgba(255,255,255,0.11),0 2px 4px rgba(2,6,23,0.4),0 10px 24px rgba(2,6,23,0.5);
    --shadow-3:inset 0 1px 0 rgba(255,255,255,0.09),0 4px 12px rgba(2,6,23,0.45),0 14px 30px rgba(2,6,23,0.45);
    --shadow-pop:inset 0 1px 0 rgba(255,255,255,0.09),0 16px 40px rgba(2,6,23,0.62),0 3px 8px rgba(2,6,23,0.4);

    --focus-color: var(--primary-400);
    color-scheme: dark;
  }
}
```

ثم مساعِدات الملف القائمة (`html{direction:rtl}`، `body`، `.display-1`…`.eyebrow`، `.mono/.num`، `:focus-visible`، `.ad-side :focus-visible`) تبقى كما هي بعد استبدال الأسماء؛ يُضاف إلى `body` انتقال 200ms للون والخلفية (v2)، ويُضاف `::selection` وحزمة شريط التمرير من v2.

---

## ٢. الخطوط — استضافة ذاتية، الـCDN ممنوع

**الحزمتان (وهما الاعتمادان الجديدان الوحيدان المسموح بهما):**

```
npm i -w @masaar/web @fontsource/ibm-plex-sans-arabic@^5 @fontsource/jetbrains-mono@^5
```

`@fontsource/ibm-plex-sans-arabic` **مثبَّت أصلاً** (`^5.2.9`). الجديد الحقيقي واحد: **`@fontsource/jetbrains-mono`**.

**`apps/web/src/main.tsx` — الاستيرادات النهائية (تحلّ محلّ الاثنتي عشرة الحالية):**

```ts
// خطوط ذاتية الاستضافة — لا CDN في الإنتاج (روابط Google في design-v2-ref محظورة)
import '@fontsource/ibm-plex-sans-arabic/400.css';
import '@fontsource/ibm-plex-sans-arabic/500.css';
import '@fontsource/ibm-plex-sans-arabic/600.css';
import '@fontsource/ibm-plex-sans-arabic/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';
import '@fontsource/jetbrains-mono/700.css';
```

**تُحذف:** الأوزان `300` من Plex Arabic (لا مستهلك: `--fw-regular` هو 400)، وحزمة `@fontsource/ibm-plex-sans` كاملة (٤ ملفات)، وحزمة `@fontsource/ibm-plex-mono` كاملة (٣ ملفات) — مع إزالة الاعتمادين من `apps/web/package.json`. **الأوزان أربعة لكل عائلة: 400/500/600/700**، مطابقةً لسلّم `--fw-*` وللرابط المحظور في المرجع نفسه.

**سلاسل الاحتياط:**
```
--font-sans: 'IBM Plex Sans Arabic','Segoe UI',system-ui,-apple-system,sans-serif;
--font-mono: 'JetBrains Mono',ui-monospace,'SF Mono',Menlo,Consolas,monospace;
```
`'Segoe UI'` تسبق `system-ui` لأنّ الاحتياط الحرج هو ويندوز العربي، وهو ما تقوله v2 حرفياً. `'IBM Plex Sans'` **تخرج** من السلسلة: العائلة العربية تغطّي اللاتيني، وإبقاء اسم لعائلة لم تعد محمَّلة = سطر ميت.

**ملاحظة تقنية إلزامية:** JetBrains Mono **لا تحتوي محارف عربية**. كل مستهلكي `--font-mono` عندنا جزر LTR (`.mono/.op-code/.num/.acc-mono/.rp-num`) — أي أرقام ورموز وتواريخ. **BUILD-2 يتحقّق أنّ أياً من هذه الأصناف لا يلفّ نصّاً عربياً**، وإلّا سقط ذلك النصّ إلى احتياط النظام وبان الفرق. المواقع المشبوهة للفحص: `.wz-kv b`، `.acc-triad__band`، `.ad-ladder__band`.

**الطباعة A4** تتبنّى الوجهين نفسيهما ولا تُستثنى: `.rp-page` يرث `--font-sans`، و`.rp-mono/.rp-num/.rp-metatbl td.v` ترث `--font-mono`. الطباعة تبقى **فاتحة دائماً** بالبناء (§٣-هـ). التباين على الورق الأبيض محسوب في §٥-و.

---

## ٣. معمارية الوضع الداكن

### ٣-أ. المفتاح والتخزين

- السمة على `<html>`: `data-theme="light" | "dark"` — **صريحة دائماً**. لا نعتمد على `@media (prefers-color-scheme)` في CSS، لأنّ سكربت ما قبل الرسم يحلّ التفضيل إلى قيمة صريحة، وهذا يترك للـCSS محدّداً واحداً للداكن (أبسط، وأسهل حراسةً).
- المفتاح: **`masaar.theme`** ∈ `'light' | 'dark'`. نقطة لا شرطة، **خارج مفاتيح الأعمال** (`masaar-operator-v10`, `masaar-session-v2`) — نفس عقد `masaar.nav.sec` و`masaar.whatsnew.w1` القائم، فلا تجرفه هجرة بيانات ولا تجرف هي تفضيل العرض.

### ٣-ب. التطبيق قبل الرسم (منع الوميض الأبيض)

في `apps/web/index.html`، **قبل** `<div id="root">`، سكربت متزامن بلا وحدات:

```html
<script>
  (function () {
    try {
      var s = localStorage.getItem('masaar.theme');
      var t = (s === 'light' || s === 'dark') ? s
        : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      document.documentElement.setAttribute('data-theme', t);
    } catch (e) { document.documentElement.setAttribute('data-theme', 'light'); }
  })();
</script>
```

`try/catch` إلزامي: `localStorage` يرمي في نافذة خاصة وفي متصفّح يمنع بيانات المواقع، والصفحة يجب أن تُرسَم فاتحة لا أن تنكسر.

### ٣-ج. الوحدة `apps/web/src/theme.ts` (جديدة، ~35 سطراً)

```ts
export type Theme = 'light' | 'dark';
export const THEME_KEY = 'masaar.theme';
export function readTheme(): Theme            // ما رُسم فعلاً: قراءة data-theme من <html>
export function applyTheme(t: Theme): void    // يكتب السمة + localStorage
export function toggleTheme(): Theme
export function watchSystemTheme(): () => void // يتبع النظام **فقط** ما لم يوجد تفضيل مخزَّن
```
`watchSystemTheme` يُركَّب مرّة في `App.tsx`، ويستمع لـ`matchMedia('(prefers-color-scheme: dark)')`؛ إن وُجد مفتاح مخزَّن **لا يفعل شيئاً** — اختيار المستخدم يغلب النظام دائماً. يعيد دالّة فكّ الاشتراك (تنظيف `useEffect`).

### ٣-د. المفتاح في الشريطين العلويين — واحد، مشترك

مكوّن جديد `apps/web/src/ThemeToggle.tsx`، يُركَّب في:
- `OperatorShell.tsx` → داخل `.op-top-actions`، **قبل** `.op-langbtn`.
- `AdminShell.tsx` → نفس الموضع في نسخته من الشريط.

```tsx
<button type="button" className="op-iconbtn" onClick={onToggle}
        aria-label={t('theme.toggle')} title={t(dark ? 'theme.toLight' : 'theme.toDark')}>
  <Icon name={dark ? 'sun' : 'moon'} size={16} />
</button>
```
**`aria-label` ثابت** («تبديل الوضع») و`title` هو المتغيّر — تسمية تتبدّل تربك قارئ الشاشة الذي يستعمل الأمر الصوتي.

**رمزان جديدان في `apps/web/src/operator/Icon.tsx`** (نفس نمط السجلّ القائم، مقتبسان حرفياً من `dashboard.dc.html:87-88`):
```ts
  moon: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
  sun:  'M12 2v2 M12 20v2 M4.93 4.93l1.41 1.41 M17.66 17.66l1.41 1.41 M2 12h2 M20 12h2 M4.93 19.07l1.41-1.41 M17.66 6.34l1.41-1.41',
```
و`sun` يُضاف إلى `extra()`: `case 'sun': return <circle cx="12" cy="12" r="4" />;`

**مفاتيح i18n (تكافؤ ar/en تامّ، تُضاف إلى القاموسين معاً):**
| المفتاح | ar | en |
|---|---|---|
| `theme.toggle` | تبديل الوضع | Toggle theme |
| `theme.toDark` | التحوّل إلى الوضع الداكن | Switch to dark |
| `theme.toLight` | التحوّل إلى الوضع الفاتح | Switch to light |

### ٣-هـ. الطباعة فاتحة قسراً

**الآلية الأساسية بلا كلفة:** كتلة الداكن ملفوفة بـ`@media screen` (§١-ز). في الطباعة لا تُطبَّق، فتبقى `:root` الفاتحة — **بلا إعادة تعريف للوحة، أي بلا مصدر حقيقة ثانٍ.**

**التكميل الإلزامي** في `report.css` (الشيء الوحيد الذي لا تحلّه الآلية أعلاه هو الطبقات التي ترث من `<html>` وسياق التركيب):
```css
@media print {
  :root { color-scheme: light; }
  html, body { background: #FFFFFF; }
  /* لا تُعاد كتابة أي لون هنا: الكتلة الداكنة معطّلة أصلاً خارج الشاشة. */
}
```
وتبقى قواعد `@media print` القائمة في `report.css` و`styles.css` كما هي.
**التحقّق اليدوي (لا يُمسك باختبار وحدة):** فتح `#/…/report` في الوضع الداكن ← معاينة الطباعة ← الصفحة بيضاء وحبرها أسود.

### ٣-و. جرد التدقيق الداكن — كل سطح على حدة

| السطح | الحالة اليوم | المطلوب |
|---|---|---|
| **`charts.css`** | يستهلك `--ink-*`، `--status-*`، `--tier-*`، `--chart-*` فقط | يتلوّن ذاتياً بعد الهجرة ✅. **الاستثناء الوحيد:** `.ch-hist__col:hover .ch-hist__bar { background: var(--brand-navy-800) }` ← يصبح `var(--link)` |
| **`.op-devbadge`** (شارة المحاكاة) | `--status-risk-bg` + `--status-risk` | يتلوّن ذاتياً ✅ — الزوج الناعم مُعرَّف في الوضعين |
| **`toast.css`** | `--brand-navy-800` + `--ink-on-dark` — **لوح نيلي صلب لا يعرف الوضعين** | يُعاد تصميمه إلى تشريح v2: بطاقة + شريط 3px على حافّة البداية (§٤-ز). بعدها يتلوّن ذاتياً |
| **`whatsnew.css`** | `--brand-navy-50/100/700/800` | ↦ `--primary-50/200/700`، ويصبح داكناً بالتبعية |
| **الشريط الجانبي للإدارة** | `--brand-navy-900` صلب + عنصر نشط كهرماني | ↦ `--side-bg` (تدرّج مُعرَّف في الوضعين) + `--side-active`. **الشريطان يصبحان متطابقين** — انتهت مسألة «الصدفتان متعاكستان» (§٦-٤) |
| **`report.css`** | `#fff` صلب على `.rp-page` | يبقى `#FFFFFF` صلباً **عمداً**: ورقة A4 بيضاء في الوضعين، وهذا ليس hex خاماً بل خاصّية المادّة. تعليق في الموقع |
| **`.op-topbar` / `.wz-top` / `.bar`** | `rgba(255,255,255,0.92)` صلب | ↦ `color-mix(in srgb, var(--bg-card) 80%, transparent)` كما في `dashboard.dc.html:73` |
| **الستائر** `.op-drawer` `.ad-modal` | `rgba(6,24,38,.35/.45)` | ↦ `rgba(2,6,23,0.5)` (قيمة v2) + `backdrop-filter: blur(4px)` |
| **`.m-skin--control`** | انعكاس نيلي مطبوخ يدوياً | **يُحذف** (§٤-ط) — الوضع الداكن *هو* الانعكاس |

---

## ٤. فروق المكوّنات — تغييرات على مستوى الصنف، بأسمائها

> **قاعدة عامّة لكل ما يلي:** لا يُنشأ صنف جديد إلا حيث نُصّ عليه صراحةً. كل قاعدة قديمة تُستبدل تُحذف من مكانها — **لا تُظلَّل بقاعدة أدناها**. لا `!important`.

### ٤-أ. الزوايا — التبنّي الشامل ٤/٦/٨/١٢

| الاستعمال | اليوم | v2 |
|---|---|---|
| زرّ، حقل، رقاقة صغيرة، خانة مصفوفة | `--r-sm 5px` / `--r-md 8px` / `7px`/`9px` حرفية | **`--r-sm` = 6px** |
| بطاقة، لوح، صفّ، صندوق | `--r-lg 12px` | **`--r-md` = 8px** |
| نافذة، دُرج، قائمة عائمة، لوحة كبيرة | `--r-xl 16px` | **`--r-lg` = 12px** |
| علامة دقيقة، حلقة بؤرة | `--r-xs 3px` | **`--r-xs` = 4px** |

**يُصطاد ويُحذف الرقم الحرفي** في: `.op-cta` (7px)، `.op-btn-ghost` (7px)، `.op-btn-nav` (7px)، `.wz-exit` (7px)، `.wz-in`/`.wz-ta` (9px)، `.wz-cardbtn` (11px)، `.wz-check` (9px)، `.op-drawer__item` (9px)، `.wz-done__audit` (7px)، `.ad-decision__go` (7px)، `.ctr-menu`… — كلها ↦ توكن.

### ٤-ب. الأزرار — ثلاثي + خطر

المرجع: showcase §٠٥. **الشكل الثابت لكل نوع: `height:34px · padding-inline:14px · --r-sm · 13px/600 · gap:7px`.**

```css
/* operator.css — يحلّ محلّ .op-btn-primary و .op-cta و .op-btn-nav و .wz-next
   و .file-here__cta و .file-tl__wiz (ستّ نسخ من زرّ واحد) */
.op-btn-primary {
  display:inline-flex; align-items:center; gap:7px;
  block-size:34px; padding-inline:14px; border:none; border-radius:var(--r-sm);
  background:var(--btn-primary-bg); color:var(--btn-primary-fg);
  font:inherit; font-size:var(--t-body-sm); font-weight:var(--fw-semibold);
  cursor:pointer; text-decoration:none; white-space:nowrap;
  transition: background var(--dur-fast) var(--ease-out),
              box-shadow  var(--dur-fast) var(--ease-out),
              transform   var(--dur-fast) var(--ease-out);
}
.op-btn-primary:hover, .op-btn-primary:focus-visible {
  background:var(--btn-primary-hover); box-shadow:var(--elev-hover);
  transform:translateY(var(--lift));
}
.op-btn-primary:active { background:var(--btn-primary-active); box-shadow:none; transform:none; }
.op-btn-primary:disabled { opacity:.45; cursor:not-allowed; }
```
- **الثانوي — صنف جديد `.op-btn-secondary`**، وهو المكوّن الوحيد الذي يضيفه v2 إلى ثلاثينا: `border:1px solid var(--btn-secondary-bd); background:var(--btn-secondary-bg); color:var(--btn-secondary-fg)`. يُصرَف على «تصدير الكشف» و«طباعة» — أفعال ليست الفعل الأساسي وليست محايدة تماماً.
- **الشبح `.op-btn-ghost`** — يوحَّد على الشكل الثابت (كان 28px/11.5px): `border:1px solid var(--border-control); background:transparent; color:var(--btn-ghost-fg)`، `:hover → var(--btn-ghost-hover)`، `:active → var(--btn-ghost-active)`.
- **الخطر `.op-btn-danger`** — يتوقّف عن كونه معدِّلاً على صنفين، ويصبح نوعاً رابعاً كاملاً على تشريح الأساسي بتوكنات `--btn-danger-*`. تُحذف من `admin.css` القواعد الأربع `.op-btn-ghost.op-btn-danger:hover` و`.op-btn-primary.op-btn-danger` و`…:hover`.
- **الحالتان الناقصتان من الـshowcase:** `[aria-busy='true']` (دوّار 13px + `cursor:progress`، إطار keyframe `spin` واحد يُضاف إلى `tokens.css`)، و`:disabled { opacity:.45 }` موحّدة.
- **`.op-cta` · `.op-btn-nav` · `.wz-next` · `.file-here__cta` · `.file-tl__wiz` · `.ad-decision__go` ✖ تُحذف كأصناف** وتُستبدل بـ`.op-btn-primary`. **`.wz-next--amber` ✖ يُحذف نهائياً** (كان يقول «الفعل الحاسم» بالكهرماني؛ الكهرماني صار حالة انتظار — واستعماله لفعل نهائي كذب دلالي). الفعل الحاسم يبقى `.op-btn-primary`، وحسمه تحمله كلمته لا لونه.
- **`.btn`/`.btn--primary`/`.btn--danger` في `styles.css`** ✖ — عائلة موازية للأزرار من طبقة ما قبل إعادة التصميم. تُهاجَر إلى `.op-btn-*` وتُحذف.

### ٤-ج. شارة الحالة `.m-pill`

المرجع: showcase §٠٦.
```css
.m-pill {
  display:inline-flex; align-items:center; gap:7px;
  padding-block:4px; padding-inline:12px;
  border-radius:var(--r-pill); border:1px solid transparent;   /* اللون من المعدِّل */
  font-size:var(--t-caption); font-weight:var(--fw-semibold);   /* كان medium */
  transition: background var(--dur-base) var(--ease-out),
              color      var(--dur-base) var(--ease-out);       /* «اللون يتحرّك لا الحجم» */
}
.m-pill::before { content:''; inline-size:6px; block-size:6px; border-radius:var(--r-pill); background:currentColor; }
.m-pill--planned { color:var(--status-planned); background:var(--status-planned-bg); border-color:var(--status-planned-bd); }
/* … الخمسة الباقية بنفس النمط */
```
- الحدّ (`-bd`) جديد؛ النقطة تنزل من 7px إلى 6px؛ الوزن يرتفع إلى 600.
- **مقاس مضغوط جديد `.m-pill--sm`** (`padding:2px 9px; font-size:var(--t-micro)`, نقطة 5px) — الـshowcase يخصّص صفاً كاملاً له «صغيرة — للجداول»، وجداولنا كثيفة فعلاً. يُصرَف في `.op-tbl` و`.acc-matrix`.
- **`.wz-check--on` تفقد `border:2px`**: قفزة حدّ من 1 إلى 2 تزحزح التخطيط. تصبح `box-shadow: inset 0 0 0 1px var(--status-done)`. نفس المعالجة لـ`.wz-cardbtn--on` و`.acc-tab--on` (الأخيرة تفعلها أصلاً — يُعمَّم النمط).

### ٤-د. رقاقة الطبقة `.ad-tier` / `.acc-role`

```css
.ad-tier {                        /* مربّعة الزوايا عمداً — تمييزها عن الشارة القرصية */
  display:inline-flex; align-items:center; gap:5px;
  block-size:22px; padding-inline:9px; border-radius:var(--r-sm);
  border:1px solid; font-size:var(--t-micro); font-weight:var(--fw-semibold); white-space:nowrap;
}
.ad-tier--operator { color:var(--tier-operator); background:var(--primary-50); border-color:var(--primary-200); }
.ad-tier--jmc      { color:var(--tier-jmc);      background:var(--primary-50); border-color:var(--primary-200); }
.ad-tier--mdoc     { color:var(--tier-mdoc);     background:var(--primary-50); border-color:var(--primary-200); }
```
داكن: الخلفية `rgba(59,130,246,0.14)` والحدّ `rgba(96,165,250,0.32)` — أي `--btn-secondary-bg/bd`، فلا قيمة جديدة. رقم الطبقة (ط١/ط٢/ط٣) يبقى `.mono` داخل الرقاقة كما في المرجع.

### ٤-هـ. الحقول والقوائم

المرجع: showcase §٠٧. **الشكل الثابت: `36px · --r-sm · 13px · border:1px solid var(--border-control)`.**
- `.wz-in` (40px/9px) · `.wz-ta` · `.bidderadd-in` (38px) · `.op-search__in` (34px) · `.field input` · `.notes-in` · `.date-in`/`.price-in` · `.bidder-in` · `.reg-range__in` · `.field select` · `.op-filter-select` · `.reg-select` · `.acc-scope-select` · `.reg-pager__size` → **كلها 36px / `--r-sm` / `--border-control`**. (المقاسان المضغوطان `.reg-range__in` 24px و`.reg-pager__size` 28px يبقيان استثناءً مصرَّحاً به بتعليق: يعيشان داخل مجموعة أفقية ضيّقة.)
- **البؤرة لا تبدّل الحدّ**: `outline:2px solid var(--focus-color); outline-offset:2px` مع بقاء `border-color` كما هي — قاعدة v2 الحرفية «بلا إزاحة تخطيط». تُحذف كل `:focus { outline: var(--focus-ring); outline-offset: 1px }` المتناثرة (٩ مواقع) لصالح قاعدة `:focus-visible` الواحدة في `tokens.css`.
- **الحقل المعطّل**: `background:var(--bg-muted); color:var(--text-disabled); border-color:var(--border-1)` — «opacity على النصّ لا على الحاوية» (المرجع). يحلّ محلّ `.date-in:disabled`.
- **حالة الخطأ — صنف جديد `.op-in--bad`**: `border:1.5px solid var(--st-cancelled-base)` + رسالة `.op-in__err { color:var(--st-cancelled-fg) }`. الـshowcase يخصّص لها بطاقة، ونماذجنا اليوم تعبّر عن الرفض بـ`.wz-gate` وحدها (نصّ بلا علامة على الحقل).
- **`<select>`**: `appearance:none` + سهم `chevron` مطلق على `inset-inline-end:10px` — أي `Icon name="chevronEnd"` مع `pointer-events:none`.

### ٤-و. الجداول `.op-tbl` / `.op-tablecard`

- `.op-tablecard`: `--r-lg` → **`--r-md`**، `--shadow-1` (يكتسب الإبراز الداخلي تلقائياً).
- `.op-tbl th`: `background: var(--bg-muted)` (كان `--bg-page`)، `color: var(--text-muted)`، `font-size: var(--t-micro)`، ويُحذف `letter-spacing:.06em` (المرجع لا يباعد رؤوس الأعمدة، والمباعدة تؤذي العربية).
- **فواصل عمودية جديدة**: `.op-tbl th + th, .op-tbl td + td { border-inline-start: 1px solid var(--border-1); }` — الـshowcase يفصل كل عمود بخيط. يزيد قابلية المسح في جدول كثيف.
- `.op-tbl td`: الحشو `13px 16px` → **`10px 16px`** (كثافة v2).
- `.op-tbl__row:hover/:focus-within` → `var(--bg-muted)` (قائم ✅). **الصفّ لا يُرفَع أبداً** — القاعدة القائمة تبقى بتعليقها.
- **الإجراءات السريعة عند التحويم**: `.op-rowbtns` تصبح `opacity:0` وتظهر عند `:hover`/`:focus-within` على الصفّ. ⚠️ **قيد إلزامي**: `opacity` لا `display:none` — وإلّا خرجت الأزرار من ترتيب Tab. وعلى شاشة اللمس تبقى ظاهرة: `@media (hover: none) { .op-rowbtns { opacity: 1 } }`.

### ٤-ز. التنبيه `.tv2-toast` — إعادة تصميم كاملة

المرجع: showcase §٠٩. اللوح النيلي الصلب ينتهي.
```css
.tv2-viewport { inset-block-end:22px; inset-inline-start:22px; inset-inline-end:auto;
                align-items:flex-start; }      /* أسفل البداية، لا وسط الشاشة */
.tv2-toast {
  display:flex; align-items:center; gap:10px;
  min-inline-size:260px; inline-size:min(440px, calc(100vw - 44px));
  padding-block:10px; padding-inline:14px;
  background:var(--bg-card); color:var(--text-1);
  border:1px solid var(--border-2);
  border-inline-start:3px solid var(--tv2-bar);
  border-radius:var(--r-md); box-shadow:var(--elev-overlay);
  font-size:var(--t-body-sm);
  animation: tv2-in var(--dur-base) var(--ease-out);
}
.tv2-toast--success { --tv2-bar: var(--st-approved-base); }
.tv2-toast--error   { --tv2-bar: var(--st-cancelled-base); }
.tv2-toast--warning { --tv2-bar: var(--st-pending-base); }
.tv2-toast__mark { background:none; color:var(--tv2-bar); }   /* أيقونة ملوّنة، لا قرص مملوء */
.tv2-toast__desc { color:var(--text-3); }
```
- ⚠️ **الشريط على `border-inline-start` هو استثناء واحد مصرَّح به لحاجز ذ١** («بلا أشرطة جانبية ملوّنة»): ذ١ يحمي **المكوّنات داخل الصفحة** من حمل الحالة بحافّة؛ التنبيه طبقة عابرة خارج تدفّق الصفحة، والـshowcase يعطيه الشريط في موضعين مستقلّين. يُكتب التعليق في الموقع.
- `EXIT_MS` في `Toasts.tsx` **120 → 150**، مع `--dur-fast`.
- تبقى `@keyframes tv2-in/tv2-out` وحارس تقليل الحركة كما هما.

### ٤-ح. النافذة والدُرج والقوائم العائمة

- `.ad-modal__card`: `--r-xl` → **`--r-lg` (12px)**، `--shadow-pop`، `border:1px solid var(--border-2)`.
- `.ad-modal` (الستارة): `rgba(2,6,23,0.5)` + `backdrop-filter:blur(4px)` + `animation: fade-in var(--dur-fast)`.
- `.ad-modal__card` يكتسب `animation: pop-in var(--dur-base) var(--ease-out)` — إطار جديد في `tokens.css`: `from{opacity:0;transform:scale(.985) translateY(4px)} to{opacity:1;transform:none}`.
- `.ad-modal__foot`: `background:var(--bg-muted)` (قائم عبر `--bg-page` — يُنقل)، وأزراره **يُسمّي المدمّر فعلَه** («إلغاء الطلبية»، لا «تأكيد») — قاعدة قائمة في `DESIGN.md`، يعيد المرجع تأكيدها.
- `.op-drawer__panel`: `border-inline-end:1px solid var(--border-2)`، `--shadow-pop`. حركة الدخول/الخروج `dr-in/dr-out` مع `--dr-dir` **تبقى كما هي** — ميراث `VISUAL-REFRESH-SPEC` §٢-٣ محفوظ، ويحرسه اختبار قائم.
- `.op-panel` / `.op-menu` / `.ctr-menu` / `.bell-panel`: `--r-lg`، `border:1px solid var(--border-2)`، `--shadow-3` (لا `--shadow-pop`: القائمة أقلّ ارتفاعاً من النافذة)، `animation: pop-in var(--dur-fast)`. تُحذف `border: 1px solid rgba(11,19,32,0.1)` الحرفية من `.op-panel`.

### ٤-ط. بطاقات KPI والشريط الجانبي والقشور

**بطاقة KPI (`.ad-kpi`, `.m-kpi`, `.ch-stat`):** التشريح القائم **يبقى** (تسمية + نقطة + قيمة mono + سطر وجهة) ويتغيّر شكله فقط: `--r-lg`→`--r-md`، `--elev-rest` بإبرازه الداخلي، القيمة `--t-display-2`ـمحدودة. ⛔ **لا تُتبنّى بطاقات KPI المملوءة بلون الحالة من `dashboard.dc.html`** — سببان: (١) حاجز ذ٣ («بلا كليشيه الرقم البطل»)؛ (٢) **تسقط في التباين**: `rgba(255,255,255,.9)` على `#D97706` = 2.865، و`#FFF` على `#16A34A` = 3.296 (§٥-هـ).

**الشريط الجانبي (`.op-side` + `.ad-side`) — يتوحّدان:**
```css
.op-side, .ad-side {
  inline-size: var(--side-w); background: var(--side-bg); color: var(--side-fg);
  border: none; --focus-color: var(--focus-color-on-dark);   /* حلقة تُقرأ على النيلي */
  transition: inline-size var(--dur-base) var(--ease-out);
}
.op-nav__btn, .ad-nav__btn { color: var(--side-fg-2); border-radius: var(--r-sm); }
.op-nav__btn:hover, .ad-nav__btn:hover { background: var(--side-hover); color: var(--side-fg); }
.op-nav__btn--on, .ad-nav__btn--on { background: var(--side-active); color: var(--side-fg); font-weight: var(--fw-semibold); }
.op-nav__count, .ad-nav__count { background: var(--side-count); color: var(--side-fg); }
```
- ⚠️ **هذا يُبطِل عمداً القرارَ المدوَّن في `VISUAL-REFRESH-SPEC` §٤-د** («الصدفتان متعاكستان ولا تُوحَّدان»). التبرير: ذلك القرار كان مشروطاً بسطحين متعاكسين (ورق فاتح ↔ نيلي داكن)؛ v2 يجعل الشريطين نيليَّين متدرّجين في الوضعين، فيسقط الشرط ويسقط معه القرار. **يُذكر الإبطال بالتعليق في `admin.css`** كي لا يُظنّ غفلة.
- **تعديل الحلقة `.ad-side :focus-visible` في `tokens.css`** يصبح `.op-side, .ad-side` — والاختبار الحارس §١ يُوسَّع للمحدّدين.
- **الطيّ إلى 72px:** `.op-shell` `grid-template-columns: var(--side-w) 1fr`، و`[data-side='min']` يبدّلها إلى `var(--side-w-min) 1fr`. زرّ الطيّ في تذييل الشريط (`aria-expanded`)، التفضيل في **`masaar.nav.min`**. عند الطيّ تُخفى التسميات لا الأيقونات، ويبقى `title` على كل رابط. **لا حركة ارتفاع** — قاعدة §٤-ج القائمة.
- **الشريط العلوي 58px:** `.op-topbar` و`.wz-top` و`.bar` كلها **58px** (كانت 56/54/متغيّرة)، بالزجاج المذكور في §٣-و.

**القشور `.m-skin` — تقليم:**
- `.m-skin--control` ✖ **يُحذف**: انعكاس نيلي مطبوخ يدوياً لم يعد له معنى بعد وجود وضع داكن حقيقي. تُحذف معه القواعد الستّ التابعة (`.m-skin--control .m-clause`, `.m-rail__fill`, `.m-step--now .m-step__c`, `.m-path__no`, `.skin-stage input[type=range]`, `.m-skin--control` نفسها). **لا مستهلك له في المنتج** — `SKINS.control` غير مستدعى في أي شاشة.
- `.m-skin--blueprint` **يبقى**: مستهلك واحد حيّ (`PathsGuide.tsx:32`)، وشبكته الهندسية بلاغة شرح لا انعكاس ثيمة. تُهاجَر متغيّراته إلى `--primary-*`، وشبكته إلى `rgba(30,58,138,.055)`.
- `.m-skin` الأساسي **يبقى** كغلاف يعيد `--m-*` — لكن **يُقلَّم إلى ما يُستهلك فعلاً**؛ `--m-acc` و`--m-accbar` يفقدان مستهلكيهما مع حذف قشرة التحكّم ← ✖.

### ٤-ي. مكوّنات في الـshowcase ولا نظير لها عندنا — قائمة منفصلة

| المكوّن | الحكم | السبب |
|---|---|---|
| **Skeleton** (`shimmer`) | ⛔ **مؤجَّل — لا مستهلك بعد** (كان مكتوباً «✅ يُبنى في BUILD-2»؛ صُحِّح إلى الواقع) | لا سطح يستهلك هيكلاً اليوم: المتجر محلّي، وحتى في وضع الـAPI يبدأ من `emptyState()` ثم يُرطَّب **بلا راية «قيد التحميل»** تقرأها شاشة (`store.tsx` — `loadState()` و`useEffect` الترطيب). شحن `.sk*` الآن = أصناف بلا مستدعٍ، وهو ما تحظره قاعدة «صفر غير مستعمل». يُبنى مع أوّل شاشة **تُعلن** انتظارها. → دَين مسمّى في `ops/POST-V2-IMPROVEMENTS.md` §ب. |
| **الشارة المضغوطة `--sm`** | ✅ يُبنى | §٤-ج |
| **الزرّ الثانوي** | ✅ يُبنى | §٤-ب |
| **حالة الخطأ على الحقل** | ✅ يُبنى | §٤-هـ |
| **صناديق المراحل / المسار المصغّر** (StageRail) | ⛔ **لا يُبنى في هذه الموجة** | تشريح شاشات **الطلبيات**، وليس لدينا سجلّ طلبيات ولا نقاط نهاية له. بناؤه الآن = واجهة مختلقة (القانون الحاكم). عندنا `.file-tl__*` و`.op-segs` لمراحل المناقصة، ويكفيان. → دَين مسمّى مع `--st-delivered-*`. |
| **لوحة الأوامر Ctrl+K** | ⛔ | لا عقد توجيه ولا فهرس بحث موحّد. اقتراح للعميل (§٦-٦). |
| **منتقي المدى الزمني (هجري/ميلادي)** | ⛔ | لا حقل يستهلك مدى تاريخ في هذه الموجة؛ `RangeFilter` يغطّي المدى المالي. اقتراح (§٦-٦). |
| **كانبان سحب وإفلات** | ⛔ | لا نقطة نهاية لنقل حالة بالسحب. |
| **قائمة تغيير الحالة بالتأكيد المضمّن** | ⛔ | التزام قائم: كل التزام حوكمي يمرّ بـ`Modal` بمعاينة الحالة البعدية. تأكيد مضمّن يخفّض هذا العقد. |
| **الرأس الزجاجي + مفتاح الوضع** | ✅ | §٣-د و§٤-ط |

---

## ٥. تدقيق التباين — **أعدتُ حساب كل زوج بنفسي**

المنهج: WCAG 2.x، sRGB بتصحيح جاما، **غير مقرَّب قبل المقارنة**، وكل لون شفّاف مركَّب فوق سطحه المعتم. أُخضِع كل لون نصّ لأسوأ الأسطح الأربعة (`--bg-page/card/muted/inset`) لا لأفضلها، لأنّ لون النصّ عندنا ليس محكوماً بسطح واحد — وهي القاعدة التي فرضها اختبارنا القائم.

**النتيجة الإجمالية: ٢٢٢ زوجاً مفحوصاً · ٤١ إخفاقاً.** ادّعاء الملف «AA-checked» **غير صحيح كما كُتب**. أدناه كل إخفاق برقمه وقيمتي المصحَّحة.

### ٥-أ. إخفاقات الوضع الفاتح

| # | الزوج | مقيس | الأرضية | القيمة المصحَّحة | بعد التصحيح |
|---|---|---|---|---|---|
| ل١ | `--text-muted #64748B` على `--bg-muted` / `--bg-inset` | **4.344 / 3.860** | 4.5 | **`#5A687D`** | 5.409 / 5.659 / 5.165 / **4.590** |
| ل٢ | `--st-pending-fg #B45309` على `--bg-inset` | **4.073** | 4.5 | **`#A84D08`** | 5.381 / 5.630 / 5.139 / **4.567** · على زوجه 5.429 |
| ل٣ | `--st-approved-fg #15803D` على `--bg-inset` | **4.069** | 4.5 | **`#147739`** | 5.385 / 5.634 / 5.143 / **4.570** · على زوجه 5.382 |
| ل٤ | `--border-control #94A3B8` على الأسطح الأربعة — والملف يكتب بجانبه «≥3:1» | **2.451 / 2.564 / 2.340 / 2.080** | 3 | **`#788496`** | 3.623 / 3.791 / 3.460 / **3.075** |
| ل٥ | `--btn-secondary-bd #BFDBFE` على `--bg-card` — وتعبئته `#EFF6FF` تعطي 1.05، فلا شيء يفصل الزرّ عن سطحه (1.4.11) | **1.421** | 3 | **`var(--primary-500)`** | 3.678 / 3.515 / 3.357 |
| ل٦ | `--tier-operator #3B82F6` على `--chart-track` = `--surface-200` | **2.983** | 3 | **`--chart-track: var(--surface-100)`** | 3.357 (والطبقتان الأخريان 6.117 / 13.414) |
| ل٧ | `--side-fg-2 rgba(224,231,255,.66)` فوق `--side-hover` عند قمّة التدرّج | **4.019** | 4.5 | **α = 0.75** | 4.695 قمّة · 6.235 قاع · 5.476 ساكناً |

### ٥-ب. الوضع الفاتح — ما صمد (عيّنة تمثيلية)

`--text-1` 14.48–17.85 · `--text-2` 8.40–10.36 · `--text-3` 6.15–7.58 · `--link` 5.44–6.70 · `--st-preparing-fg` 5.76–7.11 · `--st-cancelled-fg` 5.25–6.47 · `--st-late-fg` 5.10–6.29 · `--st-delivered-fg` على تعبئته 6.77 · الأبيض على الأساسي 5.169 / التحويم **6.702** / الضغط **8.722** · الأبيض على الخطر 4.83 / 6.47 / 8.31 · `--btn-ghost-fg` 8.40–10.36 · `--focus-color` 4.19–5.17 (أرضية 3) · `--side-fg` على طرفَي التدرّج **8.407 / 11.926** · `--focus-color-on-dark` عليهما 4.84 / 6.86 · النقاط (`--st-*-base`) 3.05–5.72 (أرضية 3).

> **تصحيح على هذه العيّنة (أُعيد حسابها كاملة).** رقمان كانا **مبالَغاً فيهما** في التمريرة الأولى: `--side-fg` على طرفَي التدرّج كُتِب 10.36 / 13.54 والصحيح **8.407 / 11.926**؛ والأبيض على تحويم/ضغط الزرّ الأساسي كُتِب 6.41 / 8.09 والصحيح **6.702 / 8.722**. الأربعة فوق الأرضية قبل التصحيح وبعده، فلا **قيمة** تتغيّر — يتغيّر **الادّعاء** وحده، وادّعاء أعلى من الحقيقة هو بالضبط ما يجعل قياساً لاحقاً يبدو انحداراً وليس هو. بقيّة العيّنة صمدت كما هي.

### ٥-ج. حالتان مصنَّفتان «ليست إخفاقاً» — بتصريح مكتوب

1. **`--border-1 #E2E8F0` (1.42) و`--border-2 #CBD5E1` (1.49)** — دون 3:1، وهذا **مقصود**: حدّ البطاقة زخرفة يعفيها WCAG 1.4.11 صراحةً. الفصل بين الزخرفي والوظيفي هو الغرض من وجود `--border-control` أصلاً. يُثبَّت باختبار: `--border-2 < 3 < --border-control`.
2. **`--text-disabled #94A3B8` (2.08–2.56)** — دون 3:1، وهذا **مقصود**: استثناء 1.4.3 للمكوّن غير القابل للتشغيل. يبقى الاختبار الدلالي القائم الذي يرفض التوكن في أي محدّد لا يحوي `:disabled`.
3. **حدود الشارات `--st-*-bd`** (1.1–1.3 على البطاقة) — الشارة ليست مكوّن واجهة قابلاً للتشغيل؛ نصّها ونقطتها يحملان المعنى ويتجاوزان 4.5. الحدّ زخرفة.

### ٥-د. إخفاقات الوضع الداكن

| # | الزوج | مقيس | الأرضية | القيمة المصحَّحة | بعد التصحيح |
|---|---|---|---|---|---|
| د١ | `--text-3` و`--text-muted` (كلاهما `#94A3B8`) على `--bg-inset #334155` | **4.038** | 4.5 | **`--text-3: #A0AEC0`** و**`--text-muted: var(--text-3)`** | 7.915 / 6.486 / 5.617 / **4.591** |
| د٢ | `--st-preparing-fg #A78BFA` على `--bg-inset` | **3.805** | 4.5 | **`#C4B5FD`** (violet-300) | 9.670 / 7.924 / 6.863 / **5.609** · على زوجه 7.022 |
| د٣ | `--st-cancelled-fg #F87171` على `--bg-inset` | **3.743** | 4.5 | **`#FCA5A5`** (red-300) | 9.406 / 7.708 / 6.675 / **5.456** · على زوجه 7.135 |
| د٤ | `--btn-primary-active #2563EB` مع `--btn-primary-fg #020617` | **3.903** | 4.5 | **الثلاثي 400/300/500**: `bg #60A5FA` · `hover #93C5FD` · `active #3B82F6` | 7.934 / 11.187 / **5.485** |
| د٥ | `--border-control rgba(148,163,184,.45)` على البطاقة/الصفحة | **2.290 / 2.412** | 3 | **α = 0.82** | 5.083 / 4.339 / 3.849 / **3.245** |
| د٦ | `--btn-danger-hover #EF4444` مع الأبيض | **3.763** | 4.5 | **الثلاثي 700/600/800**: `bg #B91C1C` · `hover #DC2626` · `active #991B1B` | 6.470 / **4.829** / 8.310 |
| د٧ | `--tier-jmc #3B82F6` على `--chart-track #334155`؛ **والسلّم غير رتيب** (jmc أعتم من operator، فينكسر ترتيب السلطة بصرياً) | **2.815** | 3 | **`400/300/100`**: `#60A5FA / #93C5FD / #DBEAFE` | 4.073 / 5.742 / **8.487** — ورتيب |

### ٥-هـ. مكوّنات المرجع التي **لا نتبنّاها** — وأرقام سقوطها (للتوثيق، لا للتنفيذ)

بطاقات KPI المملوءة وصناديق المراحل في `dashboard.dc.html` تفشل على نطاق واسع، وهذا سبب فنّي إضافي لرفضها فوق حاجز الذوق ذ٣:

| العنصر | مقيس | الأرضية |
|---|---|---|
| `rgba(255,255,255,.9)` تسمية على تعبئة `#D97706` | **2.865** | 4.5 |
| `#FFF` قيمة على `#D97706` | **3.186** | 4.5 |
| `rgba(255,255,255,.72)` سطر فرعي على `#D97706` | **2.348** | 4.5 |
| `rgba(255,255,255,.72)` على `#BE123C` | **3.795** | 4.5 |
| `#FFF` على تعبئة المرحلة المنجزة `#16A34A` | **3.296** | 4.5 |
| `rgba(255,255,255,.82)` وصف على `#16A34A` | **2.695** | 4.5 |
| `rgba(255,255,255,.82)` على `--surface-500` (مرحلة لم تبدأ) | **3.802** | 4.5 |

**التصحيح لو أُريد بناؤها لاحقاً:** التعبئة الكهرمانية تنزل من `#D97706` إلى **`#B36205`** (4.501)، والخضراء من `#16A34A` إلى **`#12893E`** (4.493)، **وتُلغى كل الشفافيات على النصّ الأبيض** — `rgba(255,255,255,.72)` لا يجتاز 4.5 على أي تعبئة حالة في اللوحة.

### ٥-و. الطباعة A4 (فاتحة قسراً) — كلها تجتاز

`--text-1` 17.853 · `--text-2` 10.355 · `--text-3` 7.578 · `--text-muted` 5.659 · `--link` 6.702 · `--tier-mdoc` 14.695 · `.rp-tbl th` أبيض على `--primary-900` **10.358** (كان النيلي القديم؛ لا انحدار).

---

## ٦. قرارات مسمّاة — تحتاج ردّ العميل قبل BUILD-2

| # | القرار | التفصيل | توصيتي |
|---|---|---|---|
| **١** | **الكهرماني يختفي من الهوية** | `--brand-amber-*` الستة تُحذف بلا بديل في العلامة. v2 لا يحوي كهرمانياً إلا كلون حالة انتظار. ٦٠ موقعاً في خمسة ملفّات. هذا **أكبر تغيير هوية** في الموجة، وهو الذي يحوّل «مسار» من «وثيقة دولة نيلية/كهرمانية» إلى «نظام نيلي بارد». | نعم — لكن **بقرار مكتوب من العميل**، لا كأثر جانبي لتبنّي رموز. |
| **٢** | **شعارات SVG ما زالت تحمل ألوان v1** | `apps/web/public/logo-mark.svg` (نيلي `#0B2540` + كهرماني `#C9892C`)، `logo.svg` و`logo-on-dark.svg` (نفس الزوج + نصّ «مسار» بلون `#0B2540`/`#F4F1EA`). تُستهلك في ٨ مواضع: أيقونة التبويب، صدفتا الشريط، الدخول، معالج الإعلان، **وثلاثة تقارير A4**. **لا أعيد تصميمها — أرفعها.** الشريط الجانبي يصبح نيلياً في الوضعين فيبقى `logo-on-dark.svg` مقروءاً؛ لكن `logo.svg` على `--bg-card` الداكن `#1E293B` سيقدّم نصّاً نيلياً `#0B2540` **غير مقروء** (شاشة الدخول والتقارير). | **قرار العميل مطلوب.** الحلّ الأدنى بلا إعادة تصميم: استعمال `logo-on-dark.svg` تلقائياً حين `data-theme='dark'` في الشاشات غير الورقية، وإبقاء `logo.svg` على صفحات A4 (بيضاء دائماً). **مؤجَّل بوصفه دَيناً مسمّى**، لا يُنفَّذ في هذه الموجة. |
| **٣** | **تبادل الهوية بين «قيد التنفيذ» و«موقوف»** | §١-د. كلفة إعادة تعلّم على مستخدم اعتاد النظام. | نعم، مع سطر شرح في `.wn` عند أول دخول. |
| **٤** | **الشريطان الجانبيان يتوحّدان** | يُبطِل قراراً موثّقاً في `VISUAL-REFRESH-SPEC` §٤-د. مبرَّر لأنّ شرطه (سطحان متعاكسان) سقط. | نعم. |
| **٥** | **`--dur-fast` 120→150ms** | يمسّ عقداً مثبَّتاً بين CSS و`Toasts.tsx` و`visualRefresh.test.tsx`. لا خطر، لكن يجب ألّا يُنفَّذ في ملف واحد دون الآخرين. | نعم، الثلاثة معاً في التزام واحد. |
| **٦** | **ما تركه المرجع غامضاً** | (أ) **مقاسا النصّ 12.5px و13.5px** يتكرّران في الـshowcase وليس لهما توكن — تُقرَّب إلى `--t-body-sm 13px` و`--t-h4`. (ب) **مسافة الحشو** في الـshowcase أرقام حرّة (18px 20px، 16px 18px) خارج سلّم الـ4px — تُقرَّب إلى `--space-4/--space-5`. (ج) **الدُرج بعرض 470px هنا و560px في اللوحة** — نثبّت 470px (عرض دُرجنا اليوم 440px، والقفزة إلى 560 تأكل نصف الشاشة). (د) **لا حالة `:visited`** لأي رابط. (هـ) **لا مواصفة استجابة تحت 860px** مع أنّ الشبكات مثبّتة الأعمدة. (و) لوحة الأوامر ومنتقي المدى والكانبان بلا عقد بيانات. | البنود أ–ج قُرِّرت أعلاه ولا تحتاج ردّاً؛ **د–و تحتاج ردّ العميل**: هل يُطلب بناء لوحة الأوامر ومنتقي المدى في موجة تالية؟ |
| **٧** | **إعادة كتابة «شخصية العلامة»** | نصّان في `PRODUCT.md` و`DESIGN.md` يصفان لوناً لم يعد موجوداً. مسوَّدتي أدناه. | نعم — تُطبَّق في BUILD-1 مع الرموز، لا بعدها. |

### ٦-٧-أ. مسوّدة `PRODUCT.md` § Brand Personality

> **الحالي:** *Institutional, calm, trustworthy. "State-grade document" not "startup dashboard": deep petroleum navy + sparing amber accent on warm paper neutrals. Authority comes from precision (clause citations, working-day math) rather than decoration.*
>
> **الجديد:**
> Institutional, calm, trustworthy. "Control room for a state process" — not a startup dashboard and no longer a paper file. Deep indigo carries identity from the sidebar gradient outward; cool slate is the ground; colour is spent only where it means something — a status, a deadline, an approval tier. There is no decorative accent: the palette has exactly one brand hue and one closed semantic vocabulary, and anything that is neither is grey. Authority comes from precision (clause citations, working-day math) and from a surface that reads identically at 8am on a projector and at 11pm in a dark room. Both themes are first-class; neither is a "mode" bolted onto the other.

### ٦-٧-ب. مسوّدة `DESIGN.md` §§ Theme · Color roles · Iconography

> **`## Theme`** — الحالي: *Warm-paper institutional light theme… No dark mode.*
> **الجديد:** Two first-class themes on one token set. `data-theme` on `<html>`, resolved before first paint from `masaar.theme` (falling back to the OS preference), toggled from both shells' topbars. Light is cool slate on white; dark is slate-900 on slate-800. **Print is always light** — the dark block lives inside `@media screen`, so paper needs no second palette. Indigo carries identity; the sky secondary marks *active/selected* and nothing else; status colour is a closed vocabulary and is never decoration.
>
> **`## Color roles`** — يُعاد كتابته على: `--primary-*` (نيلي 50→950، الأساسي 600) · `--secondary-*` (تركوازي، للنشط والتحديد والعلامة الحاملة لمعنى) · `--surface-*` (رمادي بارد 50→950، ومنه `--bg-page/card/muted/inset`) · حبر `--text-1/2/3/muted` + `--text-disabled` (استثناء 1.4.3) · حدود `--border-1/2` زخرفية و`--border-control` وظيفية عند 3:1 · الحالات الست بأزواجها الثلاثة `fg/bg/bd`، **مُسقَطة على عائلات `--st-*`** · الطبقات سلّم إضاءة داخل النيلي، لا حالة أبداً. **يُحذف سطر الكهرماني بالكامل.**
>
> **`## Iconography`** — يُضاف: `moon`/`sun` لمفتاح الوضع. **يبقى الحظر: لا إيموجي.**
>
> **`## Hard bans`** — يُضاف بندان: «لا لون يُكتب خارج `tokens.css`، ولا قيمة تُعرَّف مرّتين»؛ و«لا قاعدة تُظلَّل قاعدة قديمة — القديمة تُحذف».

---

## ٧. خريطة التنفيذ

### ٧-أ. BUILD-1 — الرموز · الخطوط · الوضعان · الحرّاس

| # | الملف | العمل |
|---|---|---|
| 1 | `packages/tokens/css/tokens.css` | يُعاد كتابته كاملاً بنصّ §١-ز + كتلة الجسر §١-ب. تُحذف `--brand-amber-*` و`--paper-400…900` و`--bg-dark` و`--font-display` و`--shadow-inset` و`--ease-in-out` و`--border-3`. تُضاف `@keyframes spin/pop-in/fade-in/shimmer` و`::selection` وشريط التمرير. |
| 2 | `packages/tokens/src/index.ts` | مرآة TS: `brand`→`primary`+`secondary`، `paper`→`surface`، `ink`→`text`، `status` يصبح `{fg,bg,bd}` **بالقيم المحلولة**، تُضاف `orderStatus` (الست `--st-*`)، `fonts` تتبنّى JetBrains، `motion.durFast` 120→150 و`durSlow` 320→250، **يُحذف `easeInOut`**. |
| 3 | `apps/web/package.json` | +`@fontsource/jetbrains-mono`؛ −`@fontsource/ibm-plex-sans`؛ −`@fontsource/ibm-plex-mono`. |
| 4 | `apps/web/src/main.tsx` | ٨ استيرادات خطوط بدل ١٢ (§٢). |
| 5 | `apps/web/index.html` | سكربت ما قبل الرسم (§٣-ب). |
| 6 | `apps/web/src/theme.ts` | **جديد** (§٣-ج). |
| 7 | `apps/web/src/ThemeToggle.tsx` | **جديد** (§٣-د). |
| 8 | `apps/web/src/operator/Icon.tsx` | `moon` + `sun` + فرع `extra()`. |
| 9 | `apps/web/src/i18n.ts` | ثلاثة مفاتيح `theme.*` في القاموسين. |
| 10 | `OperatorShell.tsx` · `AdminShell.tsx` | تركيب `<ThemeToggle/>`؛ `watchSystemTheme()` في `App.tsx`. |
| 11 | `apps/web/src/Toasts.tsx` | `EXIT_MS = 120` → `150`. |
| 12 | `apps/web/test/visualRefresh.test.tsx` | توسعة الحرّاس (§٧-ج). |
| 13 | `apps/web/src/charts/charts.css` | حذف كتلة `:root` المحلّية (رُقِّيت إلى `tokens.css`) وتعليقها. |
| 14 | `PRODUCT.md` · `DESIGN.md` | نصّ §٦-٧. |

**نهاية BUILD-1: التطبيق يعمل بلا تغيير بصري في المكوّنات (الجسر يحمل)، وقد صار له وضعان يعملان، وتُطبَع الصفحة فاتحة.** 947 اختباراً خضراء + الحرّاس الجديدة.

### ٧-ب. BUILD-2 — الأسطح، ملفاً ملفاً، مع تفكيك الجسر تدريجياً

**ترتيب مُلزِم** (كل خطوة تُنهي مستهلكي مجموعة من أسماء الجسر، فتُحذف تلك الأسماء **في نفس الخطوة**):

1. **`packages/ui/src/ui.css`** — `.m-pill` (+`--sm`)، `.m-kpi`، `.m-clause` (يخرج من الكهرماني)، `.m-meter`، `.m-rail`، `.m-verdict`، `.m-stepper`، `.m-path`؛ **حذف `.m-skin--control`** والقواعد الستّ التابعة؛ تقليم `--m-acc`/`--m-accbar`. ⇒ يُغلق `--ink-*`/`--paper-*` في هذا الملف.
2. **`apps/web/src/operator/operator.css`** (١١١٢ سطراً — الأثقل) — الشريط الجانبي، الشريط العلوي 58px، الأزرار (§٤-ب: ستّ نسخ تصبح واحدة)، الحقول (§٤-هـ)، الجدول (§٤-و)، الدُرج والنافذة (§٤-ح)، المعالجات، **حذف `.wz-next--amber`**، تحويل ٣٧ قيمة حرفية (hex/rgba) إلى توكنات. ⇒ يُغلق كل `--brand-amber-*` في هذا الملف (١٩ سطراً، ٢٤ إشارة).
3. **`apps/web/src/admin/admin.css`** — الشريط الداكن ↦ الموحّد، `.ad-nav__btn--on` يخرج من الكهرماني، `.ad-kpi`، `.ad-panel`، `.ad-tier`/`.acc-role` (§٤-د)، `.acc-*`، `.ctr-*`، حذف معدِّلات `.op-btn-danger` الأربعة، ٢٢ قيمة حرفية. ⇒ يُغلق الكهرماني (١١ سطراً، ١٦ إشارة).
4. **`apps/web/src/registry/registry.css`** — `.reg-select`/`.reg-pager__size`/`.reg-range__in` على شكل الحقل الثابت، `.reg-chip__x` حلقةً، `.ent-state` ↦ `--primary-*`. **يُحذف تكرار `.acc-count`** (مُعرَّف مرّتين).
5. **`apps/web/src/charts/charts.css`** — `.ch-hist__col:hover .ch-hist__bar` ↦ `--link`؛ `.ch-bar__track` يتبنّى `--chart-sep` بدل تعليق؛ لا شيء غيره (الملف نظيف أصلاً).
6. **`apps/web/src/toast.css`** — إعادة التصميم الكاملة (§٤-ز). ⇒ يُغلق `--ink-on-dark*`.
7. **`apps/web/src/whatsnew.css`** — ↦ `--primary-*`.
8. **`apps/web/src/styles.css`** — **حذف عائلة `.btn`/`.btn--primary`/`.btn--danger`** وهجرة مستدعيها إلى `.op-btn-*`؛ `.bar` 58px + الزجاج؛ `.dtable`/`.tabs`/`.seg`/`.bell*`؛ `.skin-stage` ↦ `--ease-out`+`--r-lg`؛ `.score__track`/`.hbar__track` ↦ `--chart-track`.
9. **`apps/web/src/report/report.css`** — `--brand-navy-*` ↦ `--primary-*`، تعليق «الورقة بيضاء عمداً»، تأكيد وراثة الوجهين.
10. **Skeleton** — ⛔ **لم تُنفَّذ: مؤجَّلة — لا مستهلك بعد.** كانت الخطوة تقول `.sk*` + `@keyframes shimmer` في `registry.css` وتوصيلها بحالة الجلب في `EmptyState`/`PaginationBar`؛ لا حالة جلب معلَنة في أيّهما، ولا في المتجر (§٤-ي). حُذِف `shimmer` من `tokens.css` لأنّه بقي إطاراً بلا مستهلك. → دَين مسمّى في `ops/POST-V2-IMPROVEMENTS.md` §ب.
11. **`packages/tokens/css/tokens.css`** — **حذف كتلة الجسر كاملة.** هذه الخطوة الأخيرة، وهي الدليل على اكتمال الهجرة: أي مرجع متبقٍّ يفشل البناء فوراً.

### ٧-ج. توسعة الاختبارات الحارسة — `apps/web/test/visualRefresh.test.tsx`

الملف اليوم يفكّ `:root` من `tokens.css` عبر CSSOM. **يجب أن يفكّ الوضعين.** التعديلات الدقيقة:

1. **`parse()` تجمع من كتلتَي الجذر لا من واحدة.** `visit()` يجمع اليوم من `r.selectorText === ':root'` فقط، وقاعدة الداكن ملفوفة بـ`@media screen` (التي يعبرها `visit` عبر `r.cssRules`) ومحدّدها `:root[data-theme='dark']`. تصبح:
   ```ts
   const decls: Record<string,string> = {};      // فاتح
   const darkDecls: Record<string,string> = {};  // داكن
   if (r.selectorText === ':root') collect(r, decls);
   else if (r.selectorText === ":root[data-theme='dark']") collect(r, darkDecls);
   ```
   ثم `resolveVar` تأخذ الخريطة معاملاً، و`tokenRgba(name, theme)` — **مع تراجع الداكن إلى الفاتح** لكل اسم لا يُعاد تعريفه داكناً (كما يفعل المتصفّح تماماً).
2. **كل وصف تباين قائم يصير `describe.each(['light','dark'])`** — سلّم الحبر، الحالات الست على زوجها وعلى الأسطح الأربعة، `--border-control` عند 3، `--mark-accent`، الطبقات على `--chart-track`.
3. **اختبارات جديدة** (بالأرقام أعلاه):
   - `--btn-*-fg` على `bg`/`hover`/`active` في الوضعين — ١٢ زوجاً، الأرضية 4.5. **هذا هو الاختبار الذي يمسك د٤ و د٦.**
   - `--btn-secondary-bd` ≥ 3 على `--bg-card` (يمسك ل٥).
   - `--side-fg` و`--side-fg-2` على **طرفَي التدرّج** وفوق `--side-hover` — يستخرج نقطتَي التوقّف من `--side-bg` نصّياً (يمسك ل٧).
   - **رتابة سلّم الطبقات**: `L(operator) > L(jmc) > L(mdoc)` فاتحاً، والعكس داكناً (يمسك د٧ — عيبٌ لا يمسكه فحص تباين).
   - **اكتمال العائلات**: الست `--status-*` بثلاثياتها، والست `--st-*` برباعيّاتها، في الوضعين.
   - **الإسقاط حرفي**: `--status-progress` يحلّ إلى نفس قيمة `--st-preparing-fg` (يمنع انفصال المفردتين مستقبلاً).
   - **حارس الجسر**: كل اسم داخل كتلة الجسر له ≥1 مستهلك في الملفّات الستة، **وإلّا فشل** (اسم ميت لا يُترك «للاحتياط»).
   - **حظر الكهرماني**: `expect(read(path)).not.toMatch(/--brand-amber/)` على الملفّات التسعة.
   - **حظر الـCDN**: `index.html` و`main.tsx` لا يحويان `fonts.googleapis.com` ولا `fonts.gstatic.com`.
   - **الطباعة فاتحة بالبناء**: نصّ `tokens.css` يُطابق `@media screen\s*\{[\s\S]*:root\[data-theme='dark'\]`، **ولا** يحوي `@media print` يعيد تعريف لون.
   - **مفتاح الوضع خارج مفاتيح الأعمال**: `THEME_KEY === 'masaar.theme'` و`!THEME_KEY.startsWith('masaar-operator')`.
   - **الشريطان يتقاسمان حلقة الداكن**: قاعدة `.op-side, .ad-side :focus-visible` موجودة وتضبط `outline-color: var(--focus-color-on-dark)`.
4. **تثبيت esbuild يغطّي الحالات الجديدة.** المصفوفة `SHEETS` تبقى تسعة مسارات، **لكن `it.each(SHEETS)` لا يكفي بعد اليوم**: كتلة الداكن داخل `@media screen` تُحوَّل مع الملف، بينما `index.html` لا. يُضاف:
   - تمرير ثانٍ على `tokens.css` بـ`{ loader:'css', minify:true }` — التصغير يعيد تحليل الاستعلامات المتداخلة ويكشف أخطاءً يتساهل عنها التمرير غير المصغَّر.
   - فحص أنّ `warnings` **و**`errors` كلاهما فارغ (اليوم يُفحص `warnings` وحده).
5. **يُحدَّث ما يثبّت القيم القديمة صراحةً:** `§2-5` (`--dur-fast` 120→150 و`EXIT_MS`)، ومطابقات `--ink-3 #5A6474` / `--ink-4 #656E7D` تنتقل إلى `--text-3 #475569` / `--text-muted #5A687D` مع الأسماء المحظورة الجديدة (`#94A3B8` لا يعود لوناً لنصّ حيّ في أي وضع).
6. **يبقى بلا مساس:** حارس `--ink-disabled` الدلالي (بعد إعادة تسميته `--text-disabled`)، كتلة تقليل الحركة العامّة في الملفّات الأربعة، حرّاس الدُرج `dr-in/dr-out`، حرّاس كاشف الشريط الجانبي، حرّاس `useCountUp`. **لا يُحذف اختبار قائم.**

### ٧-د. التحقّق — يُشغَّل في نهاية كل من BUILD-1 و BUILD-2

```bash
cd "c:/A coding/SCPP procedurees/masaar"
npm run typecheck        # نظيف
npx vitest run           # ≥947، وأي إخفاق يُعاد تشغيله مرّة (سباق i18n معروف)
npm run build            # صفر تحذير css-syntax
```
**عتبة إضافية:** حجم `dist/assets/*.css` لا يتجاوز **175 kB** (خطّ الأساس 164.64؛ الوضع الداكن يضيف كتلة جذر واحدة، والحذوفات تعوّض). تجاوزها = قواعد مُظلَّلة لم تُحذف.

### ٧-هـ. ما لا يُمسَك باختبار وحدة — فحص متصفّح إلزامي

| # | الفحص |
|---|---|
| ١ | لا وميض أبيض عند تحميل صفحة في الوضع الداكن (سكربت ما قبل الرسم يعمل). |
| ٢ | معاينة طباعة تقرير A4 وأنت في الوضع الداكن ← ورقة بيضاء بحبر أسود. |
| ٣ | ⛔ **مؤجَّل مع دَينه** — الشريط الجانبي المطويّ 72px (الأيقونات مركّزة، التلميحات تعمل، وحلقة البؤرة تُقرأ على التدرّج). لا فحص لأنّ لا رفَّ: `--side-w-min` بلا مستهلك، والطيّ سلوك (زرّ + تفضيل `masaar.nav.min`) خارج «مرئي فقط». → دَين مسمّى في `ops/POST-V2-IMPROVEMENTS.md` §ب، ويُفحَص يوم يُبنى. |
| ٤ | JetBrains Mono لا تسقط إلى احتياط النظام في أي جزيرة LTR (فحص المواقع الثلاثة المشبوهة في §٢). |
| ٥ | `.op-rowbtns` تبقى قابلة للوصول بـTab وهي شفّافة، وتظهر على اللمس. |
| ٦ | تبديل الوضع لا يهزّ التخطيط (لا مقاس يتغيّر مع الثيمة). |

---

## ٨. ما لا تفعله هذه المواصفة — ديون مسمّاة

1. **`--st-delivered-*`** — عائلة بلا مستهلك. مراجعة غروب **2026-12-31**.
2. **صناديق المراحل / المسار المصغّر (StageRail)** — تشريح شاشات الطلبيات؛ لا يُبنى بلا عقد بيانات.
3. **لوحة الأوامر Ctrl+K · منتقي المدى الهجري/الميلادي · الكانبان** — مؤجّلة، بانتظار ردّ العميل (§٦-٦).
4. **إعادة تصميم الشعارات** — مرفوعة كقرار (§٦-٢)، **لا تُنفَّذ هنا**.
5. **`--space-8/9/10`** — تبقى بوصفها تمام السلّم؛ إن لم يصرفها BUILD-2 فهي دَين يُراجَع مع كتلة الجسر.
6. **مواصفة الاستجابة تحت 860px** — v2 صامت عنها والمكسر القائم `@media (max-width: 860px)` يبقى كما هو. لا توسعة في هذه الموجة.
7. **`.m-skin--blueprint`** — يبقى بمستهلك واحد (`PathsGuide.tsx`). إن سقط مستهلكه، يسقط معه.
