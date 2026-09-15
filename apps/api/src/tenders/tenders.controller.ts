import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import {
  AddBidderDto,
  AnnouncementPatchDto,
  CompleteStageDto,
  CreateTenderDto,
  EvalStepDto,
  LocalContentClauseDto,
  MctAgreementDto,
  MctEstimateDto,
  MctMeetingDto,
  PlanStageDto,
  RatifyDto,
  ReturnDto,
  SetMaterialsDto,
  SetPriceDto,
  SetTechnicalDto,
  StateResponseDto,
  TenderStatusChangeDto,
  ToggleDocDto,
} from './dto.js';
import { TendersService } from './tenders.service.js';

const OPERATOR_ROLES = ['OPERATOR_ADMIN', 'OPERATOR_USER', 'SUPER_ADMIN'] as const;

/**
 * The three roles that may occupy the ratification seat at all (client request 19ب). WHICH of them
 * may decide THIS tender is a second question, and it is not a decorator's to answer: the ق1
 * ladder decides it per value, so `TendersService` refuses (and audits) a body whose authority does
 * not reach the tender's band. Two gates, deliberately — the guard says «may you sit here», the
 * service says «is this yours to sign».
 */
const RATIFY_ROLES = ['MDOC_ADMIN', 'SUPER_ADMIN', 'JMC_APPROVER'] as const;

@Controller('tenders')
export class TendersController {
  constructor(private readonly tenders: TendersService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.tenders.list(user);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tenders.get(user, id);
  }

