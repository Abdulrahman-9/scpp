# موجز التنفيذ — نظافة وتحسينات ما بعد v2

> **المصدر:** `ops/POST-V2-IMPROVEMENTS.md` أقسام أ + ب + ج (القسم د ديون خادم تُعرض على العميل — خارج هذا الموجز).
> **حالة الشجرة وقت الفحص:** فرع `design-v2`، كنسة v2 **غير مُودعة** في شجرة العمل (54 ملفاً معدَّلاً + 4 غير متتبَّعة). كل سطر أدناه مقيس على الشجرة **كما هي الآن**، لا على HEAD.
> **قاعدة القراءة:** كل بند يحمل `الحالة` (قائم / سقط-مع-v2 / تغيّر) و`الدليل` (ملف:سطر) و`خطة التعديل` و`الحجم` (S/M/L).
> **تحذير عام:** `apps/web/dist/` موجود في الشجرة (مخرَج بناء، مُتجاهَل من git) — كل مسح لا يستثنيه يُرجع نتائج كاذبة. المسوح أدناه استثنته.

## الحصيلة

| الحالة | العدد | البنود |
|---|---|---|
| **قائم** | 9 | أ-2ب · أ-3 · أ-4 · أ-5 · ب-2 · ب-4 · ج-1 · ج-3 · ج-4 |
| **سقط مع v2** | 2 | أ-2أ · ب-3 |
| **تغيّر** | 4 | أ-1 · ب-1 · ب-5 · ج-2 |

| المقياس | الرقم |
|---|---|
| متغيّرات غير مستعملة (كل المشاريع الستة) | **4** (٣ استيرادات + وسيط واحد) — كلها في `apps/web` |
| مفاتيح ترجمة يتيمة | **3** من 1678 (تناظر عربي/إنجليزي كامل: 1678 = 1678) |
| أصناف CSS ميتة مؤكَّدة | **2** من 813 مُعرَّفاً |
| أصناف «غير مؤكّدة» (نمط قالبي) | 69 مرشَّحاً → تحقّقتُ من اتحاداتها: **68 حيّ**، **1 ميت** (مضموم للـ2 أعلاه) |

---

# أ. النظافة

## أ-1 · المتغيّرات غير المستعملة

**الحالة: تغيّر** — قائمة السجل (6 ملفات) لم تعد دقيقة: `Operators.tsx` و`Reports.tsx` نظّفتهما كنسة v2، والباقي أربعة مواقع فقط.

**الدليل** — `npx tsc --noEmit --noUnusedLocals --noUnusedParameters -p <project>` على المشاريع الستة كاملةً:

| المشروع | النتيجة |
|---|---|
| `packages/working-days` | نظيف (0) |
| `packages/scpp-rules` | نظيف (0) |
| `packages/ui` | نظيف (0) — يشمل `test` لأن `include: ["src","test"]` |
| `packages/db` | نظيف (0) |
| `apps/api` | نظيف (0) |
| `apps/web` | **4** |

الأربعة بالضبط:

```
apps/web/src/admin/entities.ts(25,72)      TS6133  'today'       — وسيط (noUnusedParameters)
apps/web/src/admin/Holidays.tsx(5,10)      TS6133  'calendarOf'  — استيراد (noUnusedLocals)
apps/web/src/admin/UserProfile.tsx(11,1)   TS6133  'initials'    — استيراد (noUnusedLocals)
apps/web/src/operator/TenderDetail.tsx(6,55) TS6133 'stageStatus' — استيراد (noUnusedLocals)
```

**خطة التعديل**

1. `Holidays.tsx:5` — احذف `calendarOf` من قائمة الاستيراد (يبقى مذكوراً في تعليق السطر 13 فقط، وهو نصّ لا كود).
2. `TenderDetail.tsx:6` — احذف `stageStatus` من قائمة الاستيراد.
3. `UserProfile.tsx:11` — احذف السطر `import { initials } from './Users';` كاملاً.
4. `entities.ts:25` — الوسيط `today = todayIso()` **يُمرَّر فعلاً** من نداءين (`EntityProfile.tsx:51`، `Vendors.tsx:81`) ولا يُقرأ داخل الدالة إطلاقاً. هذا ليس زغباً بل **وعد كاذب**: النداءان يظنّان أنهما يثبّتان التاريخ. خياران، ورجّحتُ الأول:
   - **حذف الوسيط** من التوقيع + من النداءين (3 أسطر) — أصدق، والدالة لا تعتمد على «اليوم» في حسابها (`won/ongoing` مشتقّان من الحالة لا من التاريخ). قارن `vendorStatus(v, today)` في نفس الملف (سطر 7): **هناك** الوسيط مقروء فعلاً، فالتفريق مقصود ومقروء بعد الحذف.
   - لو أُريد إبقاء التوقيع: `_today` مع تعليق سطر واحد يشرح لماذا لا يُقرأ.

**تكلفة إضافة العلمين إلى `typecheck` الدائم:** **4 إصلاحات، لا أكثر** — بعدها المشاريع الستة كلها خضراء. التعديل في `package.json:"typecheck"` هو إضافة `--noUnusedLocals --noUnusedParameters` إلى الأوامر الستة، أو (أنظف) رفعهما إلى `tsconfig.base.json:compilerOptions` فيرثهما الجميع بسطرين. **تنبيه:** `apps/web/tsconfig.json` يحمل `include: ["src"]` — مجلد `apps/web/test/` **غير مفحوص أصلاً** اليوم، فرفع العلمين لا يمسّه ولا يفتح جبهة جديدة.

**فائدة جانبية مرصودة (خارج البند):** `initials` مُعرَّفة **ثلاث مرات**: `Users.tsx:29` (مُصدَّرة)، `AdminShell.tsx:100` (محلية)، `OperatorShell.tsx:28` (محلية). حذف استيراد `UserProfile` يترك مستوردَين حقيقيَّين للمُصدَّرة (`RoleCards.tsx:12`). التوحيد بند نظافة مستقلّ، صغير، وليس شرطاً لهذا البند.

**الحجم: S**

---

## أ-2أ · CSS الميت المُعلَّم في السجل

**الحالة: سقط مع v2.**

**الدليل** — `grep -rn "op-notif__mark|op-toast" apps/web` (باستثناء `dist/`) → **صفر نتيجة**.
- `.op-notif__mark` كان في `operator.css:212` عند HEAD؛ غير موجود الآن.
- كتلة `.op-toast*` القديمة كانت في `toast.css` (99 سطراً عند HEAD)؛ الملف الآن 114 سطراً وكلّه `tv2-*` — استُبدل بالكامل لا رُقّع.

