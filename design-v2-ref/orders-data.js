// بيانات مشتركة — الطلبيات والمراحل (مصدر واحد لكل الشاشات)
export const STAGES = [
  { n: 1, name: 'البداية', planned: 2 },
  { n: 2, name: 'المصادقة على الكلفة', planned: 5 },
  { n: 3, name: 'الصلاحية المالية', planned: 3 },
  { n: 4, name: 'اعتماد الأسلوب', planned: 4 },
  { n: 5, name: 'الإعلان', planned: 21 },
  { n: 6, name: 'الفتح الفني', planned: 1 },
  { n: 7, name: 'التحليل الفني', planned: 10 },
  { n: 8, name: 'الفتح التجاري', planned: 1 },
  { n: 9, name: 'التحليل التجاري', planned: 7 },
  { n: 10, name: 'المصادقة على الإحالة', planned: 5 },
  { n: 11, name: 'توقيع العقد', planned: 7 },
  { n: 12, name: 'النهاية', planned: 1 },
];

export const STATUSES = [
  { k: 'pending', label: 'معلق' },
  { k: 'approved', label: 'معتمد' },
  { k: 'preparing', label: 'قيد التجهيز' },
  { k: 'delivered', label: 'مُسلَّم' },
  { k: 'cancelled', label: 'ملغي' },
];

export const TIERS = {
  t1: { n: 'ط1', label: 'ضمن الصلاحية' },
  t2: { n: 'ط2', label: 'اللجنة المشتركة' },
  t3: { n: 'ط3', label: 'نفط الوسط' },
};