  @Post()
  @Roles('OPERATOR_ADMIN', 'OPERATOR_USER', 'SUPER_ADMIN')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTenderDto) {
    return this.tenders.create(user, dto);
  }

  @Post(':id/publish')
  @Roles('OPERATOR_ADMIN', 'OPERATOR_USER', 'SUPER_ADMIN')
  publish(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tenders.publishAnnouncement(user, id);
  }

  @Post(':id/price')
  @Roles('OPERATOR_ADMIN', 'OPERATOR_USER', 'EVALUATION', 'SUPER_ADMIN')
  setPrice(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetPriceDto) {
    return this.tenders.setPrice(user, id, dto.bidderId, dto.priceUSD);
  }

  @Post(':id/complete-stage')
  @Roles('OPERATOR_ADMIN', 'OPERATOR_USER', 'SUPER_ADMIN')
  completeStage(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CompleteStageDto) {
    return this.tenders.completeStage(user, id, dto);
  }

  // award decisions — the three ratifying bodies; the ق1 band decides which of them signs THIS one
  @Post(':id/ratify')
  @Roles(...RATIFY_ROLES)
  ratify(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() _dto: RatifyDto) {
    // _dto only whitelists the optional actor hint; identity comes from `user` (the JWT).
    return this.tenders.ratify(user, id);
  }

  @Post(':id/return')
  @Roles(...RATIFY_ROLES)
  returnWithNotes(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReturnDto) {
    return this.tenders.returnWithNotes(user, id, dto.notes);
  }

  /* intra-stage editor mutations */

  @Patch(':id/plan')
  @Roles(...OPERATOR_ROLES)
  planStage(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: PlanStageDto) {
    return this.tenders.planStage(user, id, dto.stageKey, dto.plannedFrom, dto.plannedTo);
  }

  @Patch(':id/announcement')
  @Roles(...OPERATOR_ROLES)
  patchAnnouncement(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AnnouncementPatchDto) {
    return this.tenders.patchAnnouncement(user, id, dto as Record<string, unknown>);
  }

  @Patch(':id/eval-step')
  @Roles('OPERATOR_ADMIN', 'OPERATOR_USER', 'EVALUATION', 'SUPER_ADMIN')
  setEvalStep(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: EvalStepDto) {
    return this.tenders.setEvalStep(user, id, dto.step);
  }

  @Post(':id/bidders')
  @Roles(...OPERATOR_ROLES)
  addBidder(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AddBidderDto) {
    return this.tenders.addBidder(user, id, dto.name, dto.vendorId, dto.submittedAt);
  }

  @Patch(':id/technical')
  @Roles('OPERATOR_ADMIN', 'OPERATOR_USER', 'EVALUATION', 'SUPER_ADMIN')
  setTechnical(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetTechnicalDto) {
    return this.tenders.setTechnical(user, id, dto.bidderId, dto.result as 'pass' | 'fail');
  }

  // §9 C8.1 — attest that the 20% participation clause is affixed to the tender documents.
  // Same @Roles as publish, deliberately: this attestation IS the gate publication passes,
  // so whoever may publish is exactly whoever may state that the documents carry the clause.
  @Patch(':id/local-content-clause')
  @Roles('OPERATOR_ADMIN', 'OPERATOR_USER', 'SUPER_ADMIN')
  setLocalContentClause(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: LocalContentClauseDto) {
    return this.tenders.setLocalContentClause(user, id, dto.affixed);
  }

  // §9 C8.2 — record a state-company response (governed)
  @Post(':id/state-response')
  @Roles(...OPERATOR_ROLES)
  setStateResponse(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: StateResponseDto) {
    return this.tenders.setStateResponse(user, id, dto.company, dto.status, dto.reason);
  }

  // §9 C8.6 — set a bidder's per-material origin declarations
  @Patch(':id/bidders/:bidderId/materials')
  @Roles(...OPERATOR_ROLES)
  setBidderMaterials(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('bidderId') bidderId: string, @Body() dto: SetMaterialsDto) {
    return this.tenders.setBidderMaterials(user, id, bidderId, dto.materials);
  }

  @Patch(':id/document')
  @Roles(...OPERATOR_ROLES)
  toggleDoc(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ToggleDocDto) {
    return this.tenders.toggleDoc(user, id, dto.stageKey, dto.doc);
  }

  /* MCT cost cycle (6.9) — MDOC governance */

  @Post(':id/mct/meeting')
  @Roles('MDOC_ADMIN', 'SUPER_ADMIN')
  mctMeeting(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: MctMeetingDto) {
    return this.tenders.recordMctMeeting(user, id, dto.meetingHeldOn);
  }

  @Post(':id/mct/agreement')
  @Roles('MDOC_ADMIN', 'SUPER_ADMIN')
  mctAgreement(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: MctAgreementDto) {
    return this.tenders.recordMctAgreement(user, id, dto.agreementReachedOn, dto.agreedEstimateUSD);
  }

  @Patch(':id/mct')
  @Roles('MDOC_ADMIN', 'SUPER_ADMIN')
  mctEstimate(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: MctEstimateDto) {
    return this.tenders.setMctEstimate(user, id, dto.mctEstimateUSD);
  }

  @Post(':id/mct/notify-final')
  @Roles('MDOC_ADMIN', 'SUPER_ADMIN')
  mctNotifyFinal(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tenders.notifyMctFinal(user, id);
  }

  /* governance — cancel / suspend / resume (documented, never deleted) */

  @Post(':id/cancel')
  @Roles('OPERATOR_ADMIN', 'MDOC_ADMIN', 'SUPER_ADMIN')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: TenderStatusChangeDto) {
    return this.tenders.changeStatus(user, id, 'CANCELLED', dto.justification);
  }

  @Post(':id/suspend')
  @Roles('OPERATOR_ADMIN', 'MDOC_ADMIN', 'SUPER_ADMIN')
  suspend(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: TenderStatusChangeDto) {
    return this.tenders.changeStatus(user, id, 'SUSPENDED', dto.justification);
  }

  @Post(':id/resume')
  @Roles('OPERATOR_ADMIN', 'MDOC_ADMIN', 'SUPER_ADMIN')
  resume(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: TenderStatusChangeDto) {
    return this.tenders.changeStatus(user, id, 'ACTIVE', dto.justification);
  }
}