**خطة التعديل:** لا شيء. يُشطب البند من السجل.
**الحجم: —**

---

## أ-2ب · CSS ميت جديد (مسح شامل بديل)

**الحالة: قائم** — مسحتُ الأصناف المُعرَّفة في الملفات التسعة (`styles` · `toast` · `whatsnew` · `admin` · `operator` · `registry` · `charts` · `report` · `packages/ui/ui.css`) مقابل استعمالها في كل `.ts/.tsx` تحت `apps/web/src` و`apps/web/test` و`packages/ui`، مع كشف أنماط القوالب قبل الحكم بالموت.

**النتيجة: 813 صنفاً مُعرَّفاً · صنفان ميتان.**

**الميت المؤكَّد (١):**
```
.ad-panel__count--red        apps/web/src/admin/admin.css:134
```
لا يُطبَّق في أي موضع. الشقيق `.ad-panel__count--amber` (سطر 133) **حيّ** في `FollowUpRoom.tsx:209`؛ الأساس `.ad-panel__count` حيّ في أربعة مواضع (`ContractProfile.tsx:263` · `EntityProfile.tsx:197` · `FollowUpRoom.tsx:209,262`). فالمعدِّل الأحمر وحده يتيم.

**الميت المؤكَّد (٢) — يُكتشَف فقط بتتبّع الاتحاد، لا بالنصّ:**
```
.op-notif__pt--info          apps/web/src/operator/operator.css:261
```
يُبنى في `NoticeBell.tsx:121` بـ `` `op-notif__pt op-notif__pt--${n.severity}` ``، و`severity` مُعرَّف في `notify.ts:12` بأنه `'risk' | 'delayed'` **فقط**. فالقيمة `info` لا يمكن أن تُنتَج أبداً. الشقيقان `--risk` (سطر 260) و`--delayed` (سطر 259) حيّان.
> شقيق مجاور فُحص وثبت أنه حيّ: `.bell-item--delayed` (`styles.css:325`) يُبنى في `NoticeBell.tsx:70` من نفس الاتحاد، وقيمته ضمنه.

**«غير المؤكّد» — 69 مرشَّحاً، حُسم كلّه:** كل واحد مطابق لجذع قالبي مرصود؛ تحقّقتُ من اتحاد القيم في TS لكل عائلة، فثبت أن **68 حيّ** والباقي هو `.op-notif__pt--info` أعلاه. العائلات المفحوصة واتحاداتها:

| العائلة | مصدر القيمة | الاتحاد | الحكم |
|---|---|---|---|
| `.m-pill--*` (6) | `StatusPill status` | ٦ حالات، كلها مُستعمَلة في `Gallery.tsx` | حيّ |
| `.m-meter--{ok,risk,breach}` | `CapStatus` — `packages/scpp-rules/src/types.ts:41` | مطابق | حيّ |
| `.m-verdict--{award,negotiate,clarify-capability}` | `AwardAction` — `mct.ts:89` | مطابق | حيّ |
| `.ad-dec--*` (5) | `ApprovalDecision` — `adminDerive.ts:48` | مطابق | حيّ |
| `.acc-cell--*` (4) | `CellState` — `access.ts:17` | مطابق | حيّ |
| `.acc-role--*` (7) / `.acc-rc--*` (5) | `roleTone()` — `access.ts:137-147` | مطابق (بما فيه `unknown`) | حيّ |
| `.op-seg--*` · `.file-tl__dot--*` | `stageStatus()` — `store.tsx:529` | مطابق | حيّ |
| `.tv2-toast--*` (3) | `ToastKind` — `Toasts.tsx:19` | مطابق | حيّ |
| بقيّة العائلات (`op-task__*` · `op-group--*` · `reg-sort__caret--*` · `ad-tier--*` · `ad-searchchip--*` · `ctr-stage__dot--*` · `acc-triad__body--*` · `op-legend--*`) | جذوع قالبية مرصودة نصّاً | — | حيّ |

**خطة التعديل:** حذف سطرين اثنين:
- `apps/web/src/admin/admin.css:134`
- `apps/web/src/operator/operator.css:261`

**تحقّق بعد الحذف:** `npm run test` (المجموعة تقرأ الأوراق عبر CSSOM في `visualRefresh.test.tsx`، فأي كسر في التحليل يظهر فوراً).

**الحجم: S**

**ملاحظة إضافية (ليست بنداً، للعرض فقط):** فحصتُ كذلك متغيّرات CSS المخصّصة — 184 مُعرَّفاً، منها 12 بلا قارئ: `--secondary-{50,100,200,300,500,700}` · `--space-9` · `--space-10` · `--side-w-min` · `--st-preparing-base` · `--st-delivered-{fg,bd}`. أغلبها **اكتمال سُلَّم مقصود** (رامب لوني/مسافي كامل)، لا زغب — وحدها `--side-w-min` و`--st-delivered-*` تستحق سؤالاً. **لا أوصي بحذف شيء منها** بلا كلمة صاحب المواصفة.

---

## أ-3 · مفاتيح الترجمة اليتيمة

**الحالة: قائم** — جولة ختامية كاملة على 1678 مفتاحاً (بعد التسطيح؛ الملفان متداخلان بمستويين تحت 73 فضاء اسم).

**الطريقة:** تسطيح `ar.json`/`en.json` → مقابلة كل مفتاح مع (١) وجوده حرفياً في أي سلسلة في `apps/web/src` أو `apps/web/test`، (٢) جذع قالبي يسبق ثقب `${…}` مع فاصل `.` أو `_` أو `-`، (٣) لاحقة ساكنة تلي ثقباً. ثم تحقّق يدوي من كل مرشَّح.

**التناظر:** `ar` 1678 · `en` 1678 · **لا مفتاح ناقص في أيّ من الجهتين**. لا مفاتيح مستعملة في `test/` وحدها.

**اليتامى الثلاثة — وكلها بقايا هجرة فضاء الاسم إلى `reg.`:**

| المفتاح اليتيم | خلَفه الحيّ | موضع الخلف |
|---|---|---|
| `operators.empty` | `reg.operators.empty` | `admin/Operators.tsx:248` |
| `tenders.empty` | `reg.atenders.emptyStore` | `admin/AdminTenders.tsx:305` |
| `tenders.sub` | `reg.atenders.sub` | `admin/AdminTenders.tsx:214` |