export const ORDERS = [
  { code: 'PO-2026-0148', title: 'توريد مضخات غاطسة — حقل الأحدب', op: 'شركة نفط الواحة الصينية', field: 'حقل الأحدب النفطي', path: 'المناقصة العامة (11.1)', tier: 't3', value: 482900, st: 'pending', cur: 5, dev: 3, submitted: '2026-07-01', actuals: { 2: 6 }, inv: 0, bought: 6, bid: 0,
    items: [
      { name: 'مضخة غاطسة 40م³/سا مع محرك', qty: 8, unit: 'مجموعة', price: 38500 },
      { name: 'لوحة تحكم VFD مع حماية', qty: 8, unit: 'لوحة', price: 9200 },
      { name: 'كابلات تغذية مدرّعة 1.2كم', qty: 1, unit: 'مقطوعة', price: 54000 },
      { name: 'قطع غيار تشغيلية لعامين', qty: 1, unit: 'مقطوعة', price: 47300 },
    ],
    notes: 'تُقدَّم العطاءات وفق وثائق المناقصة القياسية. يشمل التجهيز النصب والتشغيل التجريبي لمدة 30 يوماً، وتُطبَّق اشتراطات المنشأ للمواد الحرجة (الملحق I).',
    log: [
      { who: 'حسن الجبوري', role: 'مشغّل — نفط الواحة', action: 'تقديم الطلبية', date: '2026-07-01' },
      { who: 'فريق الكلفة الوزاري', role: 'MCT', action: 'المصادقة على الكلفة التخمينية', date: '2026-07-09' },
      { who: 'م. مصطفى الكرخي', role: 'نفط الوسط — MDOC', action: 'اعتماد أسلوب المناقصة العامة', date: '2026-07-16' },
    ] },
  { code: 'PO-2026-0141', title: 'صيانة محطة الضخ المركزية — حقل بدرة', op: 'مشروع بدرة', field: 'حقل بدرة', path: 'المناقصة المحدودة (11.2)', tier: 't2', value: 1284000, st: 'preparing', cur: 7, dev: 0, submitted: '2026-06-10', actuals: {}, inv: 5, bought: 5, bid: 4,
    items: [
      { name: 'إصلاح وحدات الضخ الرئيسية', qty: 3, unit: 'وحدة', price: 310000 },
      { name: 'استبدال منظومة التحكم', qty: 1, unit: 'منظومة', price: 354000 },
    ],
    notes: 'العمل داخل محطة عاملة — يُشترط برنامج HSE معتمد وتنسيق الإيقافات مع إدارة الحقل.',
    log: [
      { who: 'لي وي', role: 'مشغّل — مشروع بدرة', action: 'تقديم الطلبية', date: '2026-06-10' },
      { who: 'اللجنة المشتركة', role: 'JMC', action: 'اعتماد المناقصة المحدودة', date: '2026-06-24' },
    ] },
  { code: 'PO-2026-0139', title: 'قطع غيار منظومة الفصل — المنصورية', op: 'FZE', field: 'حقل المنصورية', path: 'استدراج عروض (11.8.1)', tier: 't1', value: 96400, st: 'approved', cur: 6, dev: 0, submitted: '2026-06-22', actuals: {}, inv: 3, bought: 3, bid: 3, items: null, notes: '', log: null },
  { code: 'PO-2026-0127', title: 'أعمال مدنية لساحة الحفر — زرباطية', op: 'جيو-جاد الصينية', field: 'رقعة زرباطية', path: 'الدعوة المباشرة (11.4)', tier: 't1', value: 233750, st: 'delivered', cur: 12, dev: 0, submitted: '2026-03-04', actuals: { 5: 18, 7: 9 }, inv: 4, bought: 4, bid: 3, items: null, notes: '', log: null },
  { code: 'PO-2026-0118', title: 'مواد كيمياوية للمعالجة — نفط خانة', op: 'جيو-جاد الصينية', field: 'حقل نفط خانة', path: 'المسار السريع (11.7)', tier: 't1', value: 58200, st: 'cancelled', cur: 3, dev: 0, submitted: '2026-05-18', actuals: {}, inv: 0, bought: 0, bid: 0, items: null, notes: 'أُلغيت لتوفر المادة ضمن عقد إطاري نافذ (11.6).', log: null },
  { code: 'PO-2026-0132', title: 'تجهيز أنابيب تغليف — حقل بدرة', op: 'مشروع بدرة', field: 'حقل بدرة', path: 'المناقصة المحدودة (11.2)', tier: 't2', value: 1120000, st: 'pending', cur: 10, dev: 0, submitted: '2026-04-02', actuals: {}, inv: 6, bought: 6, bid: 5, items: null, notes: '', log: null },
  { code: 'PO-2026-0125', title: 'خدمات فحص جودة اللحام — الرقعة السابعة', op: 'CNOOC Africa Holding', field: 'الرقعة السابعة', path: 'الدعوة المباشرة (11.4)', tier: 't3', value: 4860000, st: 'preparing', cur: 10, dev: 6, submitted: '2026-02-16', actuals: { 5: 25, 7: 14 }, inv: 5, bought: 5, bid: 4,
    items: null, notes: '',
    log: [
      { who: 'وانغ جيان', role: 'مشغّل — CNOOC', action: 'تقديم الطلبية', date: '2026-02-16' },
      { who: 'فريق الكلفة الوزاري', role: 'MCT', action: 'المصادقة على الكلفة (ضمن ±20%)', date: '2026-03-02' },
      { who: 'اللجنة المشتركة', role: 'JMC', action: 'اعتماد الدعوة المباشرة', date: '2026-03-11' },
    ] },
  { code: 'PO-2026-0117', title: 'تأهيل خزانات النفط الخام — شرقي بغداد', op: 'شركة شرقي بغداد الصينية', field: 'شرقي بغداد - الجنوبية', path: 'المناقصة العامة (11.1)', tier: 't2', value: 2340000, st: 'preparing', cur: 10, dev: 1, submitted: '2026-03-20', actuals: {}, inv: 0, bought: 9, bid: 7, items: null, notes: '', log: null },
  { code: 'PO-2026-0112', title: 'منظومة إطفاء لمستودع الأنابيب — الأحدب', op: 'شركة نفط الواحة الصينية', field: 'حقل الأحدب النفطي', path: 'المناقصة بمرحلتين (11.3)', tier: 't2', value: 1975000, st: 'approved', cur: 11, dev: 0, submitted: '2026-01-27', actuals: {}, inv: 4, bought: 4, bid: 3, items: null, notes: '', log: null },
  { code: 'PO-2026-0104', title: 'تجهيز مواد عزل حراري — حقل كورمور الجنوبي', op: 'KAR', field: 'كورمور الجنوبي', path: 'شراء منخفض القيمة (11.8.3)', tier: 't1', value: 8900, st: 'delivered', cur: 12, dev: 0, submitted: '2026-04-12', actuals: {}, inv: 1, bought: 1, bid: 1, items: null, notes: '', log: null },
  { code: 'PO-2026-0098', title: 'عقد نقل المشتقات — الحقول الشرقية', op: 'EBN', field: 'الحقول الشرقية', path: 'المصدر الوحيد (11.5)', tier: 't1', value: 145000, st: 'preparing', cur: 8, dev: 2, submitted: '2026-04-28', actuals: {}, inv: 1, bought: 1, bid: 1, items: null, notes: 'مسوَّغ المصدر الوحيد: الحالة (ب) — مقاول وحيد مؤهل ضمن النطاق الجغرافي.', log: null },
  { code: 'PO-2026-0091', title: 'أجهزة قياس ضغط الآبار — حقل الأحدب', op: 'ADO Digital Energy', field: 'حقل الأحدب النفطي', path: 'استدراج عروض (11.8.1)', tier: 't1', value: 64750, st: 'pending', cur: 2, dev: 0, submitted: '2026-08-14', actuals: {}, inv: 3, bought: 3, bid: 0, items: null, notes: '', log: null },
];

