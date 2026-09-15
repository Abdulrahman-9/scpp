import { IsInt, IsNumber, IsOptional, Matches, Min } from 'class-validator';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export class VariationOrderDto {
  @IsNumber() @Min(0.01) valueUSD!: number;
  @Matches(ISO) approvedOn!: string;
}

export class ExtensionDto {
  @IsInt() @Min(1) days!: number;
  @Matches(ISO) approvedOn!: string;
}

export class LiquidatedDamageDto {
  @IsNumber() @Min(0.01) valueUSD!: number;
  @Matches(ISO) appliedOn!: string;
}

export class GuaranteeDto {
  @Matches(/^(BID_BOND|PERFORMANCE|ADVANCE)$/) kind!: string;
  @IsNumber() @Min(0.01) valueUSD!: number;
  @Matches(ISO) expiresOn!: string;
  /** required for ADVANCE — the advance payment the guarantee must cover */
  @IsOptional() @IsNumber() @Min(0) advanceUSD?: number;
}