تحقّقتُ أن بقيّة فضاءَي `tenders.*` (11 مفتاحاً) و`operators.*` (25 مفتاحاً) **حيّة كلّها** — فليست هجرة فضاء كامل، بل مفتاحان وثالث تُركوا خلف الركب.

**مرشّحون كاذبون حسمتُهم (لا تُحذف):** `access.capsFilter{All,Actions,Reads}` تُبنى في `admin/UserProfile.tsx:157` بقالب بلا فاصل، و`gallery.skin{Ledger,Blueprint}` تُبنى في `Gallery.tsx:51` بـ `` t(`gallery.skin${k.charAt(0).toUpperCase()}${k.slice(1)}`) ``. أي مسح يعتمد على `grep` الحرفي وحده سيقتلها الخمسة.

**خطة التعديل:** حذف ٣ مفاتيح × ملفَّي لغة = **6 أسطر**، من `apps/web/src/locales/ar.json` و`en.json`.

**الحجم: S**

---

## أ-4 · مصير `design-v2-ref/`

**الحالة: قائم.**

**الدليل**
- الحجم على القرص: **220 ك.ب** (208 ك.ب محتوى)، **3 ملفات فقط**:
  `dashboard.dc.html` (69 ك.ب) · `design-system.dc.html` (129 ك.ب) · `tokens-v2.css` (10 ك.ب).
- غير متتبَّع في git بعد (`?? design-v2-ref/` في `git status`) — فالنقل **الآن** بلا كلفة تاريخ إطلاقاً: إعادة تسمية مجلد قبل أول إيداع.
- **لا كود ولا اختبار يقرأ المسار.** كل الإشارات نصّية:

```
ops/DESIGN-V2-SPEC.md:5     المصدر المُعتمَد: design-v2-ref/tokens-v2.css + …
ops/DESIGN-V2-SPEC.md:475   … روابط Google في design-v2-ref محظورة
apps/web/src/operator/Icon.tsx:28   glyphs lifted verbatim from design-v2-ref/dashboard.dc.html
apps/web/src/main.tsx:3     … روابط Google في design-v2-ref محظورة
```
كلها **تعليقات ونصّ مواصفة** — لا `import`، لا `fetch`، لا `readFileSync`، ولا مسار في أي ملف تحت `apps/web/test/`. تحقّقتُ من مجموعة الاختبارات الثلاثين ولا واحد يفتح المجلد. **النقل لا يكسر شيئاً ولا يوجب تحديث أي اختبار.**

**خطة التعديل**
1. `git mv design-v2-ref ops/design-v2-ref` (أو `mv` عادي قبل الإيداع).
2. تحديث الإشارات الأربع أعلاه إلى `ops/design-v2-ref/…` — تعديل نصّي بحت.
3. سطر في `ops/DESIGN-V2-SPEC.md` قرب السطر 5 يقول إن المجلد مرجع مجمَّد لا مصدر بناء.
4. تحقّق: `grep -rn "design-v2-ref" --exclude-dir=node_modules --exclude-dir=dist` يجب ألّا يُرجع أي مسار عارٍ.

**الحجم: S**

---

## أ-5 · توحيد شارة العدّ بين القشرتين

**الحالة: قائم** — كنسة v2 لم تمسّه.

**الدليل**

| | الموضع | الشيفرة |
|---|---|---|
| **المشغّل — خام** | `operator/OperatorShell.tsx:142` | `{n.counted && <span className="op-nav__count">{counts[n.counted]}</span>}` |
| **الإدارة — عبر `fmtCount`** | `admin/AdminShell.tsx:208` | `{n.counted && <span className="ad-nav__count">{fmtCount(counts[n.counted], lang)}</span>}` |
| | `admin/AdminShell.tsx:228` | `<span className="ad-nav__count">{fmtCount(hiddenCount, lang)}</span>` |
| | `admin/AdminShell.tsx:243` | نفس نمط 208 (القائمة الثانوية) |

`fmtCount` — `operator/derive.ts:159-161`:
```ts
export function fmtCount(n: number, _lang: 'ar' | 'en'): string {
  return n.toLocaleString('en-US');
}
```

**تصحيح لصياغة السجل:** «الناتج متطابق اليوم» صحيح **تحت الألف فقط**. `toLocaleString('en-US')` يُدخل فاصلة الآلاف، فعند 1000 مناقصة تعرض الإدارة `1,000` والمشغّل `1000`. فهذا ليس تماثلاً تجميلياً بحتاً بل فرق ظاهر عند نموّ البيانات.

**خطة التعديل** (سطران):
1. `OperatorShell.tsx` — أضف `fmtCount` إلى الاستيراد القائم من `./derive` (السطر 10 يستورد `deriveTasks` من نفس الوحدة).
2. السطر 142 → `{fmtCount(counts[n.counted], lang)}`. المتغيّر `lang` في النطاق أصلاً (مستعمل في مرشِّح البحث بنفس الدالّة).

**الحجم: S**

---

# ب. تحسينات صغيرة عالية القيمة

## ب-1 · `KpiTile` أسير `.m-skin`

**الحالة: تغيّر — والحقيقة أثقل من السجل.**

السجل يصف قيد تصميم على مكوّن واحد. الواقع أن **كل عائلة `--m-*` تتسرّب، وثلاثة مكوّنات إنتاجية تُرسَم اليوم خارج القشرة بمتغيّرات غير معرَّفة**.

**الدليل — أين تُعرَّف `--m-*`:** في محدِّدَين فقط، `packages/ui/src/ui.css:13` (`.m-skin`) و`:31` (`.m-skin--blueprint`). **لا وجود لها على `:root`** — تحقّقتُ من `packages/tokens/css/tokens.css` (صفر نتيجة) ومن كل أوراق `apps/web` (`styles.css` وحدها تقرأها، لا تعرّفها).

**الدليل — من يقرأ `--m-*` (9 مكوّنات، لا واحد):**
```
.m-kpi      ui.css:84,85,86,92,102,107     --m-card --m-bd --m-radius --m-t3 --m-t1
.m-meter    ui.css:130,132,133,144,152     + --m-track --m-bd-strong
.m-rail     ui.css:160,162,172,183,192
.m-verdict  ui.css:197                      --m-radius
.m-step*    ui.css:244,245,248,253,254
.m-path     ui.css:261,262,268
```