// الجهات — بيانات المشغّلين (الحقول تُشتق من الطلبيات)
export const OPERATORS = {
  'شركة نفط الواحة الصينية': { country: 'الصين', contact: 'حسن الجبوري', role: 'مدير العقود والمشتريات PCD' },
  'مشروع بدرة': { country: 'روسيا — غازبروم', contact: 'لي وي', role: 'رئيس قسم المشتريات' },
  'FZE': { country: 'الإمارات', contact: 'عمر السامرائي', role: 'منسق التعاقدات' },
  'جيو-جاد الصينية': { country: 'الصين', contact: 'تشن هاو', role: 'مدير المشتريات' },
  'CNOOC Africa Holding': { country: 'الصين', contact: 'وانغ جيان', role: 'مدير العقود' },
  'شركة شرقي بغداد الصينية': { country: 'الصين', contact: 'علي التميمي', role: 'مسؤول المشتريات' },
  'KAR': { country: 'العراق', contact: 'ريباز أحمد', role: 'مدير التعاقدات' },
  'EBN': { country: 'العراق', contact: 'سيف الدليمي', role: 'رئيس المشتريات' },
  'ADO Digital Energy': { country: 'الإمارات', contact: 'نور الخفاجي', role: 'منسقة العقود' },
};

// العقود بعد الإحالة — مراحل ما بعد التوقيع (p/a = يوم مخطط/فعلي من تاريخ التوقيع، a=null لم تنجز)
export const CONTRACT_STAGES = [
  { k: 'sign', name: 'توقيع العقد' },
  { k: 'bonds', name: 'إيداع الضمانات' },
  { k: 'mobilize', name: 'أمر المباشرة' },
  { k: 'execute', name: 'التنفيذ والمستخلصات' },
  { k: 'provisional', name: 'الاستلام الأولي' },
  { k: 'warranty', name: 'فترة الصيانة' },
  { k: 'final', name: 'الاستلام النهائي' },
];

