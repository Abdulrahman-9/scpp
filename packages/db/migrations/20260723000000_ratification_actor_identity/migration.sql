-- Persist the immutable actor identity alongside the mutable display name on the two
-- governance records (ratify / return share Ratification; cancel / suspend / resume use
-- Tender.status*). Both columns are nullable so existing append-only rows — which carry
-- only the display name (8.1-e) — remain valid without back-fill.
ALTER TABLE "Ratification" ADD COLUMN "byUserId" TEXT;
ALTER TABLE "Tender" ADD COLUMN "statusChangedByUserId" TEXT;