**الدليل — أين توضع `.m-skin` فعلاً (٣ مواضع فقط):**
```
apps/web/src/App.tsx:95                <section className="kpis m-skin">
apps/web/src/operator/TendersList.tsx:201  <div className="kpis m-skin">
apps/web/src/admin/PathsGuide.tsx:32   <div className="m-skin m-skin--blueprint skin-stage">
```
و`Gallery.tsx:57` عبر `SKINS[skin]`.

**الدليل — من يُرسَم خارجها (لا سلف `.m-skin` في شجرة العرض):**
```
CapMeter (.m-meter)      admin/ContractProfile.tsx:302,303,304,305,386
VerdictStrip (.m-verdict) admin/TenderReview.tsx:258 · App.tsx:153 ·
                          operator/FileBidders.tsx:57 · operator/wizard/EvaluateWizard.tsx:151
PathBadge (.m-path)       admin/TenderReview.tsx:206 · App.tsx:172
```
> `App.tsx:153` و`:172` خارج القسم المُقشَّر: ذاك يُغلق قبلهما.

**الأثر الفعلي:** `var()` بلا قيمة ⇒ الخاصية **باطلة عند حساب القيمة** ⇒ ترتدّ إلى `unset`. عملياً في `ContractProfile`: خلفية البطاقة تصير شفافة، الحدّ يختفي، نصف القطر يصير صفراً، **ومسار العدّاد `--m-track` يختفي فيغيب الشريط الذي يُقرأ منه السقف**. هذا سلوك قائم، ليس ديناً تجميلياً.

هذا **ليس ذنب v2** — عند HEAD كانت `--m-*` محبوسة في `.m-skin` كذلك (`git show HEAD:packages/ui/src/ui.css:9-45`). لكن **v2 جعل التحرير تافهاً**: كانت `--m-card: #ffffff` قيمة ثابتة، وصارت في `.m-skin` مطابقة ١:١ لرمز مُثيَّم.

**خطة التعديل — التحرير الأدنى (لا يغيّر بكسلاً واحداً في المواضع المُقشَّرة):**

الخريطة القائمة في `.m-skin` هي 1:1 اليوم، فتُحوَّل إلى **قيم احتياطية داخل القراءة نفسها**، والنمط **مسبوق في هذا المستودع أصلاً** — `apps/web/src/styles.css:151` و`:156` يكتبان `var(--m-t3, var(--text-3))`:

| المتغيّر | الاحتياطي (من `.m-skin` كما هي) |
|---|---|
| `--m-card` | `var(--bg-card)` |
| `--m-bd` | `var(--border-2)` |
| `--m-bd-strong` | `var(--border-control)` |
| `--m-t1` / `--m-t2` / `--m-t3` | `var(--text-1)` / `var(--text-2)` / `var(--text-3)` |
| `--m-track` | `var(--chart-track)` |
| `--m-radius` | `var(--r-md)` |

1. في `ui.css`، حوِّل **كل** قراءات `--m-*` في المواضع المسرودة أعلاه إلى صيغة `var(--m-x, var(--token))`. هذا يُبقي تجاوزات `.m-skin--blueprint` (`--m-card`/`--m-bd`/`--m-radius`) سليمة تماماً — الاحتياطي لا يُقرأ إلا حين لا تكون القيمة معرَّفة.
2. `.m-skin` تبقى كما هي (لا تُحذف): هي التي يقف عليها المخطط الهندسي.
3. لا تغيير في أي `.tsx`.

**نداء صادق:** حرِّر **كل** العائلة لا `KpiTile` وحده — تحرير واحد من تسعة يترك ثمانية بنفس الفخّ ويوهم أن البند أُغلق.

**تحقّق:** لقطة قبل/بعد لـ`#/admin/contracts/<id>` (تظهر البطاقات والمسار) و`#/operator/tenders` (يجب ألّا تتغيّر) في الوضعين الفاتح والداكن.

**الحجم: M**

---

## ب-2 · دقّة عدّ MCT في تنبيه أثر العطل

**الحالة: قائم.**

**الدليل**
- `store.tsx:497-512` — `holidaysImpact()` تُرجع **فقط** المناقصات التي يتحرّك إقفال عطاءاتها؛ `HolidayImpact` (`store.tsx:484-489`) = `{tenderId, code, before, after}`. لا ذكر لـMCT فيها.
- `admin/Holidays.tsx:102` — السطر العامّ الذي يعوّض عن العدّ:
  ```tsx
  <div className="op-muted" style={{ fontSize: 11, marginTop: 4 }}>{t('holidays.impactWd')}</div>
  ```
  ونصّه (`en`): *«Every working-day counter (deviations, §6.9 windows) is also recomputed against the new calendar.»* — جملة صادقة لكنها لا تقول **كم**.
- تعليق السطر 101 يعترف بالثغرة حرفياً: *«the closing list is the load-bearing part; every WD countdown (deviations, MCT 6.9 windows) also re-reads»*.
- `ImpactPreview` مشتركة بين الإضافة (`Holidays.tsx:161`) والحذف (`:200`)، فتعديل واحد يخدم المسارين.

**اللبنات جاهزة كلّها:**
- `mctCycleStatus({notifiedOn, meetingHeldOn, agreementReachedOn, asOf, calendar})` تُرجع `meetingDeadline` و`agreementDeadline` و`prevailingEstimate` — النمط مُنفَّذ حرفياً في `notify.ts:32-53`.
- `MCT_MEETING_WD = 14` · `MCT_AGREEMENT_WD = 21` — `packages/scpp-rules/src/mct.ts:20-21`.
- `aboveOwnFA(state, t)` مُصدَّرة من `store` (يستوردها `notify.ts:3`).

**خطة التعديل**
1. في `store.tsx` بجوار `holidaysImpact`: دالّة `mctWindowImpact(state, date, mode): number`. تبني تقويمَي `before`/`after` **بنفس الأسطر 499-504** (اسحبهما إلى مساعد `toggledCalendars(state, date, mode)` يستعمله الاثنان — لا تُكرَّر منطق التبديل)، ثم لكل مناقصة تحقّق `aboveOwnFA(state, t) && t.mct` واحسب `mctCycleStatus` مرّتين، وعُدّ حين `prevailingEstimate === 'PENDING'` **و** يختلف `meetingDeadline` أو `agreementDeadline`.
   > الحصر بـ`PENDING` مقصود: دورة مغلقة نافذتها ماضية ولا يعني القارئَ تحرّكها.
