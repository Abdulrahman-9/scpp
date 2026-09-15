import { PrismaClient } from '@prisma/client';

/**
 * Seed — mirrors apps/web/src/store.tsx seedState() so the API serves the same
 * demo data the frontend prototyped against. Idempotent: clears then inserts.
 *
 * Ids are the client's own stable ids ('op-alwaha', 'f-ahdab', 'sc-ahdab', …) rather than
 * generated cuids, so a row in the database and the same row in the client seed
 * are literally the same record — the only way the two universes stay comparable.
 */
const prisma = new PrismaClient();

/**
 * The 12 Lead Contractors of نفط الوسط (MDOC), adopted verbatim from the delivery registry
 * (spec §1 — «12 شركة»). GeoJade holds two fields, which is why 13 fields sit under 12 companies.
 */
const OPERATORS: { id: string; name: string; nameEn: string }[] = [
  { id: 'op-ebe', name: 'شركة شرقي بغداد الصينية', nameEn: 'EBE-Chinese' },
  { id: 'op-crescent', name: 'شركة نفط الهلال الإماراتية', nameEn: 'Crescent UAE' },
  { id: 'op-geojade', name: 'جيو-جاد الصينية', nameEn: 'GeoJade' },
  { id: 'op-fze', name: 'FZE', nameEn: 'FZE' },
  { id: 'op-kar', name: 'KAR', nameEn: 'KAR' },
  { id: 'op-fbn', name: 'FBN', nameEn: 'FBN' },
  { id: 'op-ebn', name: 'EBN', nameEn: 'EBN' },
  { id: 'op-ado', name: 'ADO Digital Energy', nameEn: 'ADO' },
  { id: 'op-cnooc', name: 'CNOOC Africa Holding', nameEn: 'CNOOC' },
  { id: 'op-qarnayn', name: 'Qarnayn Petroleum Co. Ltd.', nameEn: 'Qarnayn' },
  { id: 'op-alwaha', name: 'شركة نفط الواحة الصينية', nameEn: 'AlWaha' },
  { id: 'op-badra', name: 'مشروع بدرة', nameEn: 'Badra' },
];

/**
 * The 13 MDOC-area oil fields (spec §1) with the Financial Authority their Service Contract
 * grants (§7.1 — FA lives on the contract, never on the operator) and the contract-end date the
 * registry states. Ids, codes, names, FA figures and expiries mirror store.tsx seedState()
 * exactly, so `aboveOwnFA` resolves identically on both sides: t1 (Ahdab 4.2M < 5M) is within
 * authority, t3 (Mansuria 7.8M > 2M) and t4 (Block-07 12.4M > 4.5M) are above it.
 */
const FIELDS: { id: string; name: string; nameEn: string; code: string; operatorId: string; faUSD: number; expiresOn: string }[] = [
  { id: 'f-ebaghdad-s', name: 'حقل شرقي بغداد - الجنوبية', nameEn: 'East Baghdad – South', code: 'EBAGHDAD-S', operatorId: 'op-ebe', faUSD: 4_000_000, expiresOn: '2030-12-31' },
  { id: 'f-khashm-anjana', name: 'حقل خشم الأحمر / أنجانة', nameEn: 'Khashm al-Ahmar / Anjana', code: 'KHASHM-ANJANA', operatorId: 'op-crescent', faUSD: 2_500_000, expiresOn: '2028-06-30' },
  { id: 'f-naft-khana', name: 'حقل نفط خانة', nameEn: 'Naft Khana', code: 'NAFT-KHANA', operatorId: 'op-geojade', faUSD: 3_000_000, expiresOn: '2029-03-31' },
  { id: 'f-mansuria', name: 'حقل المنصورية', nameEn: 'Mansuria', code: 'MANSURIA', operatorId: 'op-fze', faUSD: 2_000_000, expiresOn: '2027-11-30' },
  { id: 'f-khalisiya', name: 'رقعة الخليصية', nameEn: 'Khalisiya Block', code: 'KHALISIYA', operatorId: 'op-kar', faUSD: 3_000_000, expiresOn: '2031-04-30' },
  { id: 'f-zurbatiya', name: 'حقل زرباطية', nameEn: 'Zurbatiya', code: 'ZURBATIYA', operatorId: 'op-geojade', faUSD: 2_500_000, expiresOn: '2029-09-30' },
  { id: 'f-furat-mid', name: 'حقول الفرات الأوسط', nameEn: 'Middle Euphrates Fields', code: 'FURAT-MID', operatorId: 'op-fbn', faUSD: 4_000_000, expiresOn: '2028-02-29' },
  { id: 'f-ebaghdad-n', name: 'حقل شرقي بغداد - الامتدادات الشمالية', nameEn: 'East Baghdad – Northern Extensions', code: 'EBAGHDAD-N', operatorId: 'op-ebn', faUSD: 3_500_000, expiresOn: '2030-08-31' },
  { id: 'f-dhufriya', name: 'حقل الظفرية', nameEn: 'Dhufriya', code: 'DHUFRIYA', operatorId: 'op-ado', faUSD: 2_000_000, expiresOn: '2028-12-31' },
  { id: 'f-block-07', name: 'الرقعة السابعة', nameEn: 'Block 07', code: 'BLOCK-07', operatorId: 'op-cnooc', faUSD: 4_500_000, expiresOn: '2032-05-31' },
  { id: 'f-qarnayn', name: 'رقعة القرنين', nameEn: 'Qarnayn Block', code: 'QARNAYN', operatorId: 'op-qarnayn', faUSD: 2_500_000, expiresOn: '2029-07-31' },
  { id: 'f-ahdab', name: 'حقل الأحدب النفطي', nameEn: 'Ahdab Oil Field', code: 'AHDAB', operatorId: 'op-alwaha', faUSD: 5_000_000, expiresOn: '2031-01-31' },
  { id: 'f-badra', name: 'حقل بدرة', nameEn: 'Badra', code: 'BADRA', operatorId: 'op-badra', faUSD: 3_000_000, expiresOn: '2027-06-30' },
];

