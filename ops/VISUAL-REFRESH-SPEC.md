# مواصفة التحديث البصري — التباين والحركة والرسوم والملاحة

> **الحالة:** مواصفة تنفيذية — جاهزة للتسليم لوكيل منفّذ (لا تحتاج اجتهاداً تصميمياً)
> **التاريخ:** 2026-08-20
> **تسدّد:** «المرحلة ٣» + «المرحلة ٦» من `ops/CLIENT-FEEDBACK-PLAN.md`
> **طلب العميل الحاكم:** «هناك تكنيكات أحدث وأجمل لمشاريع مشابهة — اجعل الواجهات بتباين وتفاعلية أكثر» + داشبوردات غنية بإحصاءات لكل شركة ولكل طبقة + سايدبار رئيسي/ثانوي
> **عالم البيانات المستهدف:** ١٣ حقلاً · ١٢ شركة مشغّلة (MDOC نفط الوسط) · سلّم موافقات ثلاثي `OPERATOR | JMC | MDOC` بسقفَي 5M/10M — كما في `packages/scpp-rules/src/approvalTier.ts`
> **خط الأساس المقروء:** `packages/tokens/css/tokens.css` · `apps/web/src/operator/operator.css` (980 سطراً) · `admin/admin.css` (251) · `registry/registry.css` (80) · `packages/ui/src/ui.css`

---

## ٠. حواجز الذوق — تُطبَّق على كل بند أدناه بلا استثناء

هذه ليست توصيات؛ هي شروط قبول. أي مخرج يخالف واحدة منها يُرَدّ.

| # | القاعدة | التبرير |
|---|---|---|
| ذ١ | **بلا أشرطة جانبية ملوّنة** (`border-inline-start: 3px solid …`) على أي مكوّن جديد | محظورة أصلاً في `DESIGN.md` § الحظر الصارم؛ الحالة تُحمَل بـ`StatusPill` أو `TierChip` لا بحافة |
| ذ٢ | **بلا نص متدرّج** (`background-clip: text`) ولا زجاجية (`backdrop-filter` خارج الشريطين العلويين القائمين) | سجلّ «وثيقة رسمية» لا «لوحة SaaS» |
| ذ٣ | **بلا كليشيه الرقم البطل** — لا رقم يتجاوز `--t-display-2` (32px)، ولا بطاقة إحصاء تحتلّ عرض الشاشة | الكثافة مرحّب بها؛ الاستعراض لا |
| ذ٤ | **زر أساسي مملوء واحد لكل سطح** (`.op-btn-primary`) — الباقي `.op-btn-ghost` | قاعدة قائمة في `DESIGN.md`؛ الرسوم والبطاقات القابلة للنقر **ليست** أزراراً أساسية |
| ذ٥ | **الألفة قبل الجِدّة** — مستوى Linear/Stripe من الهدوء، لا الإبهار. أي أثر بصري لا يخدم قراءة رقم يُحذف | مستخدمون إداريون كبار السن تحت ضغط مواعيد |
| ذ٦ | **كل عنصر تفاعلي يُبلَغ بلوحة المفاتيح** — `<a>`/`<button>` حقيقيان، لا `<div onClick>`، ولا `tabindex` على عناصر SVG | قانون قائم (`.acc-open`, `.op-tbl__row`) |
| ذ٧ | **بلا بطاقات متداخلة** — الرسم يعيش داخل `.ad-panel` مباشرة، لا داخل بطاقة داخل لوحة | حظر قائم |
| ذ٨ | **بلا اختلاق**: كل رقم/اتجاه/شريحة من المخزن. إن تعذّر اشتقاق قيمة سابقة للمقارنة، **يُحذف سطر الاتجاه كاملاً** ولا يُقدَّر | القانون الحاكم للتصميم كله |
| ذ٩ | **خصائص منطقية فقط** (`inline-size`, `inset-inline-*`, `padding-inline`) — ولا `left/right` مادية | RTL أصيل |
| ذ١٠ | **بلا hex خام في المكوّنات** — كل لون من `var(--…)`؛ التوكنات المصدر الوحيد | حظر قائم |

---

## ١. جرد التباين الحالي والقيم المقترحة

### ١-أ. المنهج

نِسَب التباين محسوبة بمعادلة WCAG 2.x النسبية (`(L1+0.05)/(L2+0.05)`، sRGB بتصحيح جاما) على القيم الفعلية في `tokens.css`.
العتبات: **٤٫٥:١** للنص العادي (كل ما دون 18.66px عادي / 14px عريض — أي **كل** نص في هذا التطبيق عملياً، فأكبر نص متن هو 14px) · **٣:١** للنص الكبير ولحدود عناصر التحكّم والعلامات الرسومية (WCAG 1.4.11).

### ١-ب. جدول الجرد (محسوب، لا مقدَّر)

**الأحبار على الأسطح:**

| الحبر | القيمة | `--bg-page` #FBF9F4 | `--bg-card` #FFFFFF | `--bg-muted` #F4F1EA | `--bg-inset` #ECE7DC | الحكم |
|---|---|---|---|---|---|---|
| `--ink-1` | `#0B1320` | 17.69 | 18.61 | 16.50 | 15.09 | ✅ سليم |
| `--ink-2` | `#364254` | 9.67 | 10.17 | 9.02 | 8.25 | ✅ سليم |
| `--ink-3` | `#6B7686` | **4.38 ✗** | 4.60 | **4.08 ✗** | **3.73 ✗** | ❌ يسقط على ٣ من ٤ أسطح |
| `--ink-4` | `#98A1B0` | **2.48 ✗** | **2.61 ✗** | **2.31 ✗** | **2.11 ✗** | ❌ يسقط حتى عن عتبة ٣:١ |

**خطورة `--ink-3`:** هو لون **كل** التسميات في النظام — `.op-page__sub` · `.ad-kpi__l` · `.ad-panel__s` · `.op-task__meta` · `.op-tbl th` · `.caption` · `.micro` · `.reg-pager__range` · `.wz-cond__t`. سطر الوصف تحت كل عنوان صفحة يسقط اليوم عند 4.38.

**خطورة `--ink-4`:** ليس محصوراً في «العنصر النائب/المعطّل» كما يزعم `DESIGN.md`؛ هو يحمل **محتوى حقيقياً**:
`.op-tbl__code` (رموز المناقصات في الجداول، 11.5px) · `.file-tl__dates` و`.file-tl__month` (تواريخ الخط الزمني) · `.op-drawer__irange` (مدى المرحلة، 10px) · `.op-group__count` · `.op-notif__time` · `.file-tl__later` · `.acc-cell--no`. رمز مناقصة عند **2.61:1** غير مقروء عملياً — وهذا حرفياً ما يشكو منه العميل.

**ألوان الحالة على خلفياتها الناعمة** (الاستعمال الأغلب: `StatusPill`/`.m-pill` و`.ad-panel__count` و`.op-task__due`):

| الحالة | fg | bg | النسبة | الحكم |
|---|---|---|---|---|
| `planned` مخطط | `#4B5972` | `#E6E8EE` | 5.77 | ✅ |
| `progress` قيد التنفيذ | `#1E6FB3` | `#DCEAF7` | **4.31 ✗** | ❌ قصور طفيف |
| `done` منجز | `#1F7A4D` | `#DBEEDF` | **4.38 ✗** | ❌ قصور طفيف |
| `risk` تحذير | `#B5751F` | `#FAEFD4` | **3.32 ✗** | ❌ **الأسوأ** — وهو لون «بانتظار التصديق» و`.op-devbadge` |
| `delayed` متأخر | `#B23535` | `#F8DEDB` | 4.77 | ✅ |
| `blocked` موقوف | `#6B4FB5` | `#E6DFF7` | 4.77 | ✅ |

**الحدود والعلامات الرسومية (عتبة ٣:١ — WCAG 1.4.11):**

| التوكن | القيمة المركّبة فوق `--bg-card` | النسبة | الحكم |
|---|---|---|---|
| `--border-1` α=0.08 | `#EBECED` | 1.18 | مقبول كفاصل زخرفي داخل بطاقة (مُستثنى) |
| `--border-2` α=0.14 | `#DDDEE0` | **1.35 ✗** | ❌ **يحدّ عناصر تحكّم**: `.wz-in` · `.wz-ta` · `.reg-select` · `.op-filter-select` · `.op-btn-ghost` · `.wz-chip` · `.wz-cardbtn` · `.acc-open` — الحد هو الشيء الوحيد الذي يقول «هذا حقل إدخال» |
| `--border-3` α=0.22 | `#C9CBCE` | 1.63 | ضعيف كحالة hover دالّة |
| `--brand-amber-500` كعلامة | `#C9892C` | **2.96 ✗** | ❌ يحمل معنى في `.file-tab--on` (تسطير التبويب النشط) و`.file-tl__today` (خط اليوم) و`.op-notif__dot` |