2. في `Holidays.tsx`: مرّر العدّ إلى `ImpactPreview` واعرض `holidays.impactMct` بصيغة «N قضية كلفة يعبر التاريخ نافذتها» حين `n > 0`؛ أبقِ `impactWd` حين `n === 0` (فهو يظلّ صادقاً عن الانحرافات).
3. مفتاحان جديدان `holidays.impactMct` في `ar.json` و`en.json`.

**تحقّق:** اختبار وحدة على `mctWindowImpact` ببذرة تحمل مناقصة فوق السلطة بدورة MCT مفتوحة، وتأكيد أن عطلة داخل النافذة تُعدّ وعطلة بعدها لا تُعدّ.

**الحجم: M**

---

## ب-3 · `RESET` في وضع الـAPI

**الحالة: سقط — لكن لسبب غير الذي افترضه السجل.**

السجل يطلب «حجب زرّه هناك». **لا زرّ أصلاً — في أيّ وضع.**

**الدليل** — كل ذكر لـ`RESET` في الشجرة:
```
apps/web/src/store.tsx:737     | { type: 'RESET' };          ← تعريف النوع
apps/web/src/store.tsx:1473    case 'RESET': return seedState();  ← المخفِّض
apps/web/src/store.tsx:1481    ضمن NON_AUDITED
apps/web/src/store.tsx:1509    ضمن CLIENT_ONLY
apps/web/test/dispatchLocal.test.ts:12   dispatch({ type: 'RESET' })  ← المُرسِل الوحيد
```
لا `dispatch({ type: 'RESET' })` في أي `.tsx`. تحقّقتُ من HEAD أيضاً: الحال نفسه — الزرّ لم يوجد في هذه الموجة.

**خطة التعديل:** لا حجب ولا توثيق للمستخدم — لا سطح مستخدم يُوثَّق. الفعل الوحيد المتاح: `RESET` هو **مركبة اختبار** `dispatchLocal.test.ts` لمسار `CLIENT_ONLY`. أضف سطر تعليق فوق `store.tsx:737` يقول ذلك صراحةً، وإلا فسيُعاد اكتشافه كـ«ميّت» في كل جولة نظافة قادمة. لا تحذفه: حذفه يكسر الاختبار ويترك مسار `CLIENT_ONLY` بلا حارس.

**الحجم: S**

---

## ب-4 · سياسة العطل الرجعية — **قرار عميل، يُعرض لا يُنفَّذ**

**الحالة: قائم.** التناقض قائم حرفياً كما وُصف.

**الدليل — العميل يمنع الماضي:**
```tsx
apps/web/src/admin/Holidays.tsx:151
<input id="hol-date" type="date" className="wz-in" min={todayIso()} … />
```

**الدليل — الخادم يقبله:**
```ts
apps/api/src/holidays/holidays.controller.ts:10-17   // HolidayDto
@Matches(ISO) date!: string;            ← شكل فقط، لا حدّ زمني
@IsString() @Length(1,120) name!: string;
@IsString() @Length(20,2000) reason!: string;

apps/api/src/holidays/holidays.controller.ts:37-41   // add()
… prisma.holiday.create({ data: { date: new Date(`${dto.date}T00:00:00.000Z`), … } })
```
لا حارس ماضٍ في أي طبقة خادمية. لافت أن نفس الملف **يفرض** المسوّغ ≥20 حرفاً على الجهتين (سطر 49 للحذف)، وتعليق السطر 13-15 يقول صراحةً إن حارس الخادم «يجب ألّا يكون أضعف من حارس العميل» — فالتناقض **انحراف عن قاعدة معلنة في نفس الملف**، لا سهو غير موثّق.

**الخياران للعرض على العميل:**
- **أ) توحيد نحو المنع:** `@Matches(ISO)` + حارس `date >= today` في `add()`. الأرخص. يغلق باباً موجوداً.
- **ب) توحيد نحو السماح بمسوّغ** (ميل المستشار في السجل): حذف `min={todayIso()}` من `Holidays.tsx:151` + إلزام مسوّغ أطول/خانة إقرار حين يكون التاريخ ماضياً. **معاينة الأثر الرجعي قائمة أصلاً** (`ImpactPreview`) وهي بالضبط ما يجعل الخيار (ب) دفاعياً بدل أن يكون تهوّراً.

**خطة التعديل:** **لا تنفيذ.** يُصاغ الخياران في ورقة العميل مع لقطة `ImpactPreview` كدليل على أن الأثر مرئي قبل الفعل.
**الحجم: S (عرض) · M (تنفيذ أيّهما بعد الكلمة)**

---

## ب-5 · بقايا هجرة `EmptyState`

**الحالة: تغيّر** — عدّ السجل (EntityProfile 2 / UserProfile 4 / Operators 1 = 7) لا يطابق الشجرة، وفي **الاتجاهين**.

**الدليل — 17 موضعاً لـ`.ad-empty-inline` في 11 ملفاً**، والصنف مُعرَّف مرّة واحدة: `admin/admin.css:162`. لكنه يخدم **غرضين مختلفين**، وهذا هو أصل خطأ العدّ:

**(أ) حالات فراغ حقيقية — 9 مواضع، هي البند فعلاً:**
```
admin/EntityProfile.tsx:161   participation.length === 0   → entity.noHistory
admin/EntityProfile.tsx:200   vendorContracts.length === 0 → entity.noContracts
admin/EntityProfile.tsx:219   events.length === 0          → entity.noEvents
admin/UserProfile.tsx:163     shown.length === 0           → ‼ مُرشَّح: mode='noMatch'
admin/UserProfile.tsx:216     withheld.length === 0        → access.noWithheld
admin/UserProfile.tsx:249     events.length === 0          → access.noEvents
admin/ContractProfile.tsx:315 → contracts.noGuarantees     ← لم يرصده السجل
admin/ContractProfile.tsx:343 → contracts.noEvents         ← لم يرصده السجل
admin/RoleCards.tsx:188       → rolecard.noCaps            ← لم يرصده السجل
```

