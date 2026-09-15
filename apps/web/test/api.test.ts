// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from '../src/api/client';
import { loadFullState, runAction } from '../src/api/endpoints';
import { mapAudit, mapContract, mapTender, mapVendor } from '../src/api/mappers';
import type { ApiContract, ApiTender, ApiVendor } from '../src/api/types';

afterEach(() => vi.restoreAllMocks());

describe('api client', () => {
  it('sends credentials and parses JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: 1 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const out = await api<{ ok: number }>('/health');
    expect(out.ok).toBe(1);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/health'), expect.objectContaining({ credentials: 'include' }));
  });

  it('throws ApiError carrying the server payload on failure', async () => {
    const body = { message: 'Pre-publish checks failed', checks: [{ id: 'period-21d', ok: false }] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 400 })));
    await expect(api('/tenders/x/publish', { method: 'POST' })).rejects.toMatchObject({
      name: 'ApiError',
      status: 400,
    });
  });

  it('joins array validation messages', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: ['a', 'b'] }), { status: 422 })));
    await expect(api('/x')).rejects.toThrow('a, b');
  });
});

describe('loadFullState — the api-mode hydrate', () => {
  it('carries the global approval ladder so api mode does not fail closed to MDOC on every tender', () => {
    // NAMED DEBT: there is no /config route yet, so both modes read the one seeded constant.
    // This also pins the store⇄endpoints value import: the ladder is read at CALL time, so the
    // circular module graph cannot land it in the temporal dead zone.
    // a FRESH Response per call — loadFullState fans out in parallel and a body reads only once
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify([]), { status: 200 }))));
    return loadFullState('SUPER_ADMIN').then((s) => {
      expect(s.approvalTiers).toEqual({ operatorMaxUSD: 5_000_000, jmcMaxUSD: 10_000_000 });
    });
  });
});

describe('runAction — CREATE_TENDER wire body', () => {
  /** Read the JSON body the stubbed fetch was called with. */
  const bodyOf = (fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> =>
    JSON.parse((fetchMock.mock.calls[0]![1] as { body: string }).body) as Record<string, unknown>;

  it('sends fieldId and scope — CreateTenderDto requires fieldId under forbidNonWhitelisted', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ tender: { id: 'new' } }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    const out = await runAction({
      type: 'CREATE_TENDER',
      title: { ar: 'حفر آبار', en: 'Well drilling' },
      budgetCode: 'DRL',
      estimatedValueUSD: 6_000_000,
      methodId: 7,
      operatorId: 'op-alwaha',
      fieldId: 'f-ahdab',
      scope: 'DRILLING',
      stageDates: { cost: { plannedFrom: '2026-08-10', plannedTo: '2026-08-14' } },
    });

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/tenders'), expect.objectContaining({ method: 'POST' }));
    const body = bodyOf(fetchMock);
    expect(body.fieldId).toBe('f-ahdab');
    expect(body.scope).toBe('DRILLING');
    expect(body.titleAr).toBe('حفر آبار');
    expect(body.stagePlan).toEqual([{ key: 'cost', plannedFrom: '2026-08-10', plannedTo: '2026-08-14' }]);
    // the response carries no full tender — the caller re-hydrates
    expect(out).toEqual({ reload: true });
  });

  it('omits scope when the action carries none (server default OTHER) but still sends fieldId', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ tender: { id: 'new' } }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    await runAction({
      type: 'CREATE_TENDER',
      title: { ar: 'صيانة', en: 'Maintenance' },
      budgetCode: 'MNT',
      estimatedValueUSD: 500_000,
      methodId: 6,
      fieldId: 'f-badra',
    });

    const body = bodyOf(fetchMock);
    expect(body.fieldId).toBe('f-badra');
    expect('scope' in body).toBe(false);
  });
});

describe('runAction — SET_LC_CLAUSE (§9 C8.1)', () => {
  it('PATCHes the local-content-clause route with the attested value', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        id: 't3', code: 'MN-EPC-0305', titleAr: 'إنشاء', titleEn: 'EPC', budgetCode: 'MN-EPC-04',
        estimatedValueUSD: '7800000', method: 'PUBLIC', overrideJustification: null,
        createdOn: '2026-04-20T00:00:00Z', evaluationStep: 0, stages: [], announcement: null,
        bidders: [], mct: null, ratification: null, scope: 'ENGINEERING_CONSTRUCTION',
        localContentClauseAffixed: true,
      }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const out = await runAction({
      type: 'SET_LC_CLAUSE',
      tenderId: 't3',
      affixed: true,
      by: { oid: 'oid-opadmin-01', name: 'م. أحمد عبد الرحمن', role: 'OPERATOR_ADMIN' },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/tenders/t3/local-content-clause'),
      expect.objectContaining({ method: 'PATCH' }),
    );
    expect(JSON.parse((fetchMock.mock.calls[0]![1] as { body: string }).body)).toEqual({ affixed: true, byOid: 'oid-opadmin-01' });
    expect(out.tender?.localContentClauseAffixed).toBe(true);
  });
});

