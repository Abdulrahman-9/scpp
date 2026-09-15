import { IsInt, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';

/** Every vendor governance action carries a mandatory documented reason (never hard-delete). */
export class VendorReasonDto {
  @IsString() @Length(20, 1000) reason!: string;
}

export class BanVendorDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/) banUntil!: string; // ≤ 12 months, enforced in the service (14.3)
  @IsString() @Length(20, 1000) reason!: string;
}

export class ScoresDto {
  @IsOptional() @IsInt() @Min(0) @Max(100) techScore?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) financialScore?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) hseScore?: number;
  @IsString() @Length(20, 1000) reason!: string;
}