**(ب) حواشٍ مكتومة — 8 مواضع، ليست فراغاً ولا تُهاجَر:**
```
admin/Fields.tsx:321 · admin/FollowUpRoom.tsx:310 · admin/Operators.tsx:324 ·
admin/RolesMatrix.tsx:201 · admin/Schedule.tsx:383 · admin/Schedule.tsx:387 ·
admin/Vendors.tsx:342 · admin/UserProfile.tsx:231 (رابط فائض «withheldMore»)
```
هذه أسطر ملاحظة تحت لوحة ممتلئة (`operators.noDelete`, `sched.contractNote`, …)، بعضها بـ`style={{textAlign:'start'}}` لأن التوسيط لا يليق بها. **تحويلها إلى `EmptyState` كذب دلالي.**

> `admin/Operators.tsx:324` الذي أحصاه السجل ضمن السبعة هو من هذا الصنف (ب): `operators.noDelete` حاشية، لا حالة فراغ. الشاشة تستعمل `EmptyState` الحقيقي أصلاً في موضعها الصحيح (`Operators.tsx:248` مع `reg.operators.empty`).

**المقصد** — `registry/EmptyState.tsx` يقدّم `inline` بالضبط لهذا: `<div className={inline ? 'op-empty op-empty--inline' : 'op-empty'} data-mode={mode}>`.

**خطة التعديل**
1. هاجر **التسعة** في (أ) إلى `<EmptyState mode="empty" inline>{t('…')}</EmptyState>`.
2. `UserProfile.tsx:163` استثناء واعٍ: مشروطه `shown.length === 0` بعد مرشِّح `capFilter`، فحقّه `mode={capFilter === 'all' ? 'empty' : 'noMatch'}` — وهذا **إصلاح صدق** لا نقل زخرفة (السابقة قائمة في `Schedule.tsx:391`).
3. **أعطِ (ب) اسمها:** انسخ إعلان `admin.css:162` إلى `.ad-note` وحوّل المواضع الثمانية إليه. عندها يصبح `.ad-empty-inline` ميتاً بالكامل ويُحذف — وهذا هو الربح الحقيقي: بعد الهجرة يبقى الصنف حيّاً في ثمانية مواضع، فيبدو البند «غير مكتمل» في كل مراجعة قادمة.
4. لا تغيير في `EmptyState.tsx`.

**تحقّق:** `apps/web/test/phase4Screens.test.tsx` و`archiveScreens.test.tsx` يلمسان هذه الشاشات — شغّلهما بعد الهجرة.

**الحجم: M**

---

# ج. بقايا خطة المنهجية الأصلية

## ج-1 · شاشة الإعدادات (٦ب الأصلية) — مواصفة

**الحالة: قائم.** مواصفة، لا تنفيذ.

### جرد الآليات: ما هو قائم مقابل ما يُبنى

| المحور | الحالة | الدليل |
|---|---|---|
| **اللغة** | **قائم بالكامل** — بلا شاشة | `AdminShell.tsx:288` و`OperatorShell.tsx:234`: `<button className="op-langbtn" onClick={() => void i18n.changeLanguage(isAr ? 'en' : 'ar')}>` |
| **الثيم** | **قائم بالكامل** | `src/theme.ts` (`readTheme`/`applyTheme`/`toggleTheme`/`watchSystemTheme`، مفتاح `masaar.theme`) · `src/ThemeToggle.tsx` · سكربت ما قبل الرسم `apps/web/index.html:11-21` · مفاتيح `theme.{toggle,toDark,toLight}` |
| **حجم الخط** | **معدوم — يُبنى من الصفر** | `grep -rn "data-text-size\|textSize"` على `apps/web/src` و`packages` → **صفر** |
| **التباين العالي** | **معدوم — يُبنى من الصفر** | لا `data-contrast` ولا كتلة تباين؛ نتيجتا `contrast` الوحيدتان تعليق في `Vendors.tsx:162` وتعليق في `operator.css:775` |

### القرار الحاسم في الثيم: ينتقل أم يُنسخ؟

**لا هذا ولا ذاك — يُوسَّع.** `theme.ts` ثنائي اليوم (`Theme = 'light' | 'dark'`) بينما آلة الحالة الحقيقية **ثلاثية**: `watchSystemTheme()` يتبع النظام ما دام `localStorage` فارغاً، ولا سبيل للعودة إلى «اتبع النظام» بعد أول ضغطة. الشاشة هي المكان الوحيد الذي تتّسع فيه لثلاثة خيارات.

- **أضف** `type ThemePref = 'light' | 'dark' | 'system'` و`clearTheme()` (تمسح المفتاح وتعيد تطبيق قيمة النظام) — الأصعب في هذا البند وأصدق مكسب فيه.
- **أبقِ** `ThemeToggle` في شريطَي القشرتين: هو تبديل بضغطة واحدة أثناء العمل، والشاشة هي التفضيل الدائم. **ليس تكراراً** بل عمقان مختلفان — بشرط أن يقرآ ويكتبا نفس `masaar.theme` فلا يتناقضا. (`readTheme()` تقرأ السمة المرسومة على `<html>` لا المخزَّن، فهي متينة أصلاً أمام هذا.)

### آليتان تُبنيان — على قالب `theme.ts` حرفياً

**حجم النص:** سُلَّم الطباعة عشرة رموز على `:root` في `packages/tokens/css/tokens.css:148-149`:
```
--t-display-1:44px; --t-display-2:32px; --t-h1:24px; --t-h2:20px; --t-h3:17px; --t-h4:15px;
--t-body:14px; --t-body-sm:13px; --t-caption:12px; --t-micro:11px;
```
فالتوسيع كتلة واحدة `:root[data-text-size='lg'] { … }` تعيد تعريف العشرة (×1.15 مثلاً، مُقرَّبة إلى نصف بكسل). **لا تلمس `html{font-size}`**: المستودع يقيس بالبكسل لا بالـrem، فتغيير الجذر لا يفعل شيئاً ويوهم أنه فعل.
- `src/textSize.ts` نسخة بنيوية من `theme.ts` بمفتاح `masaar.textSize`.
- **سكربت `index.html` يجب أن يُوسَّع** ليطبع `data-text-size` قبل الرسم — وإلا فقفزة تخطيط عند كل تحميل. هذا هو الجزء الذي يُنسى، وهو نصف قيمة البند.

**التباين العالي:** نفس الشكل — `:root[data-contrast='high']` تعيد تعريف رموز الحدّ والنصّ الثانوي (`--border-1/2`, `--text-3`) إلى قيم أعلى تبايناً. **قيد:** `visualRefresh.test.tsx` يحسب نِسَب التباين من الـCSSOM ويقارنها غير مُقرَّبة — فأي كتلة تباين جديدة تدخل تحت مجهره ويجب أن تُمرَّر عمداً. اقرأ ترويسة الملف (السطور 26-50) قبل الكتابة.

