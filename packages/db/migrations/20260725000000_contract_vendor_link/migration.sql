-- Link a post-award Contract to the awarded contractor's Vendor file. The column is nullable
-- so existing contracts — which carry only a free-text contractor name — remain valid without
-- back-fill; an unresolved vendor stays honestly unlinked (ON DELETE SET NULL keeps the trail).
ALTER TABLE "Contract" ADD COLUMN "vendorId" TEXT;
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
