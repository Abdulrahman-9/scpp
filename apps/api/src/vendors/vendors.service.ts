import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { lowestQualified } from '@masaar/scpp-rules';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { presentTender } from '../tenders/tender.presenter.js';
import type { BanVendorDto, ScoresDto } from './dto.js';

const SCORE_KEYS = ['techScore', 'financialScore', 'hseScore'] as const;

@Injectable()
export class VendorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.vendor.findMany({ orderBy: { name: 'asc' } });
  }

  private async mustFind(id: string) {
    const v = await this.prisma.vendor.findUnique({ where: { id } });
    if (!v) throw new NotFoundException('Vendor not found');
    return v;
  }

  /** Entity 360° — base + documented event trail + participation history + computed stats. */
  async profile(user: AuthUser, id: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id },
      include: {
        events: { orderBy: { on: 'desc' } },
        bidders: { include: { tender: { include: { ratification: true, contract: true, stages: true, bidders: true } } } },
      },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');

    const participation = vendor.bidders.map((b) => {
      const t = b.tender;
      // reuse the fairness presenter so this vendor's own price obeys 12.4.2 here too
      const mine = presentTender(t, user).bidders.find((x) => x.id === b.id);
      const decided = t.ratification?.status === 'RATIFIED' || t.contract != null;
      const lowest = lowestQualified(
        t.bidders.map((x) => ({ id: x.id, technicalResult: x.technicalResult?.toLowerCase() as 'pass' | 'fail' | undefined, priceUSD: x.priceUSD == null ? undefined : Number(x.priceUSD) })),
      );
      return {
        tenderId: t.id,
        tenderCode: t.code,
        titleAr: t.titleAr,
        titleEn: t.titleEn,
        method: t.method,
        technicalResult: b.technicalResult,
        priceUSD: mine?.priceUSD ?? null,
        won: decided && lowest?.id === b.id,
        decidedOn: t.ratification?.on ?? null,
      };
    });

    const bids = participation.length;
    const passes = vendor.bidders.filter((b) => b.technicalResult === 'PASS').length;
    const wins = participation.filter((p) => p.won).length;
    const { events, bidders: _bidders, ...base } = vendor;
    return {
      vendor: base,
      events,
      participation,
      stats: {
        bids,
        technicalPassRate: bids ? Math.round((passes / bids) * 100) : 0,
        wins,
        winRate: bids ? Math.round((wins / bids) * 100) : 0,
      },
    };
  }

  async suspend(user: AuthUser, id: string, reason: string) {
    const v = await this.mustFind(id);
    if (v.suspended) throw new BadRequestException('Already suspended');
    await this.prisma.$transaction([
      this.prisma.vendor.update({ where: { id }, data: { suspended: true } }),
      this.prisma.vendorEvent.create({ data: { vendorId: id, kind: 'SUSPEND', reason, byUserId: user.userId } }),
    ]);
    await this.audit.record(user.userId, 'VENDOR_SUSPEND', v.name);
    return this.profile(user, id);
  }

  async liftSuspension(user: AuthUser, id: string, reason: string) {
    const v = await this.mustFind(id);
    if (!v.suspended) throw new BadRequestException('Not suspended');
    await this.prisma.$transaction([
      this.prisma.vendor.update({ where: { id }, data: { suspended: false } }),
      this.prisma.vendorEvent.create({ data: { vendorId: id, kind: 'LIFT_SUSPENSION', reason, byUserId: user.userId } }),
    ]);
    await this.audit.record(user.userId, 'VENDOR_LIFT_SUSPENSION', v.name);
    return this.profile(user, id);
  }

  async ban(user: AuthUser, id: string, dto: BanVendorDto) {
    const v = await this.mustFind(id);
    const until = new Date(`${dto.banUntil}T00:00:00.000Z`);
    const now = new Date();
    const maxBan = new Date(now);
    maxBan.setUTCMonth(maxBan.getUTCMonth() + 12); // 14.3: refusal-to-sign ban ≤ 12 months
    if (until <= now || until > maxBan) {
      await this.audit.record(user.userId, 'VENDOR_BAN_REFUSED', `${v.name} (14.3)`);
      throw new BadRequestException('Ban must be a future date within 12 months (14.3)');
    }
    await this.prisma.$transaction([
      this.prisma.vendor.update({ where: { id }, data: { banUntil: until, banReason: dto.reason } }),
      this.prisma.vendorEvent.create({ data: { vendorId: id, kind: 'BAN', reason: dto.reason, payload: { banUntil: dto.banUntil }, byUserId: user.userId } }),
    ]);
    await this.audit.record(user.userId, 'VENDOR_BAN', `${v.name} until ${dto.banUntil} (14.3)`);
    return this.profile(user, id);
  }

  async setScores(user: AuthUser, id: string, dto: ScoresDto) {
    const v = await this.mustFind(id);
    const data: Record<string, number> = {};
    const payload: Record<string, { from: number | null; to: number }> = {};
    for (const key of SCORE_KEYS) {
      const next = dto[key];
      if (next != null) {
        data[key] = next;
        payload[key] = { from: v[key], to: next };
      }
    }
    if (Object.keys(data).length === 0) throw new BadRequestException('At least one score is required');
    await this.prisma.$transaction([
      this.prisma.vendor.update({ where: { id }, data }),
      this.prisma.vendorEvent.create({ data: { vendorId: id, kind: 'SCORE_EDIT', reason: dto.reason, payload, byUserId: user.userId } }),
    ]);
    await this.audit.record(user.userId, 'VENDOR_SCORES_EDIT', v.name);
    return this.profile(user, id);
  }
}