### الشكل والموضع

- **مسار واحد `#/settings`**، لا `#/admin/settings` و`#/operator/settings`: التفضيلات صفة القارئ لا صفة البوابة، وشاشتان لنفس الأربعة إعدادات هما مصدرا حقيقة. يُلفّ في القشرة التي تحمل الجلسة (`isOperatorRole(session.role)` من `src/session.ts`).
- **موضع المدخل: قائمة الحساب**، لا الشريط الجانبي. القائمة قائمة في القشرتين بنفس الشكل تماماً — `.op-menu` مع `__head` (اسم + دور) و`__out` (خروج) — وبند «الإعدادات» فوق «تسجيل الخروج» هو الموضع المتعارف عليه. الشريط الجانبي في الإدارة يحمل عشرة بنود ثانوية خلف كاشف (`AdminShell.tsx:63-74`) وكلها **مجالات عمل**؛ الإعدادات ليست مجالاً.
  - `AdminShell.tsx:290-296` و`OperatorShell.tsx:~245+` — نفس التعديل حرفياً في الاثنتين.
  - `AdminView` (`AdminShell.tsx:14-21`) لا يحتاج عضواً جديداً بهذا التصميم.
- **الجسم:** أربعة صفوف «تسمية + شرح سطر + مِفتاح»، بلا زرّ حفظ — كل تغيير يُطبَّق ويُخزَّن فوراً كما يفعل `ThemeToggle` اليوم. زرّ حفظ يوهم بمعاملة لا وجود لها.

### مفاتيح i18n المطلوبة

قائم: `theme.{toggle,toDark,toLight}` · `app.switchLang`.
جديد (~14 × لغتين): `settings.title` · `settings.sub` · `settings.lang{,Hint}` · `settings.theme{,Hint}` · `settings.theme{Light,Dark,System}` · `settings.textSize{,Hint}` · `settings.textSize{Normal,Large}` · `settings.contrast{,Hint}` · `settings.open` (بند القائمة).

**الحجم: M**

---

## ج-2 · القشرة القديمة `.op-legacy`

**الحالة: تغيّر — ادّعاء السجل «هجرتهما تُميت الغلاف نهائياً» غير صحيح على الشجرة الحالية.**

**الدليل — أربع شاشات داخل الغلاف، لا اثنتان:**
```tsx
apps/web/src/App.tsx:314-321
const LEGACY: Record<string, [AdminView, JSX.Element]> = {
  reports:    ['reports',    <Reports />],
  compliance: ['compliance', <Compliance />],
  paths:      ['paths',      <PathsGuide />],
  audit:      ['audit',      <Audit />],
};
if (legacy) return <AdminShell view={legacy[0]} …><div className="op-legacy">{legacy[1]}</div></AdminShell>;
```

**أطوال الملفات الآن** — مطابقة لأرقام السجل تماماً:
```
PathsGuide.tsx    71 سطراً   (السجل: 71) ✓
Audit.tsx         39 سطراً   (السجل: 39) ✓
Reports.tsx      284 سطراً   ← لم يذكره السجل
Compliance.tsx   139 سطراً   ← لم يذكره السجل
```

**هل مسّتهما كنسة v2؟** `git diff --stat`: `PathsGuide.tsx` و`Compliance.tsx` و`Audit.tsx` **صفر تغيير**؛ `Reports.tsx` أربعة أسطر فقط (تعديل رموز). فالأربعة كما كانت.

**ما الذي يموت فعلاً بموت الغلاف:**
```
apps/web/src/operator/operator.css:273    .op-legacy { padding: … }         ← يُحذف كلّه
apps/web/src/operator/operator.css:1033   .op-page, .op-legacy { … }        ← يُحذف الجزء الثاني فقط
```
سطران، أحدهما جزئي — **الغنيمة ليست في حجم الـCSS بل في زوال آخر تخطيط موازٍ**.

**وأصناف تموت معه — تحقّقتُ من آخر مستعمِل لكل منها:**
- `.mct-head` — مستعمِله **الوحيد** `PathsGuide.tsx:46`. يموت بهجرة PathsGuide.
- `.dtable` — يبقى: `Audit.tsx:18` و`Compliance.tsx:19,84` و`Reports.tsx:166,237`. لا يموت إلا بهجرة الأربعة معاً.
- `.card` / `.hint` — **تبقى قطعاً**: مستعملة في 16 و12 ملفاً (منها `App.tsx` و`Login.tsx` و`WizardShell.tsx`). لا تُلمس.
- `.skin-stage` — تبقى (`Gallery.tsx:57`).
- `.paths-*` (`styles.css:239-251`) — تنتقل مع PathsGuide لا تموت؛ هي على مِسك `.m-skin--blueprint` وتعتمد `--m-card`/`--m-bd`/`--m-radius` (**فتُنجَز بعد ب-1 لا قبله**).

**خطة التعديل — على مرحلتين، والمرحلة الأولى وحدها لا تُغلق البند:**

**ج-2أ (S) — الأصغران:**
1. `Audit.tsx` (39 سطراً): `section.card` → `.op-page`، `h2/p.hint` → `.op-page__title`/`.op-page__sub`، `table.dtable` → `.op-tbl`، وحالة الفراغ من `StatusPill status="planned"` (`Audit.tsx:16`) إلى `<EmptyState mode="empty">` — الشارة ليست حالة فراغ.
2. `PathsGuide.tsx` (71 سطراً): يبقى `.m-skin--blueprint` (مقصود، وهو آخر مستهلك للمِسك الهندسي)؛ يتغيّر الغلاف الخارجي فقط، و`.mct-head:46` → `.op-page__head`. ثم احذف `.mct-head` من الورقة.
3. أزل `paths` و`audit` من خريطة `LEGACY` وأعطهما سطرَي توجيه مباشرَين كبقيّة الشاشات (`App.tsx:303-313` نمط جاهز).

**ج-2ب (M) — القاتلة:** `Compliance.tsx` (139) و`Reports.tsx` (284). بعدها فقط: احذف `.op-legacy` من `operator.css:273` ومن `:1033`، واحذف خريطة `LEGACY` وسطر 321 كاملاً، وافحص `.dtable`.

