-- Design-finish D1: the closing wizard collected the actual start date and a classified
-- deviation reason, then dropped both. The columns are nullable so every existing stage —
-- closed before the record existed — remains valid without back-fill and honestly reads
-- «not recorded» rather than an invented value.
ALTER TABLE "Stage" ADD COLUMN "actualFrom" TIMESTAMP(3);
ALTER TABLE "Stage" ADD COLUMN "devReasonCat" TEXT;
ALTER TABLE "Stage" ADD COLUMN "devReasonNote" TEXT;