describe('mapTender', () => {
  const apiTender: ApiTender = {
    id: 't1', code: 'RU-1', titleAr: 'حفر', titleEn: 'Drill', budgetCode: 'RU-77',
    estimatedValueUSD: '4200000', // Decimal as string
    method: 'PUBLIC', overrideJustification: null, createdOn: '2026-04-28T00:00:00.000Z', evaluationStep: 1,
    stages: [
      { key: 'tech-analysis', order: 4, plannedFrom: '2026-06-10T00:00:00Z', plannedTo: '2026-06-21T00:00:00Z', actualTo: null, documents: [] },
      { key: 'cost', order: 0, plannedFrom: null, plannedTo: null, actualTo: '2026-05-07T00:00:00Z', documents: [{ kind: 'stage-report' }] },
    ],
    announcement: { mode: 'PUBLIC', periodDays: 23, newspapers: ['الصباح', 'الزمان', 'المدى'], lcWebsite: true, rocWebsite: true, inviteeCount: 0, inviteesPreQualified: false, publishedOn: '2026-05-13T00:00:00Z' },
    bidders: [{ id: 'b1', name: 'Co', docsOk: true, bondOk: true, technicalResult: 'PASS', priceUSD: '4410000' }],
    mct: null,
    ratification: { status: 'RATIFIED', by: 'MDOC', on: '2026-06-13T10:00:00Z', notes: null },
  };

  it('converts enums, decimals, dates and sorts stages by order', () => {
    const t = mapTender(apiTender);
    expect(t.methodId).toBe(7);
    expect(t.estimatedValueUSD).toBe(4_200_000);
    expect(t.title).toEqual({ ar: 'حفر', en: 'Drill' });
    expect(t.stages.map((s) => s.key)).toEqual(['cost', 'tech-analysis']); // sorted by order
    expect(t.stages[0]!.actualTo).toBe('2026-05-07');
    expect(t.stages[0]!.uploadedDocs).toEqual(['stage-report']);
    expect(t.announcement.mode).toBe('public');
    expect(t.bidders[0]!.technicalResult).toBe('pass');
    expect(t.bidders[0]!.priceUSD).toBe(4_410_000);
    expect(t.ratification).toEqual({ status: 'ratified', by: 'MDOC', on: '2026-06-13', notes: undefined });
  });
});

describe('mapContract', () => {
  it('sums VOs / extensions / LDs and maps guarantee kinds', () => {
    const c: ApiContract = {
      id: 'c1', code: 'AH-CON', valueUSD: '12500000', termDays: 540,
      tender: { titleAr: 'عقد', titleEn: 'Contract' },
      guarantees: [{ kind: 'PERFORMANCE', valueUSD: '650000', expiresOn: '2026-07-20T00:00:00Z' }],
      vos: [{ valueUSD: '1050000' }],
      extensions: [{ days: 90 }],
      lds: [{ valueUSD: '310000' }],
    };
    const m = mapContract(c);
    expect(m.voTotalUSD).toBe(1_050_000);
    expect(m.extensionDays).toBe(90);
    expect(m.ldTotalUSD).toBe(310_000);
    expect(m.guarantees[0]!.kind).toBe('performance');
    expect(m.guarantees[0]!.expiresOn).toBe('2026-07-20');
    expect(m.title.ar).toBe('عقد');
  });
});

describe('mapVendor / mapAudit', () => {
  it('maps a suspended vendor with a ban', () => {
    const v: ApiVendor = {
      id: 'v4', name: 'دجلة', mooListed: true, suspended: true, blacklisted: false, inDispute: false,
      banUntil: '2026-11-01T00:00:00Z', banReason: 'Refused to sign (14.3)', techScore: 71, financialScore: 64, hseScore: 59,
    };
    const m = mapVendor(v);
    expect(m.suspended).toBe(true);
    expect(m.blacklisted).toBeUndefined();
    expect(m.banUntil).toBe('2026-11-01');
    expect(m.banReason).toEqual({ ar: 'Refused to sign (14.3)', en: 'Refused to sign (14.3)' });
  });

  it('maps an audit entry', () => {
    expect(mapAudit({ ts: '2026-06-13T10:00:00Z', action: 'RATIFY', target: 'RU-1' })).toEqual({
      ts: '2026-06-13T10:00:00Z', action: 'RATIFY', target: 'RU-1',
    });
  });
});