**تحقّق:** `routes.test.tsx` يغطّي مسارات الإدارة — شغّله بعد كل مرحلة.

**الحجم: S (ج-2أ) · M (ج-2ب) · الغلاف لا يموت إلا بالاثنتين**

---

## ج-3 · تعميم `SectionExplainer`

**الحالة: قائم.**

**الدليل — المكوّن** `registry/SectionExplainer.tsx` (30 سطراً، مبني على `<details>` الأصلي؛ الطرفان `title` + `children` والمتصل يملك كل كلمة). **أربع شاشات تحمله اليوم:**
```
admin/Approvals.tsx:198      approvals.explainTitle    (مولده)
admin/Schedule.tsx:259       sched.explainTitle        (الامتثال الزمني)
admin/Reports.tsx:208        reports.vendorExplainTitle
admin/MinistryLists.tsx:35   mlist.title
```

**الثلاث المطلوبة في السجل، وحالتها الآن:**
```
admin/Contracts.tsx    السطر 188 يحمل op-page__sub — بلا شارح
admin/Vendors.tsx      «الجهات» — بلا شارح
admin/AccessSection.tsx «الوصول والأدوار» — بلا شارح
```

**خطة التعديل:** لكل شاشة: استيراد + كتلة `<SectionExplainer title={t('…')}>` تحت العنوان مباشرة + مفتاحا عنوان/متن في اللغتين. **العمل الحقيقي نصّ لا شيفرة**، وتوثيق `SectionExplainer` يفرض قيداً واجباً: «المتصل يمرّر الأرقام الحيّة، فلا يفترق الشرح عن التهيئة التي يصفها» — أي أن شارح «الوصول» يجب أن يقرأ الأدوار الفعلية لا أن يسرد ثابتاً، وشارح «العقود» يقرأ السقوف الحيّة. سردٌ ثابت يخالف عقد المكوّن وينحرف صامتاً.

**الحجم: M** (ثلاث شاشات × ~6 أسطر شيفرة + 6 مفاتيح × لغتين، وثقل النصّ لا الشيفرة)

---

## ج-4 · بند «الموافقات» في بوابة المشغّل — **قرار عميل**

**الحالة: قائم.**

**الدليل**
- `OpView` (`OperatorShell.tsx:15`) = `'inbox' | 'tenders' | 'file' | 'request' | 'reports'` — لا عضو موافقات.
- `PRIMARY` (`:40-44`) ثلاثة بنود · المجموعة الثانوية «أدوات ومراجع» تحمل التقارير.
- توجيه المشغّل في `App.tsx:186,189,210,211` — لا `#/operator/approvals`.
- المقابل الإداري قائم وحده: `App.tsx:303` → `<AdminShell view="approvals"><Approvals /></AdminShell>`.

**خطة التعديل:** لا تنفيذ بلا كلمة العميل. حين تأتي: **نسخة نطاقية** — `Approvals.tsx` يقرأ سلسلة المحفظة كاملة، وبوابة المشغّل لا ترى إلا شركتها. السابقة قائمة ومُختبَرة: `routes.test.tsx:112` *«offers ONLY this company fields — the portal never lists the other operators»*. أي نسخ بلا هذا الحصر تسريب نطاق، لا بند تنقّل.

**الحجم: M (بعد الكلمة)**

---

# الترتيب المقترح للتنفيذ

المنطق: ما لا قرار فيه ولا خطر أولاً (تُودَع كلها في جلسة واحدة)، ثم ما يمسّ البكسل، ثم ما يبني جديداً. **ب-1 قبل ج-2** لأن `.paths-*` تعتمد `--m-*`.

| # | البند | الحجم | لماذا هنا |
|---|---|---|---|
| 1 | **أ-1** المتغيّرات غير المستعملة **+ رفع العلمين إلى `tsconfig.base.json`** | S | 4 إصلاحات تُغلق الباب للأبد. ارفع العلمين في نفس الإيداع وإلا عاد الزغب. |
| 2 | **أ-2ب** حذف صنفَي CSS الميتَين | S | سطران، صفر خطر. |
| 3 | **أ-3** حذف 3 مفاتيح يتيمة | S | 6 أسطر JSON. |
| 4 | **أ-5** توحيد `fmtCount` | S | سطران، ويصلح فرقاً حقيقياً فوق الألف. |
| 5 | **ب-3** تعليق `RESET` | S | سطر واحد يمنع إعادة اكتشافه في كل جولة. |
| 6 | **أ-4** نقل `design-v2-ref/` إلى `ops/` | S | **افعله قبل أول إيداع** — المجلد غير متتبَّع، فالنقل الآن بلا تاريخ يُعاد كتابته. |
| 7 | **ب-1** تحرير عائلة `--m-*` كاملةً | M | أول بند يمسّ البكسل، **ويصلح خللاً قائماً** في `ContractProfile`/`TenderReview`/`FileBidders`. شرط لـ11. |
| 8 | **ب-5** هجرة `EmptyState` (٩) + ولادة `.ad-note` (٨) | M | يقتل `.ad-empty-inline` بالكامل — وإلّا بقي البند نصفه. |
| 9 | **ب-2** عدّ MCT في أثر العطل | M | يحتاج مساعداً جديداً في `store.tsx` + اختبار وحدة. |
| 10 | **ج-3** `SectionExplainer` على الثلاث | M | نصّ أكثر منه شيفرة؛ يُنجَز بالتوازي. |
| 11 | **ج-2أ** هجرة `PathsGuide` + `Audit` | S | بعد ب-1. يقتل `.mct-head`. |
| 12 | **ج-2ب** هجرة `Compliance` + `Reports` → موت `.op-legacy` | M | آخر تخطيط موازٍ يزول. |
| 13 | **ج-1** شاشة الإعدادات | M | آخر ما يُبنى: ثلاث آليات جديدة (`ThemePref` ثلاثي · `textSize.ts` · كتلة تباين) + توسيع سكربت ما قبل الرسم. |
| — | **ب-4** سياسة العطل الرجعية · **ج-4** موافقات المشغّل | — | **قرار عميل — تُعرض ولا تُنفَّذ.** |

## قاعدة التنفيذ (منقولة من السجل)

كل بند: تنفيذ ← تحقّق ثلاثي ← إيداع مستقلّ على `design-v2` (أو فرع نظافة لاحق) — ولا يُنفَّذ بند «قرار عميل» بلا كلمته.