**الشريط الجانبي الداكن (`--brand-navy-900` #061826):** سليم بالكامل — `--ink-on-dark` 15.96 · `--ink-on-dark-2` 9.26 · `--brand-amber-400` 8.24 · `#DDE2E9` 13.83.
ملاحظة نظافة (لا تباين): `.ad-side__credit-l` يستعمل `var(--ink-4)` فوق سطح داكن — يعمل (6.91) لكنه إساءة استعمال لطبقة التوكنات: `--ink-4` معرّف للسمة الفاتحة. **يُبدَّل إلى `var(--ink-on-dark-2)`** — تغيير قيمة `--ink-4` أدناه سيكسره وإلا.

**حلقة البؤرة:** `:focus-visible` في `tokens.css:201` تستعمل `--brand-navy-600` بإزاحة 2px.
- فوق سطح فاتح: الحلقة مجاورة للورق من الجانبين → 8.25 على البطاقة، 7.84 على الصفحة ✅
- **فوق الشريط الجانبي الإداري (navy-900): 2.18 ✗** — البؤرة غير مرئية عملياً في السايدبار كلّه.

### ١-ج. القيم الجديدة المقترحة (hex، مطابقة لتنسيق الملف القائم)

> **مبدأ حاكم:** الأسطح لا تُمَسّ — الورق الدافئ والنِيلي البترولي هما الهوية. **نُغمِّق الأحبار فقط.** كل قيمة أدناه تحافظ على درجة اللون (hue) نفسها وتزيد العتمة.

```css
/* ---------- Ink (text) — تغميق التباين (موجة ٦أ) ----------
   ink-3 و ink-4 كانا يسقطان عن 4.5:1 على الورق؛ الأسطح لم تتغيّر. */
--ink-1: #0B1320;       /* بلا تغيير — 15.09…18.61 */
--ink-2: #364254;       /* بلا تغيير — 8.25…10.17  */
--ink-3: #5A6474;       /* كان #6B7686 → الآن 4.85…5.98 على كل الأسطح */
--ink-4: #656E7D;       /* كان #98A1B0 ثم #666F7E → الآن 4.17…5.15 على كل الأسطح */
--ink-disabled: #98A1B0; /* جديد — قيمة ink-4 القديمة، لمُحدِّد `:disabled` وحده
                            (WCAG 1.4.3 يستثني النصّ داخل مكوّن **غير قابل للتشغيل**) */
--ink-on-dark: #F4F1EA;  /* بلا تغيير */
--ink-on-dark-2: #B6BAC3;/* بلا تغيير */
```

| التوكن | قديم | جديد | page | card | muted | inset |
|---|---|---|---|---|---|---|
| `--ink-3` | `#6B7686` | **`#5A6474`** | 5.69 ✅ | 5.98 ✅ | 5.30 ✅ | 4.85 ✅ |
| `--ink-4` | `#98A1B0` | **`#656E7D`** | 4.89 ✅ | 5.15 ✅ | 4.56 ✅ | 4.17 ✳ |

> **تصحيح (موجة ٦أ — مراجعة):** القيمة الوسيطة `#666F7E` كانت **4.4968** فوق `--bg-muted`، أي أنها لا تعبر 4.5:1 إلا إذا قُرِّب الرقم إلى منزلتين قبل المقارنة — و`--bg-muted` سطح حقيقي (`.op-tbl__code` في صف تحت المؤشّر · `.op-crumb__sep`). درجة واحدة أغمق تعبر العتبة فعلياً. علامة ✳ على `inset` هي **قاعدة موضع** لا نجاح: `--ink-4` لا يوضع داخل بئر `--bg-inset`.

`--ink-4` لم يعد «عنصراً نائباً» بل «بيانات هادئة مقروءة».

> **تصحيح جوهري (WCAG 1.4.3):** النسخة الأولى من هذا القسم أوجبت نقل علامات حيّة إلى `--ink-disabled` — وهذا **قراءة خاطئة للاستثناء**. الاستثناء يغطّي النصّ داخل **مكوّن غير قابل للتشغيل**، ولا يمتدّ إلى علامة معلوماتية داخل محتوى مفعّل مهما قصدنا لها أن تبدو هادئة. مصفوفة الصلاحيات ومتعقّب العقد وقائمة شروط المعالج كلها مفعّلة بالكامل.
> **يُصرَف `--ink-disabled` على `:disabled` فقط:** `.wz-next:disabled` · `.wz-prev:disabled`. لا شيء غيرهما، ولا في أي ورقة أخرى.
> **العلامات الأربع التي سُحبت من الاستثناء وأُعيدت إلى حبر مطابق:** `.acc-cell--no` → `--ink-3` فوق `--bg-card` (5.98، وكان 2.61) · `.acc-cell--session` → `--ink-3` **مع إزالة `opacity: 0.5`** (كان التكديس يهبط بها إلى 1.55) · `.ctr-stage__dot--todo` → `--ink-3` فوق `--bg-muted` (5.30، وكان 2.31؛ وهو **رقم المرحلة**، أي نصّ) · `.wz-cond__m` → `--ink-3` فوق `--paper-200` (4.85، وكان 2.11). `.file-tl__later` كلمة في عمود بيانات وتبقى على `--ink-4` (5.15). `.wz-check__m` لونه `transparent` أصلاً ولا شأن له بالمسألة.
**تُبقى على `--ink-4` (صارت مقروءة):** `.op-tbl__code` · `.file-tl__dates` · `.file-tl__month` · `.op-drawer__irange` · `.op-group__count` · `.op-notif__time`.
**تُبدَّل إلى `--ink-on-dark-2`:** `.ad-side__credit-l` (admin.css:52).

```css
/* ---------- Semantic — status colors (تغميق ثلاثة فقط) ---------- */
--status-planned:    #4B5972;   /* بلا تغيير — 5.77 */
--status-planned-bg: #E6E8EE;
--status-progress:    #1B65A4;  /* كان #1E6FB3 → 4.98 على bg الخاص */
--status-progress-bg: #DCEAF7;
--status-done:        #1C7046;  /* كان #1F7A4D → 5.01 */
--status-done-bg:     #DBEEDF;
--status-risk:        #8F5915;  /* كان #B5751F ثم #945D17 → 5.09 (كان 3.32 — الأسوأ) */
--status-risk-bg:     #FAEFD4;
--status-delayed:     #B23535;  /* بلا تغيير — 4.77 */
--status-delayed-bg:  #F8DEDB;
--status-blocked:     #6B4FB5;  /* بلا تغيير — 4.77 */
--status-blocked-bg:  #E6DFF7;
```

| الحالة | قديم | جديد | على bg الخاص | على card | على page | على inset |
|---|---|---|---|---|---|---|
| `progress` | `#1E6FB3` | **`#1B65A4`** | 4.98 ✅ | 6.10 | 5.79 | 5.24 |
| `done` | `#1F7A4D` | **`#1C7046`** | 5.01 ✅ | 6.08 | 5.78 | 5.23 |
| `risk` | `#B5751F` | **`#8F5915`** | 5.09 ✅ | 5.82 | 5.53 | 4.72 ✅ |

> **تصحيح:** الجدول كان يقيس كل لون حالة على `bg` الخاص به فقط. لون الحالة ليس محبوساً في شارة: هو لون **كلمة** أيضاً (`.wz-gate` · `.op-dev` · `.file-tl__done`) ويحطّ حيث تحطّ. `#945D17` كان **4.44** فوق `--bg-inset` — ساقط. `#8F5915` يعبر 4.5:1 على `bg` الخاص **وعلى الأسطح الأربعة**، وهذا الآن شرط مثبَّت في الاختبار لكل الحالات الست.

> **أثر جانبي مقصود:** `--status-risk` كان يساوي `--brand-amber-600` بالقيمة تماماً. الفصل الآن **تنظيف**: `--brand-amber-600` درجة هوية، `--status-risk` معنى دلالي؛ اقترانهما كان مصادفة. لا يُعاد ربطهما.

```css
/* ---------- الحدود — فصل الزخرفي عن الدالّ ---------- */
--border-1: rgba(11, 19, 32, 0.10);   /* كان 0.08 — فاصل شعري داخل البطاقة (زخرفي، مستثنى) */
--border-2: rgba(11, 19, 32, 0.20);   /* كان 0.14 — محيط بطاقة/لوحة */
--border-3: rgba(11, 19, 32, 0.30);   /* كان 0.22 — قوي / حالة hover */
--border-control: rgba(11, 19, 32, 0.48); /* جديد — 3.16…3.30 فوق الأسطح الأربعة */
```

> **تصحيح:** ألفا `0.46` كانت تعطي 3.08 / 3.12 / 3.03 فوق page/card/muted و**2.99** فوق `--bg-inset`. عتبة تصمد على ثلاثة أسطح من أربعة ليست عتبة بل قاعدة موضع لا يقدر أحد على إنفاذها؛ `0.48` تشتري السطح الرابع (3.27 / 3.30 / 3.22 / 3.16).
> **`--border-focus` حُذف:** كان `var(--focus-color)` بلا مرجع واحد في المستودع. اسم بلا قارئ ليس «مصدر حقيقة واحداً» بل شيفرة ميتة، وهو الاسم الذي سيغيّره تعديل لاحق بدل التوكن الحيّ. `--focus-color` هو المصدر الوحيد.

**`--border-control` إلزامي على:** `.wz-in` · `.wz-ta` · `.wz-chip` (غير المفعّل) · `.wz-check` (غير المفعّل) · `.wz-cardbtn` (غير المفعّل) · `.wz-draft` · `.op-btn-ghost` · `.op-filter-select` · `.reg-select` · `.reg-pager__size` · `.acc-open` · `.acc-scope-select` · `.bidderadd-in` · `.file-doc__up` · `.op-langbtn`.
لا يُطبَّق على: `.op-tablecard` · `.ad-panel` · `.file-card` · `.op-drawer__item` (محيطات بطاقات = زخرفية، تبقى `--border-1`/`--border-2`).

```css
/* ---------- علامة الإبراز الرسومية ---------- */
--mark-accent: var(--brand-amber-600);  /* #B5751F — 3.80:1 فوق البطاقة */
```
**تُستبدل بها `--brand-amber-500` (2.96) في المواضع الدالّة فقط:** `.file-tab--on` (`border-bottom-color`) · `.file-tl__today` (خط اليوم) · `.file-tl__leg-today` · `.op-notif__dot`.
**تبقى `--brand-amber-500` كما هي** حيث تعمل خلفيةً لا علامةً: `.ad-nav__btn--on` (نص navy-900 فوقها = 6.09 ✅) · `.wz-next--amber` · `.ctr-stage__dot--now`.

```css
/* ---------- سلّم الارتفاع (Elevation) — ثلاثة أسماء دلالية ---------- */
--shadow-2: 0 2px 4px rgba(11,19,32,0.07), 0 6px 14px rgba(11,19,32,0.06); /* عُمّق قليلاً */

--elev-rest:    var(--shadow-1);    /* بطاقة مستقرّة على الورق */
--elev-hover:   var(--shadow-2);    /* صف/بطاقة مرفوعة تحت المؤشر أو البؤرة */
--elev-overlay: var(--shadow-pop);  /* كل ما يطفو: قائمة، دُرج، نافذة، تنبيه، تلميح */
--lift: -1px;                        /* مقدار الرفع الوحيد المسموح */
```
ثلاثة مستويات فقط — لا رابع. `--shadow-3` يبقى للتوافق (`.wz-done__card`) ولا يُستعمل في جديد.
**قاعدة:** الارتفاع يتغيّر فقط عند تغيّر حالة تفاعل؛ لا بطاقة تُولد بـ`--elev-hover`.

```css
/* ---------- حلقة البؤرة ---------- */
--focus-color:         var(--brand-navy-600);   /* 8.25 على البطاقة، 7.84 على الصفحة */
--focus-color-on-dark: var(--brand-amber-400);  /* 8.24 فوق navy-900، 7.10 فوق navy-800 */
--focus-width:  2px;
--focus-offset: 2px;
--focus-ring: var(--focus-width) solid var(--focus-color);
```
```css
/* tokens.css — يستبدل الكتلة القائمة عند السطر 201 */
:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
  border-radius: var(--r-xs);
}
/* السطح الداكن: النِيلي على النِيلي = 2.18 — العنبر هو الحل الوحيد فوق navy-900 */
.ad-side :focus-visible { outline-color: var(--focus-color-on-dark); }
```
> **لماذا الإزاحة تكفي على الفاتح:** بإزاحة 2px تجلس الحلقة على لون الصفحة لا على الزر، فجيرانها من الطرفين هما الورق (8.25) — يُستوفى شرط ٣:١ مع كلا المجاورَين دون حلقة مزدوجة. على `.ad-side` الجار هو navy-900 من الطرفين، فلزم تبديل اللون لا الشكل.

### ١-د. توكنات الطبقات (تُستعمل في §٣ و§٥)

```css
/* ---------- سلّم الموافقات — سُلّم سلطة ترتيبي، وليس حالة ---------- */
--tier-operator: var(--brand-navy-500);   /* #2E6BA1 — 5.62 فوق البطاقة */
--tier-jmc:      var(--brand-navy-700);   /* #143A5E — 11.69 */
--tier-mdoc:     var(--brand-navy-900);   /* #061826 — 18.00 */

--tier-operator-bg: var(--brand-navy-50);   --tier-operator-fg: var(--brand-navy-600); /* 7.39 */
--tier-jmc-bg:      var(--brand-navy-100);  --tier-jmc-fg:      var(--brand-navy-700); /* 9.34 */
--tier-mdoc-bg:     var(--brand-navy-800);  --tier-mdoc-fg:     var(--bg-card);        /* 15.52 */

--chart-track:   var(--bg-inset);     /* مسار الشريط/الحلقة الفارغ */
--chart-sep:     var(--bg-card);      /* الفاصل بين شرائح متجاورة — 2px دائماً */
--chart-neutral: var(--brand-navy-600); /* التعبئة الأحادية للمدرّج (8.25) */
```

---

## ٢. مواصفة الحركة

**السجلّ:** product. **الميزانية:** 150–250ms، تغذية راجعة على تغيّر حالة **فقط**. لا كوريوغرافيا دخول، لا حركة عند التمرير، لا تأخير متتالٍ (stagger).
**الرموز المتاحة:** `--dur-fast: 120ms` · `--dur-base: 200ms` · `--ease-out: cubic-bezier(0.2,0.8,0.2,1)`. لا تُضاف رموز مدّة جديدة.

### ٢-٠. الكتلة العامة لتقليل الحركة (ناقصة اليوم — تُضاف أولاً)

الوضع الحالي: `operator.css:932` يغطي **٣ محدِّدات فقط**؛ `admin.css` و`registry.css` بلا تغطية إطلاقاً. تُضاف الكتلة التالية إلى **آخر** `operator.css` و**آخر** `admin.css` (كلٌّ يُحمَّل في بوّابته):

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```
> `0.01ms` لا `0` — الصفر يمنع إطلاق `transitionend`/`animationend`، وهو ما تعتمد عليه دورة خروج الدُرج والتنبيه.

### ٢-١. عدّ تصاعدي لأرقام المؤشرات

**لا يُكتب من جديد.** الخطّاف موجود فعلاً داخل `packages/ui/src/KpiTile.tsx:12-48` (rAF + `IntersectionObserver` + ease-out تكعيبي + 600ms + احترام تقليل الحركة بالقفز إلى النهائي). المطلوب **استخراجه وتعميمه**، لأن `.ad-kpi` في `FollowUpRoom.tsx` — وهو مؤشر الإنتاج الفعلي — لا يستطيع استعمال `KpiTile` (فـ`.m-kpi` يعتمد على متغيّرات `--m-*` التي لا تُعرَّف إلا داخل `.m-skin`، وأصداف الإدارة/المشغّل ليست `.m-skin`).

`packages/ui/src/useCountUp.ts` (جديد):

```ts
import { useEffect, useRef } from 'react';

/** مدّة العدّ — ثابت TS لا توكن CSS: rAF لا يقرأ المتغيّرات المخصّصة. */
export const COUNT_UP_MS = 600;

export interface CountUpOpts {
  /** يُطفَأ عند تمرير false — الرقم يُطبع نهائياً فوراً */
  enabled?: boolean;
  /** التنسيق النهائي (fmtCount / fmtMoney / «٪»). يُستدعى لكل إطار. */
  format?: (n: number) => string;
}

/**
 * عدّاد تصاعدي بإطار الرسم فقط — بلا مكتبة، بلا مؤقّت متسلسل.
 * يبدأ عند دخول العنصر مجال الرؤية (مرة واحدة)، وينتهي حتماً على القيمة الحقيقية.
 * `prefers-reduced-motion` ⇒ يُكتب `format(target)` فوراً ولا يُنشأ أي rAF.
 */
export function useCountUp(target: number, { enabled = true, format = String }: CountUpOpts = {}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // القفز إلى النهائي: تقليل الحركة، أو إطفاء صريح، أو بيئة بلا IntersectionObserver
    if (!enabled || reduced || typeof IntersectionObserver === 'undefined') {
      el.textContent = format(target);
      return;
    }

    let raf = 0;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        const t0 = performance.now();
        const tick = (ts: number) => {
          const p = Math.min((ts - t0) / COUNT_UP_MS, 1);
          const eased = 1 - Math.pow(1 - p, 3);           // ease-out تكعيبي
          el.textContent = format(Math.round(target * eased));
          if (p < 1) raf = requestAnimationFrame(tick);
          else el.textContent = format(target);           // القيمة الحقيقية حرفياً في النهاية
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [target, enabled, format]);

  return ref;
}
```

**قواعد استعمال ملزِمة:**
1. `format` يجب أن يُمرَّر **مستقرّاً** (`useCallback` أو ثابت وحدة) — تمرير دالة مضمّنة يعيد تشغيل التأثير كل رسم فيعيد العدّ إلى الصفر بلا نهاية. **هذا أكثر خطأ متوقَّع في هذا البند.**
2. الأرقام لاتينية دائماً (`fmtCount(n, lang)`) — قانون م٠.
3. الحاوية `.ad-kpi__v` تحمل `font-variant-numeric: tabular-nums` (متوفّر عبر `--font-mono` + `'tnum'`) وإلا اهتزّ عرض الرقم مع كل إطار. تُضاف `min-inline-size` مساوية لعرض القيمة النهائية إن ظهر ارتجاف.
4. **يُطفَأ العدّ على النِسَب المئوية داخل الجداول** وعلى أي رقم يتغيّر نتيجة فلترة المستخدم — العدّ للكشف الأول لا للتحديث. `enabled={false}` عند إعادة الحساب بعد فلترة.
5. لا يُطبَّق على المبالغ المالية (`fmtMoney`) — رقم مالي يتصاعد يقرأ كأنه غير مستقرّ.

**التطبيق:** `FollowUpRoom.tsx` — استبدال `<span className="ad-kpi__v">{…}</span>` بـ`<span className="ad-kpi__v" ref={useCountUp(k.v, { format: fmtN })} />`.

### ٢-٢. رفع الصف عند التحويم (row-hover lift)

```css
/* operator.css — يستبدل .op-task:hover (السطر 290) */
.op-task {
  /* … كما هو … */
  transition:
    border-color var(--dur-base) var(--ease-out),
    box-shadow   var(--dur-base) var(--ease-out),
    transform    var(--dur-base) var(--ease-out);
}
.op-task:hover,
.op-task:focus-visible {
  border-color: var(--border-3);
  box-shadow: var(--elev-hover);
  transform: translateY(var(--lift));
}
```
`:focus-visible` يُضاف إلى **كل** قاعدة hover في هذه المواصفة — تفاعل يظهر بالمؤشر فقط لا يوجد لمستخدم لوحة المفاتيح (ذ٦).

صفوف الجداول لا تُرفَع (الرفع داخل `<table>` يكسر انطباق الحدود). لها تلوين فقط، ويُقوَّى:
```css
.op-tbl__row { transition: background var(--dur-fast) var(--ease-out); }
.op-tbl__row:hover, .op-tbl__row:focus-within { background: var(--bg-muted); }
```
**تقليل الحركة:** تُلغى المدد بالكتلة العامة (٢-٠)؛ التلوين والحد والظل تبقى تظهر فوراً — التغذية الراجعة محفوظة، الحركة وحدها تسقط. `transform` بقيمة 1px لا يزعج حتى مع تقليل الحركة، لكن الكتلة العامة تجعله فورياً على أي حال.

### ٢-٣. انزلاق الدُرج (QuickLook)

الحالة اليوم: `.op-drawer__panel` بلا أي انتقال — يظهر ويختفي فوراً. الدُرج **ينزلق من حافة البداية المنطقية** (`inset-inline-start: 0`)، فالاتجاه يجب أن ينعكس تلقائياً بين AR وEN.

```css
/* operator.css */
.op-drawer { animation: dr-fade var(--dur-base) var(--ease-out); }
.op-drawer__panel { animation: dr-in var(--dur-base) var(--ease-out); }

.op-drawer--closing { animation: dr-fade var(--dur-fast) var(--ease-out) reverse forwards; }
.op-drawer--closing .op-drawer__panel { animation: dr-in var(--dur-fast) var(--ease-out) reverse forwards; }

@keyframes dr-fade { from { opacity: 0; } to { opacity: 1; } }
/* الترجمة المنطقية: RTL يفتح من اليمين، LTR من اليسار — بلا كتلتين */
@keyframes dr-in {
  from { opacity: 0; transform: translateX(calc(var(--dr-dir) * 16px)); }
  to   { opacity: 1; transform: translateX(0); }
}
:root            { --dr-dir:  1; }
html[dir='ltr']  { --dr-dir: -1; }
```
> **قرار:** انزلاق **16px فقط** لا العرض الكامل (440px). الانزلاق الكامل عند 200ms يبدو متشنّجاً، وعند 320ms يخرج عن ميزانية السجلّ. الإزاحة القصيرة + التلاشي هي القراءة الهادئة نفسها التي يستعملها `tv2-in` أصلاً — واتّساقها مع التنبيه مقصود.

**دورة الإغلاق (TSX):** عند `onClose` يُضاف `op-drawer--closing`، ويُنتظر `animationend` على اللوحة ثم يُفكّ التركيب. مع تقليل الحركة تكون المدّة `0.01ms` فيصل الحدث فوراً — لذلك لم نستعمل `0`.
`Escape` يغلق (سلوك قائم في `useDialogA11y.ts`) ويُعاد التركيز إلى المُطلِق.

### ٢-٤. انزلاق تسطير التبويب

اليوم: `.file-tab--on { border-bottom-color: … }` — قفزة لونية، لا حركة. الحل بلا JS ولا قياس: مسطرة `::after` مطلقة داخل كل تبويب مع `transform: scaleX()`.

```css
/* operator.css — يستبدل .file-tab / .file-tab--on (السطران 615، 628) */
.file-tabs { position: relative; }
.file-tab {
  position: relative;
  /* … بقية الخصائص كما هي، مع حذف border-bottom … */
  border-bottom: none;
  padding-block-end: 11px;
  transition: color var(--dur-fast) var(--ease-out);
}
.file-tab::after {
  content: '';
  position: absolute;
  inset-inline: 0;
  inset-block-end: -1px;
  block-size: 2px;
  background: var(--mark-accent);
  transform: scaleX(0);
  transform-origin: center;
  transition: transform var(--dur-base) var(--ease-out);
}
.file-tab--on::after { transform: scaleX(1); }
.file-tab:hover { color: var(--ink-1); }
.file-tab--on { color: var(--ink-1); font-weight: var(--fw-semibold); }
```
`transform-origin: center` يجعل المسطرة تتفتّح من المنتصف — محايدة اتجاهياً، فلا تحتاج قلباً في LTR.
**تقليل الحركة:** الكتلة العامة تجعل `scaleX` فورياً — التسطير يظهر بلا تدرّج والمعنى محفوظ. اللون **ليس** الحامل الوحيد: الوزن يتغيّر أيضاً (`--fw-semibold`).
**تشريح ARIA للتبويبات (ناقص اليوم):** الحاوية `role="tablist"`، كل تبويب `role="tab"` + `aria-selected` + `aria-controls`، واللوحة `role="tabpanel"` + `aria-labelledby`. الأسهم يمين/يسار تتنقّل، `Home`/`End` للطرفين.

### ٢-٥. دخول/خروج التنبيه — **قائم، يُواءَم فقط**

`toast.css:84-96` يطبّق فعلاً `tv2-in`/`tv2-out` بـ`translateY(8px)` عند `--dur-base` مع `@media (prefers-reduced-motion)` يلغي الحركة. **لا يُعاد كتابته.** تعديلان اثنان فقط:
1. `box-shadow: var(--shadow-pop)` → `var(--elev-overlay)` (اسم دلالي، القيمة نفسها).
2. مدّة الخروج تُختصر إلى `--dur-fast`: الخروج يجب أن يكون أسرع من الدخول دائماً (سطر انسحاب لا سطر ظهور).
```css
.tv2-toast--out { animation: tv2-out var(--dur-fast) var(--ease-out) forwards; }
```
كل حركة جديدة في هذه المواصفة تتبع اتجاه `tv2-in` نفسه (تلاشٍ + إزاحة 8–16px) — لغة حركة واحدة للنظام كله.

### ٢-٦. هيكل عظمي متلألئ (skeleton) لوضع API

الحالة اليوم: في `isApiMode` تُعرض الشاشة فارغة أثناء الجلب. المطلوب صفوف شبحية بكثافة الجدول نفسها (لا دوّار — الدوّار يخفي البنية).

```css
/* registry.css — تُحمَّل في كلتا البوّابتين */
.reg-skel {
  --skel-base: var(--bg-inset);
  --skel-hi:   var(--bg-muted);
  background: var(--skel-base);
  border-radius: var(--r-sm);
  block-size: 12px;
  inline-size: 100%;
  position: relative;
  overflow: hidden;
}
.reg-skel--w40 { inline-size: 40%; }
.reg-skel--w60 { inline-size: 60%; }
.reg-skel--w80 { inline-size: 80%; }

.reg-skel::after {
  content: '';
  position: absolute;
  inset-block: 0;
  inset-inline-start: 0;
  inline-size: 60%;
  background: linear-gradient(90deg, transparent, var(--skel-hi), transparent);
  animation: reg-shimmer 1200ms linear infinite;
}
@keyframes reg-shimmer {
  from { transform: translateX(-100%); }
  to   { transform: translateX(266%); }   /* 160% / 0.6 — يعبر الصندوق كاملاً */
}

/* تقليل الحركة: نبضة عتامة بطيئة بدل مسح متحرّك — أو سكون تام عبر الكتلة العامة */
@media (prefers-reduced-motion: reduce) {
  .reg-skel::after { animation: none; content: none; }
  .reg-skel { background: var(--skel-base); }
}
```
**قواعد:** الهيكل يُعرض فقط بعد **200ms** من بدء الجلب (وميض الاستجابة السريعة أسوأ من لا شيء) · عدد الصفوف = `pageSize` الحالي · كل صف يحمل `aria-hidden="true"` والحاوية تحمل `aria-busy="true"` + `<span class="sr-only">جارٍ التحميل…</span>` · `linear` لا `ease` (المسح المتكرّر بمنحنى يبدو متعثّراً).

### ٢-٧. حكم المكتبات

**لا مكتبة. صفر تبعيات جديدة.** التبرير:

| ما نحتاجه | الكلفة يدوياً | ما تقدّمه مكتبة حركة |
|---|---|---|
| ٦ انتقالات، ٥ منها خاصية CSS واحدة | ~90 سطر CSS | نفس الشيء + وقت تشغيل |
| العدّ التصاعدي | **موجود أصلاً** (37 سطراً في `KpiTile.tsx`) — يُستخرج لا يُكتب | لا شيء |
| دخول/خروج الدُرج | keyframe + `animationend` | `AnimatePresence` |

لا يوجد في المواصفة كلها: انتقال تخطيطي مشترك (FLIP)، ولا فيزياء نابضية، ولا حركة مقيَّدة بالتمرير، ولا تسلسل زمني متعدّد العناصر — وهي الحالات الأربع الوحيدة التي تبرّر مكتبة حركة. إضافة واحدة إلى مستودع بستة مشاريع تعني سطح تبعية جديداً في تدقيق أمني وخط بناء لأجل ست انتقالات: **غير مبرَّر**.

**البند الوحيد القابل لإعادة النظر لاحقاً — وبقرار عميل صريح لا افتراضاً:** دوران الأرقام بأسلوب العدّاد الميكانيكي (رقم يُدحرَج خانةً خانة بدل استبداله). هذا هو الأثر الوحيد الذي تكون كتابته يدوياً مكلفة فعلاً (قياس عرض كل خانة + عمود مترجم لكل رقم + تعامل مع تبديل الأرقام العربية/اللاتينية). **الحكم الحالي: لا حاجة إليه** — العدّ التصاعدي البسيط يحقّق «الحيوية» التي طلبها العميل. إن طُلب لاحقاً: يُسعَّر ويُقَرّ كبند مستقلّ، مع قياس حجم الحزمة المضاف وفحص سلوكه تحت `direction: rtl` **قبل** التبنّي.

---

## ٣. مواصفة الرسوم التفاعلية (SVG مشتقّ — بلا مكتبات رسم)

### ٣-٠. مبدأ حاكم: SVG حيث تُلزِم الهندسة فقط

| الرسم | الوسيط | لماذا |
|---|---|---|
| (أ) أشرطة الشركات | **CSS grid + `<span>`** | مستطيلات على محور واحد — SVG هنا يخسر: يفقد النقل بلوحة المفاتيح، ويُلزم قياس الخط، ويعقّد RTL |
| (ب) دونات الطبقات | **SVG** | أقواس — لا مقابل لها في CSS بلا حيل تدهور |
| (ج) مدرّج الإنجاز | **CSS grid + `<span>`** | مستطيلات رأسية |
| (د) شريط الالتزام | **SVG `<polyline>`** | خط متعدّد النقاط |

**نمط الإتاحة الموحّد لكل الرسوم:**
- عنصر `<svg>` **دائماً** `aria-hidden="true" focusable="false"` — رسم بحت.
- الطبقة المتاحة هي دائماً عناصر HTML حقيقية (`<a>`/`<li>`) تحمل الأرقام نصّاً.
- **لا `role="img"`** على رسم تفاعلي: يخفي محتواه الداخلي عن القارئ الشاشي، ويجعل الشريحة القابلة للنقر غير موجودة تقنياً.
- **لا `tabindex` على عناصر SVG** (ذ٦). حيث توجد شريحة قابلة للنقر، يوجد **دائماً** رابط مكافئ في وسيلة الإيضاح — الشريحة اختصار مؤشر، ووسيلة الإيضاح هي مسار لوحة المفاتيح.

### ٣-أ. ألوان الطبقات — القرار والتبرير

**الحكم: لا تُستعمل أيٌّ من توكنات الحالة الستّ للطبقات. الطبقات تُلوَّن بسلّم النِيلي البترودي التسلسلي.**

| المرشّح من الحالات | لماذا يصطدم |
|---|---|
| `--status-risk` (تحذير) لـJMC | يظهر على **الشاشة نفسها** كحقيقة دورة حياة (`.ad-decision__due`, `.op-devbadge`). قوس عنبري كبير سيُقرأ «هناك تحذير»، لا «هذه صلاحية اللجنة» |
| `--status-delayed` (متأخر) لـMDOC | أسوأ اصطدام: «فوق سقف JMC» ليس تأخّراً. الشاشة نفسها تعرض «مراحل متأخرة» بالقرمزي |
| `--status-done` (منجز) لـOPERATOR | اصطدام قريب — وهو أخطر من البعيد: «ضمن الصلاحية» ≠ «منجز» |
| `--status-blocked` (موقوف) لأي طبقة | يوحي بتعليق المناقصة |
| `--status-planned` (مخطط) | يُرى محايداً، لكن استعمال واحد من الستّة يكسر إغلاق المفردة الدلالية: من يستعمل ثلاثة يوماً ما؟ |

**البديل المعتمد:** الطبقة **متغيّر ترتيبي** (سُلّم سلطة متصاعد)، والقاعدة القياسية للمتغيّر الترتيبي هي **تدرّج إضاءة في درجة لون واحدة** لا قفزات لونية. النِيلي هو لون الهوية ولا يحمل أي معنى حالة في أي موضع من النظام — فهو الحرّ الوحيد.

| الطبقة | التوكن | القيمة | مقابل البطاقة | مقابل الصفحة | مقابل مسار الرسم |
|---|---|---|---|---|---|
| ط١ OPERATOR | `--tier-operator` | `#2E6BA1` | 5.62 ✅ | 5.35 ✅ | 4.56 ✅ |
| ط٢ JMC | `--tier-jmc` | `#143A5E` | 11.69 ✅ | 11.11 ✅ | 9.48 ✅ |
| ط٣ MDOC | `--tier-mdoc` | `#061826` | 18.00 ✅ | 17.11 ✅ | 14.60 ✅ |

**التبايُن بين الشرائح المتجاورة (2.08 و1.54) لا يُعتمد عليه — وهذا مقصود.** التمييز يُحمَل بثلاثة أشياء مجتمعة:
1. **فاصل 2px بلون `--chart-sep`** بين كل شريحتين متلاصقتين — دائماً، بلا استثناء.
2. **التسمية النصّية والرقم مطبوعان دائماً** بجوار كل علامة — اللون **لا يحمل معلومة وحده أبداً**.
3. **الترتيب ثابت** ط١ ← ط٢ ← ط٣ في كل رسم وكل وسيلة إيضاح، فالموضع نفسه يشفّر الطبقة.

**رقاقة الطبقة `TierChip`** (بديل `StatusPill` للطبقات — في `packages/ui`):
- شكل **مربّع الزوايا** `--r-sm` (5px)، بينما `StatusPill` قرصية `--r-pill` — الشكل وحده يمنع الخلط.
- بلا نقطة `::before` (النقطة توقيع `StatusPill`).
- تحمل رقماً أحادياً `ط١/ط٢/ط٣` بخط `--font-mono` + الاسم — فالرقاقة مقروءة بلا لون.
- ط٣ MDOC **مقلوبة** (نِيلي معتم مملوء + نص فاتح، 15.52). القلب لا تستعمله أي رقاقة حالة، فقمّة السلّم لا تُخطئ عيناً.

### ٣-ب. (أ) أشرطة المناقصات لكل شركة مشغّلة — ١٢ شركة

**المصدر:** `state.operators` (١٢) × `state.tenders` (تجميع بـ`tenderMap.operatorId`)؛ القيمة `estimatedValueUSD`؛ الطبقة `approvalTierFor(t.estimatedValueUSD, tiers)`.
**القاعدة الصارمة:** تُعرض **الاثنتا عشرة كلها**، بما فيها من لا مناقصة لها — تُرسم بمسار فارغ و«—» مكان القيمة. حذف شركة صفرية يكذب على القارئ بأن الأسطول أصغر.
**الترتيب:** تنازلياً بالقيمة الإجمالية؛ الصفريّات في الذيل مرتّبة بترتيب المقارنة العربي (`arCompare`).

```html
<figure class="ch">
  <figcaption class="ch__cap">
    <span class="ch__t">المناقصات لكل شركة مشغّلة</span>
    <span class="ch__s">القيمة التقديرية موزَّعة على طبقات الموافقة — ١٢ شركة</span>
  </figcaption>

  <ul class="ch-bars">
    <li>
      <a class="ch-bar"
         href="#/admin/tenders?op=OP-AHDAB"
         aria-label="الأحدب — 14 مناقصة بقيمة 132.4 مليون دولار: ضمن صلاحية المشغّل 8، اللجنة المشتركة 4، نفط الوسط 2. افتح السجل مصفّى على هذه الشركة.">
        <span class="ch-bar__name" dir="auto">الأحدب</span>
        <span class="ch-bar__track" aria-hidden="true">
          <span class="ch-bar__seg" data-tier="OPERATOR" style="inline-size:57.14%"></span>
          <span class="ch-bar__seg" data-tier="JMC"      style="inline-size:28.57%"></span>
          <span class="ch-bar__seg" data-tier="MDOC"     style="inline-size:14.29%"></span>
        </span>
        <span class="ch-bar__n num">14</span>
        <span class="ch-bar__v num">132.4M</span>
      </a>
    </li>
    <!-- … ١١ صفاً آخر … -->
  </ul>

  <ul class="ch-legend ch-legend--inline" aria-hidden="true"><!-- مفتاح الألوان الثابت --></ul>
</figure>
```

```css
/* charts.css */
.ch { margin: 0; display: flex; flex-direction: column; gap: 10px; }
.ch__cap { display: flex; flex-direction: column; gap: 2px; }
.ch__t { font-size: 14px; font-weight: var(--fw-semibold); color: var(--ink-1); }
.ch__s { font-size: 11.5px; color: var(--ink-3); }

.ch-bars { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.ch-bar {
  display: grid;
  grid-template-columns: minmax(96px, 1.1fr) 3fr 40px 78px;
  align-items: center;
  gap: 12px;
  padding-block: 7px;
  padding-inline: 10px;
  border-radius: var(--r-sm);
  text-decoration: none;
  color: inherit;
  transition: background var(--dur-fast) var(--ease-out);
}
.ch-bar:hover, .ch-bar:focus-visible { background: var(--bg-muted); }
.ch-bar:hover .ch-bar__v, .ch-bar:focus-visible .ch-bar__v { color: var(--ink-1); }

.ch-bar__name {
  font-size: 12.5px; color: var(--ink-2);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ch-bar__track {
  display: flex;
  gap: 2px;                       /* ← الفاصل بين الشرائح: 2px من لون الحاوية */
  block-size: 14px;
  background: var(--chart-track);
  border-radius: var(--r-pill);
  overflow: hidden;
}
.ch-bar__seg { display: block; block-size: 100%; min-inline-size: 3px; }
.ch-bar__seg[data-tier='OPERATOR'] { background: var(--tier-operator); }
.ch-bar__seg[data-tier='JMC']      { background: var(--tier-jmc); }
.ch-bar__seg[data-tier='MDOC']     { background: var(--tier-mdoc); }

.ch-bar__n, .ch-bar__v {
  font-family: var(--font-mono); direction: ltr; unicode-bidi: isolate;
  font-size: 12px; text-align: end; color: var(--ink-2);
  transition: color var(--dur-fast) var(--ease-out);
}
.ch-bar__n { color: var(--ink-3); }
```

**قواعد إلزامية:**
- `min-inline-size: 3px` على الشريحة: قيمة غير صفرية **لا تختفي أبداً**. الشرائح الصفرية لا تُصدَر أصلاً (لا `<span>` بعرض 0).
- `gap: 2px` هو الفاصل — أنظف من حدّ لأنه لا يستهلك من العرض المئوي.
- الشريط بأكمله `aria-hidden`؛ كل الأرقام في `aria-label` الرابط. لا `<title>` ولا `role="img"`.
- الشريط **لا يُرفَع** عند التحويم (ذ٥) — تلوين خلفية فقط.
- **البديل غير المكدّس** (إن رفض العميل التكديس): شريحة واحدة بلون `--chart-neutral`. يُبنى كخيار `stacked?: boolean` على المكوّن، والافتراضي `true`.

**النقر ⇒** `#/admin/tenders?op=<operatorId>` — انظر عقد المعاملات في §٥-ج.

### ٣-ج. (ب) دونات الطبقات — ثلاث شرائح

**المصدر:** المناقصات التي `tierNeedsApproval(tier)` **زائد** طبقة OPERATOR للسياق. المركز = الإجمالي.

**الهندسة (لا حساب مسارات — `stroke-dasharray` على `<circle>` فقط):**
`viewBox="0 0 160 160"` · `cx=cy=80` · `r=54` · `stroke-width=22` ⇒ **المحيط `C = 2π×54 = 339.292`**.
لكل شريحة بنسبة `f_i` وتراكم سابق `c_i`، وبفجوة `G = 3` وحدة قوسية (≈3.2°):
```
len_i    = max(0, C × f_i − G)
dasharray = `${len_i} ${C − len_i}`
dashoffset = `${−C × c_i}`
```
مثال تحقُّق (0.50 / 0.30 / 0.20):
| الشريحة | dasharray | dashoffset |
|---|---|---|
| ط١ | `166.65 172.65` | `0` |
| ط٢ | `98.79 240.50` | `-169.65` |
| ط٣ | `64.86 274.43` | `-271.43` |

```html
<figure class="ch ch--donut">
  <figcaption class="ch__cap">
    <span class="ch__t">الموافقات المعلّقة حسب الطبقة</span>
    <span class="ch__s">سلّم عام: ≤ 5M مشغّل · ≤ 10M لجنة مشتركة · فوقها نفط الوسط</span>
  </figcaption>

  <div class="ch-donut">
    <svg class="ch-donut__svg" viewBox="0 0 160 160" aria-hidden="true" focusable="false">
      <circle cx="80" cy="80" r="54" fill="none"
              stroke="var(--chart-track)" stroke-width="22"/>
      <circle class="ch-donut__seg" data-tier="OPERATOR"
              cx="80" cy="80" r="54" fill="none" stroke-linecap="butt"
              stroke="var(--tier-operator)" stroke-width="22"
              stroke-dasharray="166.65 172.65" stroke-dashoffset="0"
              transform="rotate(-90 80 80)"/>
      <circle class="ch-donut__seg" data-tier="JMC" … stroke-dashoffset="-169.65" …/>
      <circle class="ch-donut__seg" data-tier="MDOC" … stroke-dashoffset="-271.43" …/>
    </svg>
    <div class="ch-donut__center">
      <span class="ch-donut__n num">26</span>
      <span class="ch-donut__l">مناقصة</span>
    </div>
    <div class="ch-donut__tip" role="presentation" hidden>…</div>
  </div>

  <ul class="ch-legend">
    <li>
      <a class="ch-legend__i" href="#/admin/approvals?tier=JMC"
         aria-label="اللجنة المشتركة JMC — 11 مناقصة، 42 بالمئة من المعلّق. افتح سلسلة الموافقات مصفّاة على هذه الطبقة."
         onmouseenter="…" onfocus="…">
        <span class="ch-legend__sw" data-tier="JMC" aria-hidden="true"></span>
        <span class="ch-legend__l">اللجنة المشتركة JMC</span>
        <span class="ch-legend__n num">11</span>
        <span class="ch-legend__p num">42%</span>
      </a>
    </li>
    <!-- ط١ و ط٣ … -->
  </ul>
</figure>
```

```css
.ch-donut { position: relative; inline-size: 160px; block-size: 160px; margin-inline: auto; }
.ch-donut__svg { inline-size: 100%; block-size: 100%; display: block; }
.ch-donut__seg {
  cursor: pointer;
  pointer-events: stroke;          /* ← لازم: fill="none" يعني لا مساحة نقر بدونه */
  transition: stroke-width var(--dur-fast) var(--ease-out);
}
.ch-donut__seg--hot { stroke-width: 26; }

.ch-donut__center {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 2px; pointer-events: none;
}
.ch-donut__n {
  font-family: var(--font-mono); direction: ltr; unicode-bidi: isolate;
  font-size: 28px; font-weight: var(--fw-semibold);
  letter-spacing: -0.02em; color: var(--ink-1);
}
.ch-donut__l { font-size: 11px; color: var(--ink-3); }

.ch-donut__tip {
  position: absolute; z-index: 5;
  padding-block: 6px; padding-inline: 10px;
  background: var(--brand-navy-800); color: var(--ink-on-dark);
  border-radius: var(--r-sm); font-size: 11.5px; white-space: nowrap;
  box-shadow: var(--elev-overlay); pointer-events: none;
}

.ch-legend { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 1px; }
.ch-legend__i {
  display: grid; grid-template-columns: 10px 1fr auto auto;
  align-items: center; gap: 9px;
  padding-block: 6px; padding-inline: 8px;
  border-radius: var(--r-sm); text-decoration: none; color: inherit;
  font-size: 12.5px;
  transition: background var(--dur-fast) var(--ease-out);
}
.ch-legend__i:hover, .ch-legend__i:focus-visible { background: var(--bg-muted); }
.ch-legend__sw { inline-size: 10px; block-size: 10px; border-radius: var(--r-xs); }
.ch-legend__sw[data-tier='OPERATOR'] { background: var(--tier-operator); }
.ch-legend__sw[data-tier='JMC']      { background: var(--tier-jmc); }
.ch-legend__sw[data-tier='MDOC']     { background: var(--tier-mdoc); }
.ch-legend__l { color: var(--ink-2); }
.ch-legend__n { font-family: var(--font-mono); direction: ltr; font-weight: var(--fw-semibold); color: var(--ink-1); }
.ch-legend__p { font-family: var(--font-mono); direction: ltr; color: var(--ink-3); min-inline-size: 38px; text-align: end; }
```

**قواعد إلزامية:**
1. **الاتجاه:** يبدأ عند الساعة ١٢ (`rotate(-90 80 80)`) ويدور **باتجاه عقارب الساعة في AR وEN معاً**. الحلقة ليست نصّاً، والأرقام داخلها جزر LTR أصلاً؛ قلبها في RTL يضيف عبئاً إدراكياً بلا مقابل. **لا `scaleX(-1)` على الدونات.**
2. `stroke-linecap="butt"` صراحةً — مع `round` تطبع الشريحة الصفرية نقطة كاذبة.
3. شريحة بنسبة صفر: **لا يُصدَر `<circle>` لها** (وتظهر في وسيلة الإيضاح بـ`0` و`0%`).
4. طبقة واحدة بنسبة 100%: تُحذف الفجوة (`G = 0`) وإلا ظهر شقّ في حلقة مصمتة.
5. `pointer-events: stroke` — بدونها لا تلتقط الشريحة أي حدث لأن `fill="none"`.
6. **التلميح ليس `<title>`**: `<title>` داخل SVG مخفيّ عن AT هنا (الـSVG `aria-hidden`) وبطيء الظهور وغير قابل للتنسيق. التلميح `<div>` معنوَن بالحالة، `pointer-events: none` كيلا يسرق التحويم.
7. **التزامن ثنائي الاتجاه:** تحويم/تبئير عنصر وسيلة الإيضاح ⇒ الشريحة المقابلة تأخذ `--hot`؛ وتحويم الشريحة ⇒ عنصر الإيضاح يأخذ خلفية `--bg-muted`. حالة واحدة `hotTier: ApprovalTier | null` في المكوّن.
8. **النقر على الشريحة** ينتقل إلى الوجهة نفسها (`window.location.hash`)، وهو **اختصار مؤشر فقط**؛ مسار لوحة المفاتيح هو رابط وسيلة الإيضاح. لا `tabindex` على `<circle>`.

**النقر ⇒** `#/admin/approvals?tier=OPERATOR|JMC|MDOC`.

### ٣-د. (ج) مدرّج توزّع إنجاز العقود

**المصدر:** `contractProgress(c).pct` من `apps/web/src/admin/contractDerive.ts` لكل عقد في `state.contracts`.
**السِلال وحدود القطع (تُكتب في ثابت واحد، ولا تُكرَّر في JSX):**

| السلّة | المدى | الحد |
|---|---|---|
| 0-25 | `0 ≤ p < 25` | مغلق من الأسفل، مفتوح من الأعلى |
| 25-50 | `25 ≤ p < 50` | نفسه |
| 50-75 | `50 ≤ p < 75` | نفسه |
| 75-100 | `75 ≤ p ≤ 100` | **مغلق من الطرفين** — كي يقع 100% داخل السلّة الأخيرة لا خارجها |

```html
<figure class="ch">
  <figcaption class="ch__cap">
    <span class="ch__t">توزّع العقود حسب نسبة الإنجاز</span>
    <span class="ch__s">النسبة مشتقّة من مراحل العقد المغلقة</span>
  </figcaption>
  <div class="ch-hist">
    <a class="ch-hist__col" href="#/admin/contracts?prog=0-25"
       aria-label="من صفر إلى 25 بالمئة — 3 عقود. افتح سجلّ العقود مصفّى على هذه السلّة.">
      <span class="ch-hist__n num">3</span>
      <span class="ch-hist__bar" style="block-size:25%" aria-hidden="true"></span>
      <span class="ch-hist__l num">0–25%</span>
    </a>
    <!-- ٣ أعمدة أخرى -->
  </div>
</figure>
```

```css
.ch-hist { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; align-items: end; }
.ch-hist__col {
  display: grid; grid-template-rows: auto 1fr auto;
  align-items: end; justify-items: center; gap: 6px;
  block-size: 132px;
  padding-block: 6px; padding-inline: 4px;
  border-radius: var(--r-sm);
  text-decoration: none;
  transition: background var(--dur-fast) var(--ease-out);
}
.ch-hist__col:hover, .ch-hist__col:focus-visible { background: var(--bg-muted); }
.ch-hist__bar {
  inline-size: 100%; align-self: end;
  min-block-size: 3px;                    /* ← قيمة غير صفرية لا تختفي */
  background: var(--chart-neutral);
  border-radius: var(--r-xs) var(--r-xs) 0 0;
  transition: background var(--dur-fast) var(--ease-out);
}
.ch-hist__col:hover .ch-hist__bar,
.ch-hist__col:focus-visible .ch-hist__bar { background: var(--brand-navy-800); }
.ch-hist__col[data-empty='true'] .ch-hist__bar { background: var(--chart-track); min-block-size: 2px; }
.ch-hist__n { font-family: var(--font-mono); direction: ltr; font-size: 13px; font-weight: var(--fw-semibold); color: var(--ink-1); }
.ch-hist__l { font-family: var(--font-mono); direction: ltr; font-size: 10.5px; color: var(--ink-3); }
```

**قاعدة اللون الحاسمة:** **تعبئة واحدة `--chart-neutral` لكل الأعمدة.** السلّة مشفَّرة بالموضع أصلاً؛ تلوين السِلال أخضر←أحمر يُقحم حكم «جيّد/سيّئ» لا تحمله البيانات (عقد عند 10% قد يكون في موعده تماماً). النِيلي أيضاً هو ما يميّز هذا الرسم عن الدونات (تدرّج) ويمنع قراءة الأعمدة كطبقات.
**الارتفاع** = `count / max(counts) × 100%`، لا `count / total`.

**النقر ⇒** `#/admin/contracts?prog=0-25|25-50|50-75|75-100`.

### ٣-هـ. (د) شريط الالتزام الزمني (sparkline)

**المصدر:** `scheduleCompliancePct` (المستعملة في `FollowUpRoom.tsx:18`) محسوبة لكل نقطة زمنية في المدى.
**قانون مانع للاختلاق:** إن لم يُشتقّ من المخزن إلا **نقطة واحدة**، **لا يُرسم الشريط إطلاقاً** — يُطبع الرقم وحده. سلسلة زمنية من نقطة واحدة اختلاق.

```html
<div class="ch-sparkwrap">
  <span class="ch-spark__v num">87%</span>
  <svg class="ch-spark" viewBox="0 0 120 32" preserveAspectRatio="none"
       aria-hidden="true" focusable="false">
    <polyline points="0,26 20,22 40,24 60,17 80,14 100,11 120,8"
              fill="none" stroke="var(--ink-2)" stroke-width="1.5"
              stroke-linejoin="round" stroke-linecap="round"
              vector-effect="non-scaling-stroke"/>
    <circle cx="120" cy="8" r="2.5" fill="var(--status-done)"/>
  </svg>
  <span class="ch-spark__cap">الالتزام الزمني — آخر ٦ أشهر</span>
</div>
```

```css
.ch-sparkwrap { display: flex; align-items: center; gap: 10px; }
.ch-spark {
  direction: ltr;              /* ← محور زمني = جزيرة LTR (قانون الأرقام في DESIGN.md) */
  inline-size: 120px; block-size: 32px; flex: none; display: block;
}
.ch-spark__v { font-family: var(--font-mono); direction: ltr; font-size: 20px; font-weight: var(--fw-semibold); color: var(--ink-1); }
.ch-spark__cap { font-size: 11.5px; color: var(--ink-3); }
```

**قواعد إلزامية:**
1. `preserveAspectRatio="none"` **مع** `vector-effect="non-scaling-stroke"` معاً — الأولى تمطّ الرسم لعرض الحاوية، والثانية تمنع تشوّه سُمك الخط معها. غياب الثانية هو الخطأ الكلاسيكي في هذا الشكل.
2. **الخط `--ink-2` محايد** (10.17). خطّ الاتجاه ليس حالة؛ تلوينه أخضر يزعم حُكماً على المنحنى كله.
3. **النقطة الأخيرة وحدها ملوَّنة بالدلالة** حسب عتبات في ثابت مسمّى: `≥90 → --status-done` · `75–90 → --status-risk` · `<75 → --status-delayed`. لا أرقام سحرية في JSX.
4. **الزمن يجري يساراً→يميناً في AR وEN** (`direction: ltr` على الـSVG) — المحور الزمني بيانات رقمية، والقاعدة القائمة في النظام أن البيانات ذات التنسيق الآلي جزر LTR.
5. الرقم `87%` مطبوع دائماً بجوار الشريط — الشريط زخرفة لرقم موجود، لا حامل معلومة.
6. بلا محاور، بلا شبكة، بلا تعبئة تحت الخط (`fill` تحت المنحنى تزعم مساحة تراكمية لا معنى لها هنا).

---

## ٤. الشريط الجانبي: رئيسي / ثانوي (المرحلة ٦)

### ٤-أ. التقسيم — صدفة الإدارة (`AdminShell.tsx`)

الوضع اليوم: `PRIMARY` بستة عناصر + `TOOLS` بثمانية تحت تسمية ثابتة غير قابلة للطي (`admin.css:23`). المطلوب خمسة رئيسية + مجموعة ثانوية واحدة قابلة للطي.

**رئيسية — ظاهرة دائماً، بهذا الترتيب:**

| # | العنوان | `view` | الوجهة | العدّاد الحيّ |
|---|---|---|---|---|
| ١ | المتابعة | `room` | `#/admin` | قرارات التصديق المعلّقة |
| ٢ | المناقصات | `tenders` | `#/admin/tenders` | إجمالي المناقصات |
| ٣ | **سلسلة الموافقات** | `approvals` | `#/admin/approvals` | معلّق ط٢+ط٣ |
| ٤ | العقود | `contracts` | `#/admin/contracts` | العقود النشطة |
| ٥ | الجهات | `entities` | `#/admin/entities` | — |

`approvals` **يستبدل** `mct` في الملاحة (المرحلة ١، ق3). مسار `#/admin/mct` يبقى قابلاً للوصول كأرشيف مقروء لكن **لا يظهر في السايدبار**.

**ثانوية — داخل كاشف واحد بعنوان «أدوات ومراجع»، مطوية افتراضياً:**

| # | العنوان | `view` | الوجهة |
|---|---|---|---|
| ١ | التقارير | `reports` | `#/admin/reports` |
| ٢ | الامتثال | `compliance` | `#/admin/compliance` |
| ٣ | المشغّلون | `operators` | `#/admin/operators` |
| ٤ | الحقول | `fields` | `#/admin/fields` |
| ٥ | العطل الرسمية | `holidays` | `#/admin/holidays` |
| ٦ | الوصول والمستخدمون | `users` | `#/admin/users` |
| ٧ | الأدوار والصلاحيات | `roles` | `#/admin/roles` |
| ٨ | المسارات والتدقيق | `paths` / `audit` | `#/admin/paths` · `#/admin/audit` |

`users` **ينزل** من الرئيسي إلى الثانوي: إدارة الحسابات ليست عملاً يومياً لمن يدير مناقصات. عدّاده (`accounts`) ينتقل إلى بادج المجموعة المطوية.

### ٤-ب. التقسيم — صدفة المشغّل (`OperatorShell.tsx`)

| المستوى | العناصر |
|---|---|
| رئيسية | المتابعة (`inbox`) · المناقصات (`tenders`) · طلب جديد (`request`) · **الموافقات** (`approvals`، قراءة فقط: مناقصات هذه الشركة المنتظرة عند JMC/MDOC) |
| ثانوية | التقارير (`reports`) |

**قاعدة تمنع اجتهاد المنفّذ:** الكاشف يُصدَر **فقط عندما تحوي المجموعة الثانوية ≥ ٣ عناصر**. دونها تُصدَر العناصر مسطّحة تحت تسمية `.ad-nav__group` الثابتة القائمة. ⇒ صدفة الإدارة: كاشف. صدفة المشغّل: تسمية ثابتة (عنصر واحد).

### ٤-ج. سلوك الطيّ

1. **الحالة المخزَّنة:** `localStorage['masaar.nav.sec']` ∈ `'1' | '0'`. الافتراضي `'0'` (مطوي).
2. **الفتح القسري:** إن كان `view` النشط داخل المجموعة الثانوية، تُفتح المجموعة **بغضّ النظر عن المخزَّن، ودون الكتابة إليه** — كي لا يهبط رابط عميق على عنصر نشط مخفيّ، ودون أن يفسد ذلك تفضيل المستخدم.
3. **البادج التجميعي:** عند الطيّ يعرض رأس المجموعة مجموع عدّادات العناصر المخفيّة، فالطيّ لا يخفي إنذاراً أبداً.
4. **لا حركة ارتفاع.** فتح/إغلاق فوري بـ`hidden`. المتحرّك الوحيد هو دوران السهم (`transform`, `--dur-fast`). تحريك `block-size`/`grid-template-rows` يكلّف إعادة تخطيط لكل إطار مقابل ٢٠٠ms من الزينة، ويتضارب مع `hidden`.
5. `Escape` لا يفعل شيئاً — هذا كاشف مضمَّن (disclosure) لا نافذة منبثقة.

**التشريح (ARIA):**
```jsx
<nav className="ad-nav" aria-label={t('adnav.primary')}>
  {/* عناصر رئيسية … */}

  <button
    className="ad-nav__disc"
    aria-expanded={open}
    aria-controls="nav-secondary"
    onClick={toggle}
  >
    <Icon name="chevronStart" size={14} className="ad-nav__caret" />
    <span>{t('adnav.tools')}</span>
    {!open && hiddenCount > 0 && (
      <span className="ad-nav__count">{fmtCount(hiddenCount, lang)}</span>
    )}
  </button>

  <div id="nav-secondary" className="ad-nav__sec" hidden={!open}>
    {/* عناصر ثانوية … */}
  </div>
</nav>
```
`aria-expanded` على الزرّ · `aria-controls` يشير إلى الحاوية · `hidden` هو ما يخفي فعلاً (لا `display:none` مباشرة، فالسمة هي ما يفهمه القارئ الشاشي).
العنصر النشط يحمل `aria-current="page"` — مفقود اليوم في كلتا الصدفتين.

### ٤-د. فروق CSS

```css
/* admin.css — يُضاف بعد .ad-nav__group */
.ad-nav__disc {
  display: flex; align-items: center; gap: 8px;
  inline-size: 100%; box-sizing: border-box;
  padding-block: 9px; padding-inline: 10px;
  margin-block-start: 10px;
  border: none; background: transparent; cursor: pointer;
  font-family: inherit; font-size: 10.5px; font-weight: var(--fw-semibold);
  letter-spacing: 0.08em; text-align: start;
  color: var(--ink-on-dark-2);
  border-radius: var(--r-sm);
  transition: color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out);
}
.ad-nav__disc:hover { background: rgba(244, 241, 234, 0.08); color: var(--ink-on-dark); }

.ad-nav__caret { flex: none; transition: transform var(--dur-fast) var(--ease-out); }
/* مفتوح = يشير للأسفل؛ مطوي = يشير إلى بداية السطر (منطقي، ينعكس مع الاتجاه) */
.ad-nav__disc[aria-expanded='true']  .ad-nav__caret { transform: rotate(-90deg); }
html[dir='ltr'] .ad-nav__disc[aria-expanded='true'] .ad-nav__caret { transform: rotate(90deg); }

.ad-nav__sec { display: flex; flex-direction: column; gap: 2px; }
.ad-nav__sec[hidden] { display: none; }   /* ← إلزامي: display:flex يهزم [hidden] وإلا لم يُخفَ شيء */

/* العنصر النشط: الوزن يحمل الحالة أيضاً — لا اللون وحده */
.ad-nav__btn--on { font-weight: var(--fw-semibold); }
.ad-nav__btn[aria-current='page'] { font-weight: var(--fw-semibold); }
```
```css
/* operator.css — النسخة الفاتحة (المشغّل)، عند وجود ≥٣ عناصر ثانوية مستقبلاً */
.op-nav__disc { /* مطابق لـ.ad-nav__disc مع: color: var(--ink-3); */ }
.op-nav__disc:hover { background: var(--bg-muted); color: var(--ink-1); }
.op-nav__sec { display: flex; flex-direction: column; gap: 2px; }
.op-nav__sec[hidden] { display: none; }
.op-nav__btn--on { font-weight: var(--fw-semibold); }
```

> **اختلاف مقصود بين الصدفتين — لا «يُصحَّح»:** العنصر النشط في الإدارة عنبري على نِيلي داكن (`--brand-amber-500` + نص navy-900 = 6.09)، وفي المشغّل نِيلي معتم على ورق (`--brand-navy-800` + أبيض = 15.52). سببه أن السطحين متعاكسان؛ توحيدهما يكسر أحدهما.

---

## ٥. بطاقات الإحصاء القابلة للنقر

### ٥-أ. التشريح

> **حقيقة تنفيذية:** `KpiTile` من `@masaar/ui` **لا يعمل** خارج غلاف `.m-skin` (فـ`.m-kpi` مبني على `--m-card/--m-bd/--m-t1/--m-t3/--m-radius` المعرَّفة داخل `.m-skin` فقط — `ui.css:9-53`). لذلك بطاقة الإحصاء الفعلية في الإدارة هي `.ad-kpi` المكتوبة يدوياً. **التطوير يجري على `.ad-kpi`**، و`KpiTile` يبقى كما هو لصفحة البداية والمعرض؛ المشترك بينهما هو `useCountUp` المستخرَج فقط.

```html
<!-- بطاقة قابلة للنقر: <a> حقيقي — لا <div onClick> أبداً -->
<a class="ad-kpi ad-kpi--link" href="#/admin/tenders?status=delayed">
  <span class="ad-kpi__head">
    <span class="ad-kpi__dot" style="background: var(--status-delayed)"></span>
    <span class="ad-kpi__l">مراحل متأخرة</span>
  </span>

  <span class="ad-kpi__row">
    <span class="ad-kpi__v" ref={countRef}>0</span>
    <!-- سطر الاتجاه: يُصدَر فقط عند وجود قيمة سابقة حقيقية في المخزن -->
    <span class="ad-kpi__trend ad-kpi__trend--bad">
      <Icon name="…" size={12} aria-hidden="true" />
      <span class="num">+3</span>
      <span class="ad-kpi__trend-l">عن الأسبوع الماضي</span>
    </span>
  </span>

  <span class="ad-kpi__go">
    افتح السجل مصفّى
    <Icon name="chevronStart" size={12} strokeWidth={2} className="op-chev-fwd" aria-hidden="true" />
  </span>
</a>
```

```css
/* admin.css — .ad-kpi يبقى كما هو؛ هذه إضافات */
a.ad-kpi--link {
  text-decoration: none; color: inherit; cursor: pointer;
  transition:
    border-color var(--dur-base) var(--ease-out),
    box-shadow   var(--dur-base) var(--ease-out),
    transform    var(--dur-base) var(--ease-out);
}
a.ad-kpi--link:hover,
a.ad-kpi--link:focus-visible {
  border-color: var(--border-3);
  box-shadow: var(--elev-hover);
  transform: translateY(var(--lift));
}
a.ad-kpi--link:hover .ad-kpi__go,
a.ad-kpi--link:focus-visible .ad-kpi__go { color: var(--ink-1); }

.ad-kpi__go {
  display: inline-flex; align-items: center; gap: 5px;
  margin-block-start: 2px;
  font-size: 11px; color: var(--ink-3);
  transition: color var(--dur-fast) var(--ease-out);
}

.ad-kpi__trend {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 11.5px; font-weight: var(--fw-semibold);
}
.ad-kpi__trend .num { font-family: var(--font-mono); direction: ltr; unicode-bidi: isolate; }
.ad-kpi__trend-l { font-weight: var(--fw-regular); color: var(--ink-3); }
.ad-kpi__trend--good { color: var(--status-done); }
.ad-kpi__trend--bad  { color: var(--status-delayed); }
.ad-kpi__trend--flat { color: var(--ink-3); }
```

**القواعد:**
1. **إشارة النقر دائمة لا تظهر بالتحويم.** سطر «افتح السجل مصفّى» + شيفرون مرئي في الحالة الساكنة بلون `--ink-3` (5.98)، ويعتم إلى `--ink-1` عند التحويم/التبئير. الإشارة التي تظهر بالتحويم فقط غير موجودة لمستخدم اللمس ولا لمن لا يحوّم.
2. **بطاقة بلا وجهة تبقى `.ad-kpi` مجرّدة ولا تعرض سطر `__go` إطلاقاً** — إشارة بلا مقصد زرّ وهمي (حظر قائم).
3. **سطر الاتجاه يُحذف كاملاً إن تعذّر اشتقاق قيمة سابقة** (ذ٨). لا «0%» ولا «—» ولا تقدير. `trend` نوعه `{ delta: number; sinceKey: string } | null`، و`null` ⇒ لا عنصر.
4. اتجاه «جيّد» ليس دائماً «صعود»: زيادة المتأخّرات سيّئة، وزيادة الالتزام جيّدة. الحُكم يأتي من خاصية `goodDirection: 'up' | 'down'` على تعريف كل مؤشّر، لا من إشارة الرقم.
5. الرقم يحمل `useCountUp` بمنسّق ثابت؛ يُطفَأ عند إعادة الحساب بعد فلترة (٢-١، بند ٤).

### ٥-ب. أي صندوق يصبح قابلاً للنقر ويهبط أين

| الصندوق | الشاشة | الوجهة | حالته اليوم |
|---|---|---|---|
| المناقصات المفتوحة | غرفة المتابعة | `#/admin/tenders?status=progress` | ساكن |
| بانتظار التصديق | غرفة المتابعة | `#/admin/tenders?pending=1` | ساكن |
| الالتزام الزمني % | غرفة المتابعة | `#/admin/compliance` | ساكن |
| ~~«فوق صلاحية المشغّل (MCT)»~~ → **الموافقات المعلّقة** | غرفة المتابعة | `#/admin/approvals` | يُعاد تعريفه (المرحلة ١) |
| موافقات JMC معلّقة | غرفة المتابعة (**جديد**) | `#/admin/approvals?tier=JMC` | جديد |
| موافقات MDOC معلّقة | غرفة المتابعة (**جديد**) | `#/admin/approvals?tier=MDOC` | جديد |
| ~~«مراحل متجاوزة للمخطط»~~ | — | — | **يُحذف** (المرحلة ٣ صراحةً) |
| مراحل متأخرة | غرفة المتابعة | `#/admin/tenders?status=delayed` | يستبدل المحذوف |
| عقود قيد التنفيذ | غرفة المتابعة (**جديد**) | `#/admin/contracts?stage=execute` | جديد |
| صفّ شركة في رسم (أ) | غرفة المتابعة | `#/admin/tenders?op=<operatorId>` | جديد |
| شريحة/إيضاح في رسم (ب) | غرفة المتابعة | `#/admin/approvals?tier=<TIER>` | جديد |
| عمود في رسم (ج) | غرفة المتابعة | `#/admin/contracts?prog=<bucket>` | جديد |
| إجمالي/متأخّر/مستحقّ الأسبوع | سجلّ المناقصات (المشغّل) | فلترة موضعية (لا تنقّل) | ساكن |

### ٥-ج. عقد معاملات URL (**بند حرج — فيه عيب قائم**)

**السابقة الموجودة:** `apps/web/src/admin/Fields.tsx:20-24` يقرأ `#/admin/fields?op=<id>` عبر `window.location.hash.split('?')[1]` ثم `URLSearchParams`. ومُوجِّه `App.tsx:232` يستعمل `^#\/admin\/(\w+)(?:\?.*)?$` — أي أن **سلسلة الاستعلام مدعومة أصلاً** ولا يحتاج التوجيه تعديلاً.

**العيب:** `Fields.tsx` يفعل `useState(opParam())` — يُقرأ **مرة واحدة عند التركيب**. إن كان المستخدم على الشاشة نفسها وضغط رابطاً يغيّر المعامل فقط، يتغيّر الـhash ولا يعاد تركيب المكوّن ⇒ **الفلتر لا يتحرّك**. كل نقرة في هذه المواصفة تهبط على سجلّ مصفّى، فهذا العيب سيظهر فوراً.

**الحل — خطّاف واحد يُستعمل في كل السجلّات، `apps/web/src/registry/useHashParams.ts` (جديد):**
```ts
import { useEffect, useState } from 'react';

function read(): URLSearchParams {
  const q = window.location.hash.split('?')[1];
  return new URLSearchParams(q ?? '');
}

/** يقرأ معاملات الاستعلام من الـhash ويعيد المزامنة عند كل hashchange. */
export function useHashParams(): URLSearchParams {
  const [p, setP] = useState(read);
  useEffect(() => {
    const on = () => setP(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return p;
}
```
**قواعد العقد:**
- أسماء المعاملات المعتمدة: `op` (معرّف المشغّل) · `tier` (`OPERATOR|JMC|MDOC`) · `status` (`progress|risk|delayed|done`) · `prog` (`0-25|25-50|50-75|75-100`) · `pending` (`1`) · `stage` (مفتاح مرحلة العقد) · `field` (معرّف الحقل).
- **كل قيمة تُتحقَّق مقابل مجموعتها المسموحة**؛ القيمة المجهولة تُهمَل بصمت ويُعرض السجلّ كاملاً (لا شاشة خطأ من رابط عابث).
- الفلتر الوارد من الـURL **يظهر كرقاقة `FilterChips` قابلة للإزالة** — كي يرى القارئ لماذا السجلّ منقوص، ويستطيع توسيعه بنقرة.
- إزالة الرقاقة **تُحدّث الـhash** (تُزيل المعامل) فلا تتباعد الحالة عن العنوان، ويبقى العنوان قابلاً للمشاركة.
- **الفلتر الوارد يُختَم على كل مطبوع** — يسدّد بند «ختم الفلاتر النشطة» في المرحلة ٤ من خطة العميل.

---

## ٦. خريطة التنفيذ

### ٦-أ. قائمة الفروق ملفاً ملفاً

**توكنات (`packages/tokens/css/tokens.css`)** — تُعدَّل قيم قائمة وتُضاف كتل:
| العملية | الأسطر | المحتوى |
|---|---|---|
| تعديل | 43–44 | `--ink-3: #5A6474` · `--ink-4: #656E7D` |
| إضافة | بعد 44 | `--ink-disabled: #98A1B0` (لـ`:disabled` وحده) |
| تعديل | 57، 59، 61 | `--status-progress: #1B65A4` · `--status-done: #1C7046` · `--status-risk: #8F5915` |
| تعديل | 80–82 | ألفا الحدود `0.10 / 0.20 / 0.30` |
| إضافة | بعد 83 | `--border-control` · `--mark-accent` |
| إضافة | كتلة جديدة | `--tier-*` التسعة + `--chart-track/-sep/-neutral` |
| تعديل | 139 | `--shadow-2` المعمّق |
| إضافة | بعد 142 | `--elev-rest/-hover/-overlay` · `--lift` |
| إضافة | بعد 149 | `--focus-color` · `--focus-color-on-dark` · `--focus-width` · `--focus-offset` · `--focus-ring` |
| تعديل | 201–205 | `:focus-visible` يستعمل التوكنات |

**`packages/ui/`:**
- `src/useCountUp.ts` — **جديد** (§٢-١).
- `src/KpiTile.tsx` — حذف الخطّاف المضمّن (12–48) واستيراد المستخرَج. سلوك مطابق.
- `src/TierChip.tsx` — **جديد**: `{ tier: ApprovalTier; lang }` ⇒ رقاقة `ط١/ط٢/ط٣` + الاسم.
- `src/ui.css` — أصناف `.m-tier` (§٣-أ). **لا تُعدَّل `.m-pill`.**
- `src/index.ts` — تصدير `useCountUp`, `COUNT_UP_MS`, `TierChip`.

**`apps/web/src/charts/` — مجلّد جديد بالكامل:**
| ملف | المسؤولية |
|---|---|
| `charts.css` | كل أصناف `.ch-*` (§٣) — يُستورَد من `CompanyBars.tsx` فيُحمَّل مرة واحدة |
| `tier.ts` | المصدر الوحيد لخريطة الطبقة: التسمية · التوكن · الوجهة · الترتيب. **لا يُكرَّر أيّ منها في JSX** |
| `CompanyBars.tsx` | (أ) — خاصية `stacked?: boolean = true` |
| `TierDonut.tsx` | (ب) — يحوي رياضة `dasharray` وحالة `hotTier` |
| `CompletionHistogram.tsx` | (ج) — يحوي ثابت السِلال وحدود القطع |
| `Sparkline.tsx` | (د) — يحوي ثابت العتبات؛ يعيد `null` إن كانت النقاط < 2 |

**`apps/web/src/registry/`:**
- `useHashParams.ts` — **جديد** (§٥-ج).
- `registry.css` — `.reg-skel*` + `@keyframes reg-shimmer` (§٢-٦) · `--border-control` على `.reg-select` و`.reg-pager__size`.

**`apps/web/src/admin/`:**
- `admin.css` — `.ad-nav__disc/__caret/__sec` · `a.ad-kpi--link` · `.ad-kpi__go` · `.ad-kpi__trend*` · `.ad-side :focus-visible` · `.ad-side__credit-l` → `--ink-on-dark-2` · `--border-control` على `.op-filter-select`/`.acc-open`/`.acc-scope-select` · الكتلة العامة لتقليل الحركة.
- `AdminShell.tsx` — إعادة تقسيم `PRIMARY`/`TOOLS` (§٤-أ) · الكاشف + `localStorage` + الفتح القسري · بادج تجميعي · `aria-current="page"`.
- `FollowUpRoom.tsx` — أثقل ملف: صناديق KPI جديدة قابلة للنقر · حذف صندوق «مراحل متجاوزة للمخطط» · تركيب الرسوم الأربعة · `useCountUp`.
- `Fields.tsx` — استبدال `opParam()` بـ`useHashParams()` (إصلاح عيب §٥-ج).
- `Contracts.tsx` · `AdminTenders.tsx` — قراءة `useHashParams()` كبذرة فلتر + رقاقة قابلة للإزالة + إعادة كتابة الـhash عند الإزالة.

**`apps/web/src/operator/`:**
- `operator.css` — رفع `.op-task` · `.op-tbl__row:focus-within` · انزلاق الدُرج + `@keyframes dr-fade/dr-in` + `--dr-dir` · مسطرة التبويب `::after` · `.op-nav__disc/__sec` · `--border-control` على عناصر `.wz-*`/`.op-btn-ghost`/`.op-langbtn`/`.file-doc__up`/`.bidderadd-in` · `--ink-disabled` على المعطّلات · `--mark-accent` على `.file-tl__today`/`.file-tl__leg-today`/`.op-notif__dot` · استبدال كتلة تقليل الحركة الضيّقة (932) بالعامة.
- `OperatorShell.tsx` — `NAV` يكتسب `approvals`؛ `reports` ينزل إلى الثانوي تحت تسمية ثابتة (< ٣ عناصر) · `aria-current="page"`.
- `QuickLook.tsx` — دورة `op-drawer--closing` + `animationend`.
- `TenderDetail.tsx` (تبويبات الملفّ) — `role="tablist"/"tab"/"tabpanel"` + تنقّل بالأسهم.

**`apps/web/src/toast.css`** — سطران فقط: `--elev-overlay` · مدّة الخروج `--dur-fast`.

**`apps/web/src/locales/ar.json` + `en.json`** — تكافؤ تام إلزامي: تسميات الطبقات الثلاث · «أدوات ومراجع» · «افتح السجل مصفّى» · عناوين الرسوم الأربعة وأوصافها · نصوص `aria-label` للأشرطة/الإيضاح/الأعمدة (وهي **مترجمة**، لا مبنيّة بالسَّلسَلة في JSX) · «جارٍ التحميل…» · «سلسلة الموافقات» · نصوص الاتجاه.

### ٦-ب. ترتيب المهامّ للمنفّذ

> يُنفَّذ بالتسلسل. كل رقم نقطة `commit` صالحة. الأرقام ١–٣ لا تلمس أي `.tsx` ⇒ أدنى تصادم مع الوكلاء العاملين على الفرع.

1. **التوكنات** — كل تعديلات §١-ج و§١-د في `tokens.css`. لا شيء آخر.
2. **مصالحة الأثر** — مسح كل استعمالات `--ink-4` وتحويل المعطّلات إلى `--ink-disabled`؛ `--border-control` على قائمة عناصر التحكّم؛ `--mark-accent` على العلامات الأربع؛ `.ad-side__credit-l` → `--ink-on-dark-2`. (مطلوب لأن الخطوة ١ تغمّق `--ink-4` بما يجعل المعطّل يبدو مفعّلاً.)
3. **الحركة** — الكتلة العامة لتقليل الحركة في `operator.css` و`admin.css` · رفع الصف · مسطرة التبويب · مواءمة التنبيه.
4. **`useCountUp`** — الاستخراج + التصدير + تعديل `KpiTile` (سلوك مطابق، بلا تغيير بصري).
5. **`useHashParams` + عقد المعاملات** — الخطّاف، إصلاح `Fields.tsx`، بذر الفلتر في `AdminTenders`/`Contracts` + رقاقة قابلة للإزالة.
6. **السايدبار** — الصدفتان، الكاشف، `localStorage`، الفتح القسري، `aria-current`، البادج التجميعي، فروق CSS.
7. **بطاقات قابلة للنقر** — `a.ad-kpi--link` + سطر الاتجاه (مع منطق `null`) في `FollowUpRoom`.
8. **`charts/tier.ts` + `charts.css`** — الأساس المشترك قبل أي مكوّن رسم.
9. **رسم (أ) أشرطة الشركات** — أوّل رسم؛ يثبّت نمط `figure`/`aria-label`/النقر لبقية الرسوم.
10. **رسم (ب) الدونات** — أعقدها (الرياضة + التزامن ثنائي الاتجاه + `pointer-events: stroke`).
11. **رسوم (ج) و(د)** — المدرّج والشريط.
12. **الهيكل العظمي** — `.reg-skel` + ربطه بحالة الجلب في `isApiMode` مع تأخير ٢٠٠ms.
13. **التبويبات ARIA** — `role="tablist"` + تنقّل الأسهم في ملفّ المناقصة.
14. **انزلاق الدُرج** — الأخير لأنه يمسّ دورة حياة `QuickLook`.
15. **اللغتان** — تدقيق تكافؤ AR/EN، وأن كل رقم يمرّ بـ`fmtCount` (لاتيني)، وأن لا نصّ ARIA مبنيّ بالسَّلسَلة.

**بعد كل رقم:** `typecheck` (٦ مشاريع) + كامل الاختبارات (خط أساس ٣٨١) + `build`.

### ٦-ج. ما يستوجب تحقّقاً في المتصفّح (لا يُمسك باختبار وحدة)

| # | الفحص | كيف |
|---|---|---|
| ت١ | نِسَب التباين الفعلية بعد التوكنات | DevTools ← فاحص التباين على: `.op-page__sub` · `.op-tbl__code` · `.ad-decision__due` · `.op-devbadge` · `.ad-panel__s` — كلها ≥ 4.5 |
| ت٢ | حلقة البؤرة مرئية على **السايدبار الداكن** | Tab عبر كامل ملاحة الإدارة؛ الحلقة عنبرية ومرئية على كل عنصر |
| ت٣ | البؤرة على الزرّ الأساسي | Tab إلى `.op-btn-primary`؛ حلقة نِيلية مفصولة عن الزرّ بفجوة ورقية |
| ت٤ | انزلاق الدُرج ينعكس مع الاتجاه | فتح QuickLook في AR ثم تبديل اللغة وإعادة الفتح — الانزلاق من الحافة المقابلة |
| ت٥ | العدّ التصاعدي لا يعيد الكرّة لا نهائياً | مراقبة `.ad-kpi__v`: يعدّ مرة واحدة ويستقرّ (فشلٌ هنا = `format` غير مستقرّ) |
| ت٦ | تقليل الحركة | تفعيل الإعداد في النظام ⇒ لا تلألؤ، لا انزلاق، الرقم نهائي فوراً، التنبيه يظهر/يختفي بلا حركة **ويُفكّ تركيبه فعلاً** |
| ت٧ | رياضة الدونات | مجاميع 100% / 33-33-34 / 100-0-0 / 0-0-100 / كل الأصفار — لا شقّ، لا نقطة كاذبة، لا قوس زائد |
| ت٨ | مساحة نقر شريحة الدونات | النقر على القوس ينتقل (يثبت `pointer-events: stroke`) |
| ت٩ | مسار لوحة المفاتيح للرسوم | Tab يمرّ بكل صفّ شركة، كل عنصر إيضاح، كل عمود مدرّج — ولا يدخل SVG أبداً |
| ت١٠ | النقر يهبط مصفّى فعلاً | من غرفة المتابعة: صفّ شركة ⇒ سجلّ المناقصات يعرض تلك الشركة فقط + رقاقة الفلتر ظاهرة |
| ت١١ | إعادة المزامنة على الشاشة نفسها | من `#/admin/tenders?op=A` انتقل إلى `?op=B` بلا إعادة تحميل ⇒ الجدول يتغيّر (يثبت `useHashParams`) |
| ت١٢ | الطيّ لا يخفي عنصراً نشطاً | فتح `#/admin/audit` مباشرة والمجموعة مطوية في التخزين ⇒ تُفتح قسرياً والعنصر مرئي |
| ت١٣ | البادج التجميعي | طيّ المجموعة مع وجود حسابات نشطة ⇒ الرقم على رأس المجموعة |
| ت١٤ | ١٢ شركة كاملة | الشركة بلا مناقصات تظهر بمسار فارغ و«—» |
| ت١٥ | القيمة الصغيرة مرئية | مشغّل بمناقصة واحدة من أصل ٢٠٠ ⇒ شريحته ≥ 3px |
| ت١٦ | RTL/LTR لكل رسم | لقطات AR وEN: الدونات لا تنقلب، الشريط الزمني يبقى يسار→يمين، الأشرطة تنعكس، الأرقام لاتينية |
| ت١٧ | الهيكل العظمي في وضع API | `VITE_API_URL` مضبوط + إبطاء الشبكة ⇒ صفوف شبحية بعد ٢٠٠ms، لا وميض على استجابة سريعة |
| ت١٨ | لا اختلاق | عقدة تخزين بلا سجلّ سابق ⇒ سطر الاتجاه **غائب** لا صفر؛ نقطة التزام واحدة ⇒ **لا شريط** |
| ت١٩ | لقطات كل شاشة متغيّرة AR + EN | غرفة المتابعة · سجلّ المناقصات · ملفّ العقد · سجلّ الوصول · صدفة المشغّل |
| ت٢٠ | جولة `polish` الختامية | معايير مهارة التصميم: ≥4.5:1، بؤرة مرئية، فراغات إيقاعية — بند قائم في المرحلة ٦ |

---

## ٧. ما هذه المواصفة صراحةً **لا** تفعله

كي لا يوسّع المنفّذ النطاق:

- **لا تلمس السمة ولا الأسطح** — لا وضع داكن، ولا تغيير `--bg-*`، ولا تغيير عائلة الخطّ أو مقياسه.
- **لا تضيف حالة سابعة** إلى المفردة الدلالية المغلقة. الطبقة ليست حالة؛ لها مفرداتها الخاصّة (`--tier-*`).
- **لا تُعيد بناء `KpiTile` ولا `.m-skin`** — تستخرج منه خطّافاً فقط.
- **لا تحرّك بيانات ولا تغيّر شكل مخزن** — كل رقم فيها مشتقّ من مشتقّات قائمة (`contractProgress` · `scheduleCompliancePct` · `approvalTierFor` · `tenderStatus`).
- **لا تنشئ شاشة `#/admin/approvals`** — هي من المرحلة ١. هذه المواصفة تستهلكها كوجهة فقط؛ فإن لم تكن جاهزة عند التنفيذ، تُبنى الرسوم وتُعطَّل روابطها إلى `#/admin/tenders` مؤقّتاً **مع دَين مسمّى في الخطة**، ولا يُصدَر رابط إلى مسار غير موجود.
- **لا تضيف مكتبة** (§٢-٧).