// السقوف التعاقدية: أوامر التغيير ≤10% · التمديد ≤25% من المدة · غرامات التأخير ≤10% (SCPP §18/19/21)
export const CONTRACTS = [
  { code: 'CN-2026-014', po: 'PO-2026-0112', title: 'منظومة إطفاء لمستودع الأنابيب — الأحدب', op: 'شركة نفط الواحة الصينية', value: 1975000, signedOn: '2026-08-12', termDays: 210, vo: 0, extDays: 0, ld: 0, bondPct: 5,
    stages: [{ k: 'sign', p: 7, a: 3 }, { k: 'bonds', p: 21, a: null }, { k: 'mobilize', p: 35, a: null }, { k: 'execute', p: 158, a: null }, { k: 'provisional', p: 168, a: null }, { k: 'warranty', p: 200, a: null }, { k: 'final', p: 210, a: null }] },
  { code: 'CN-2026-013', po: 'PO-2026-0139', title: 'قطع غيار منظومة الفصل — المنصورية', op: 'FZE', value: 96400, signedOn: '2026-07-30', termDays: 90, vo: 4200, extDays: 0, ld: 0, bondPct: 5,
    stages: [{ k: 'sign', p: 7, a: 4 }, { k: 'bonds', p: 14, a: 12 }, { k: 'mobilize', p: 30, a: null }, { k: 'execute', p: 68, a: null }, { k: 'provisional', p: 72, a: null }, { k: 'warranty', p: 86, a: null }, { k: 'final', p: 90, a: null }] },
  { code: 'CN-2025-042', po: null, title: 'صيانة أبراج الحفر — حقل بدرة', op: 'مشروع بدرة', value: 3420000, signedOn: '2025-11-15', termDays: 365, vo: 291000, extDays: 60, ld: 0, bondPct: 5,
    stages: [{ k: 'sign', p: 7, a: 6 }, { k: 'bonds', p: 21, a: 25 }, { k: 'mobilize', p: 35, a: 38 }, { k: 'execute', p: 274, a: null }, { k: 'provisional', p: 292, a: null }, { k: 'warranty', p: 347, a: null }, { k: 'final', p: 365, a: null }] },
  { code: 'CN-2025-037', po: null, title: 'عقد نقل المشتقات التشغيلي — الحقول الشرقية', op: 'EBN', value: 1150000, signedOn: '2025-09-01', termDays: 300, vo: 46000, extDays: 90, ld: 128800, bondPct: 5,
    stages: [{ k: 'sign', p: 7, a: 7 }, { k: 'bonds', p: 21, a: 20 }, { k: 'mobilize', p: 35, a: 52 }, { k: 'execute', p: 225, a: null }, { k: 'provisional', p: 240, a: null }, { k: 'warranty', p: 285, a: null }, { k: 'final', p: 300, a: null }] },
  { code: 'CN-2026-011', po: 'PO-2026-0127', title: 'أعمال مدنية لساحة الحفر — زرباطية', op: 'جيو-جاد الصينية', value: 233750, signedOn: '2026-04-10', termDays: 120, vo: 18700, extDays: 0, ld: 0, bondPct: 5,
    stages: [{ k: 'sign', p: 7, a: 5 }, { k: 'bonds', p: 21, a: 18 }, { k: 'mobilize', p: 35, a: 30 }, { k: 'execute', p: 90, a: 95 }, { k: 'provisional', p: 96, a: 101 }, { k: 'warranty', p: 115, a: 115 }, { k: 'final', p: 120, a: 118 }] },
  { code: 'CN-2026-009', po: 'PO-2026-0104', title: 'تجهيز مواد عزل حراري — كورمور الجنوبي', op: 'KAR', value: 8900, signedOn: '2026-05-02', termDays: 30, vo: 0, extDays: 0, ld: 0, bondPct: 5,
    stages: [{ k: 'sign', p: 7, a: 4 }, { k: 'bonds', p: 10, a: 10 }, { k: 'mobilize', p: 12, a: 12 }, { k: 'execute', p: 22, a: 22 }, { k: 'provisional', p: 25, a: 25 }, { k: 'warranty', p: 28, a: 28 }, { k: 'final', p: 30, a: 30 }] },
];

export const fmtUSD = (v) => '$' + Number(v).toLocaleString('en-US');
export const addDays = (iso, d) => {
  const t = new Date(iso + 'T00:00:00');
  t.setDate(t.getDate() + d);
  return t.toISOString().slice(0, 10);
};
export const stLabel = (k) => (STATUSES.find((x) => x.k === k) || {}).label || k;
export const defaultItems = (o) => o.items || [{ name: 'بند توريد/خدمة عام وفق نطاق العمل', qty: 1, unit: 'مقطوعة', price: o.value }];
export const defaultLog = (o) => o.log || [{ who: o.op, role: 'المشغّل', action: 'تقديم الطلبية', date: o.submitted }];