/** Service Contract id/code convention of the client seed: `sc-ahdab` / `SC-AHDAB-24`. Signing is
 *  one documented demo convention; the expiry is the registry's own contract-end (see FIELDS). */
const CONTRACT_SIGNED_ON = new Date('2024-01-01');

async function main() {
  // wipe in FK-safe order (children before parents)
  await prisma.auditLog.deleteMany();
  await prisma.guarantee.deleteMany();
  await prisma.liquidatedDamage.deleteMany();
  await prisma.extension.deleteMany();
  await prisma.variationOrder.deleteMany();
  await prisma.contract.deleteMany();
  await prisma.mctCase.deleteMany();
  await prisma.ratification.deleteMany();
  await prisma.bidderMaterialDeclaration.deleteMany();
  await prisma.bidder.deleteMany();
  await prisma.stateCompanyResponse.deleteMany();
  await prisma.announcement.deleteMany();
  await prisma.document.deleteMany();
  await prisma.stage.deleteMany();
  await prisma.tender.deleteMany();
  await prisma.vendorEvent.deleteMany();
  await prisma.vendor.deleteMany();
  await prisma.user.deleteMany();
  await prisma.serviceContract.deleteMany();
  await prisma.field.deleteMany();
  await prisma.operator.deleteMany();
  await prisma.holiday.deleteMany();

  // Financial Authority is NOT written here — it is a property of the field's Service
  // Contract (§7.1), created below. An Operator row carries identity only.
  await prisma.operator.createMany({ data: OPERATORS });

  await prisma.field.createMany({
    data: FIELDS.map(({ id, name, nameEn, code, operatorId }) => ({ id, name, nameEn, code, operatorId })),
  });
  await prisma.serviceContract.createMany({
    data: FIELDS.map((f) => ({
      id: `sc-${f.code.toLowerCase()}`,
      code: `SC-${f.code}-24`,
      fieldId: f.id,
      financialAuthorityUSD: f.faUSD,
      signedOn: CONTRACT_SIGNED_ON,
      expiresOn: new Date(f.expiresOn),
    })),
  });

  // azureOid values match DEMO_IDENTITIES / seedState() in the client, so a session minted
  // against this database resolves to the same account on both sides.
  await prisma.user.createMany({
    data: [
      { azureOid: 'oid-opadmin-01', name: 'م. أحمد عبد الرحمن', email: 'ahmed.abdulrahman@alwaha.iq', role: 'OPERATOR_ADMIN', operatorId: 'op-alwaha' },
      { azureOid: 'oid-opuser-01', name: 'كرار محسن', email: 'karrar.mohsin@badra.iq', role: 'OPERATOR_USER', operatorId: 'op-badra' },
      // azureOid keeps its `oid-roc-*` spelling on purpose: it is the immutable Azure object id
      // that binds sessions and persisted client blobs to this account. Renaming an identifier
      // that exists to never change would strand every stored session for a cosmetic gain.
      { azureOid: 'oid-roc-01', name: 'د. سارة الجبوري', email: 'sara.jubouri@mdoc.iq', role: 'MDOC_ADMIN' },
      // اللجنة المشتركة (client request 19ب) — the ط2 seat. `auth.controller.ts` mints a session
      // for the first ENABLED user of the requested role, so without this row the JMC login the
      // LoginDto now accepts would 401 and the tier-2 gate would be untestable against a database.
      // Platform-scoped (no operatorId): a joint committee sits above any one operating company.
      { azureOid: 'oid-jmc-01', name: 'م. رافد الدليمي', email: 'rafid.dulaimi@jmc.iq', role: 'JMC_APPROVER' },
      { azureOid: 'oid-jmc-02', name: 'سُهاد العزاوي', email: 'suhad.azzawi@jmc.iq', role: 'JMC_APPROVER' },
    ],
  });

  await prisma.vendor.createMany({
    data: [
      { name: 'شركة الحفر العراقية', mooListed: true, techScore: 88, financialScore: 76, hseScore: 82 },
      { name: 'Basra Energy Services', mooListed: true, techScore: 79, financialScore: 85, hseScore: 74 },
      { name: 'النور للمقاولات النفطية', mooListed: false, techScore: 62, financialScore: 58, hseScore: 66 },
      {
        name: 'دجلة للخدمات النفطية',
        mooListed: true,
        suspended: true,
        banUntil: new Date('2026-11-01'),
        banReason: 'Refused to sign an awarded contract (14.3)',
        techScore: 71,
        financialScore: 64,
        hseScore: 59,
      },
      // the five Iraqi state companies (Article 25 / §9) — compete under the ordinary 10.4 gates (C8.4)
      { name: 'شركة حفر الآبار النفطية (IDC)', isStateCompany: true, mooListed: true, techScore: 84, financialScore: 80, hseScore: 83 },
      { name: 'شركة مشاريع النفط (SCOP)', isStateCompany: true, mooListed: true, techScore: 86, financialScore: 82, hseScore: 85 },
      { name: 'الشركة العامة للهندسة الكهربائية (HEESCO)', isStateCompany: true, mooListed: true, techScore: 78, financialScore: 75, hseScore: 79 },
      { name: 'شركة النفط الوطنية العراقية للهندسة (OEC)', isStateCompany: true, mooListed: false, techScore: 80, financialScore: 77, hseScore: 81 },
      { name: 'شركة تطوير حقول النفط (PRDC)', isStateCompany: true, mooListed: true, techScore: 82, financialScore: 79, hseScore: 84 },
    ],
  });

  // Tender 1 — public, at technical-analysis. Ahdab (op-alwaha): 4.2M < its 5M contract FA,
  // so §9 does not trigger even though the scope is DRILLING. 4.2M ≤ 5M also puts it in the
  // OPERATOR band of the global approval ladder (ق1) — no external approval act at all.
  const t1 = await prisma.tender.create({
    data: {
      code: 'AH-DRL-0212',
      titleAr: 'حفر آبار تطويرية — حقل الأحدب',
      titleEn: 'Development well drilling — Ahdab field',
      budgetCode: 'AH-DRL-77',
      estimatedValueUSD: 4_200_000,
      method: 'PUBLIC',
      scope: 'DRILLING',
      operatorId: 'op-alwaha',
      fieldId: 'f-ahdab',
      evaluationStep: 1,
      announcement: {
        create: {
          mode: 'PUBLIC',
          periodDays: 23,
          newspapers: ['الصباح', 'الزمان', 'المدى'],
          lcWebsite: true,
          rocWebsite: true,
          publishedOn: new Date('2026-05-13'),
        },
      },
      bidders: {
        create: [
          { name: 'شركة الحفر العراقية', docsOk: true, bondOk: true, technicalResult: 'PASS' },
          { name: 'النور للمقاولات النفطية', docsOk: true, bondOk: true, technicalResult: 'FAIL' },
          { name: 'Basra Energy Services', docsOk: true, bondOk: true, technicalResult: 'PASS' },
        ],
      },
    },
  });
  const t1Stages = ['cost', 'approval', 'announce', 'tech-open', 'tech-analysis', 'comm-open', 'comm-analysis', 'ratify', 'sign'];
  await prisma.stage.createMany({
    data: t1Stages.map((key, order) => ({ tenderId: t1.id, key, order })),
  });

  // Tender 3 — above FA → MCT case, at ratification. Mansuria belongs to op-fze (the
  // field/operator invariant the create path enforces), and its 2M contract FA is what
  // 7.8M exceeds — the MCT cycle below is a consequence of that figure, not a decoration.
  // On the approval ladder (ق1) 7.8M lands between 5M and 10M → the JMC band.
  const t3 = await prisma.tender.create({
    data: {
      code: 'MN-EPC-0305',
      titleAr: 'إنشاء محطة معالجة الغاز المركزية — حقل المنصورية',
      titleEn: 'Central gas processing station EPC — Mansuria field',
      budgetCode: 'MN-EPC-04',
      estimatedValueUSD: 7_800_000,
      method: 'PUBLIC',
      // §9 — EPC above authority triggers C8.1/C8.2; a documented SCOP decline makes it a lawful exemption
      scope: 'ENGINEERING_CONSTRUCTION',
      stateResponses: { create: [{ company: 'SCOP', status: 'DECLINED', evidence: 'اعتذار رسمي موثّق من الشركة لارتباط طاقتها بمشروع قائم (كتاب 2026/155)' }] },
      operatorId: 'op-fze',
      fieldId: 'f-mansuria',
      evaluationStep: 3,
      mct: {
        create: {
          notifiedOn: new Date('2026-05-24'),
          meetingHeldOn: new Date('2026-06-08'),
          lcEstimateUSD: 7_800_000,
          mctEstimateUSD: 7_500_000,
        },
      },
      bidders: {
        create: [
          { name: 'Gulf EPC Contracting', docsOk: true, bondOk: true, technicalResult: 'PASS', priceUSD: 8_120_000 },
          { name: 'شركة المشاريع النفطية SCOP', docsOk: true, bondOk: true, technicalResult: 'PASS', priceUSD: 8_940_000 },
          { name: 'الفرات للإنشاءات', docsOk: true, bondOk: true, technicalResult: 'FAIL' },
        ],
      },
    },
  });
  await prisma.stage.createMany({
    data: t1Stages.map((key, order) => ({ tenderId: t3.id, key, order })),
  });

  // Tender 4 — the third band of the approval ladder (ق1): 12.4M is past the 10M JMC ceiling,
  // so it waits on نفط الوسط itself. Block-07 belongs to op-cnooc and its 4.5M contract FA is
  // what 12.4M exceeds, which is what opened the MCT case. §9: EPC above FA with an ACCEPTED
  // state-company response → the `compliant` state, next to t3's documented `exempt`.
  const t4 = await prisma.tender.create({
    data: {
      code: 'B7-FAC-0331',
      titleAr: 'إنشاء منشآت الإنتاج السطحية المركزية — الرقعة السابعة',
      titleEn: 'Central surface production facilities EPC — Block 07',
      budgetCode: 'B7-FAC-09',
      estimatedValueUSD: 12_400_000,
      method: 'PUBLIC',
      scope: 'ENGINEERING_CONSTRUCTION',
      localContentClauseAffixed: true,
      stateResponses: { create: [{ company: 'SCOP', status: 'ACCEPTED' }] },
      operatorId: 'op-cnooc',
      fieldId: 'f-block-07',
      evaluationStep: 0,
      mct: { create: { notifiedOn: new Date('2026-06-16'), lcEstimateUSD: 12_400_000 } },
    },
  });
  await prisma.stage.createMany({
    data: t1Stages.map((key, order) => ({ tenderId: t4.id, key, order })),
  });

  // Post-award contract with live caps
  const contract = await prisma.contract.create({
    data: {
      code: 'AH-CON-0188',
      tenderId: t1.id,
      valueUSD: 12_500_000,
      termDays: 540,
      signedOn: new Date('2026-03-01'),
    },
  });
  await prisma.variationOrder.create({ data: { contractId: contract.id, valueUSD: 1_050_000, approvedOn: new Date('2026-05-01') } });
  await prisma.extension.create({ data: { contractId: contract.id, days: 90, approvedOn: new Date('2026-05-10') } });
  await prisma.liquidatedDamage.create({ data: { contractId: contract.id, valueUSD: 310_000, appliedOn: new Date('2026-06-01') } });
  await prisma.guarantee.createMany({
    data: [
      { contractId: contract.id, kind: 'PERFORMANCE', valueUSD: 650_000, expiresOn: new Date('2026-07-20') },
      { contractId: contract.id, kind: 'ADVANCE', valueUSD: 1_000_000, expiresOn: new Date('2027-01-15') },
    ],
  });

  console.log(
    `Seed complete: ${OPERATORS.length} operators, ${FIELDS.length} fields + service contracts, 5 users, 9 vendors, 3 tenders, 1 contract.`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
