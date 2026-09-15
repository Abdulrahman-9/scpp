-- Client decision ق2 (2026-08-20): the parent company is «شركة نفط الوسط» / Midland Oil Company,
-- so the governance role ROC_ADMIN becomes MDOC_ADMIN everywhere — down to the enum itself.
--
-- RENAME VALUE rather than add-new + UPDATE + drop-old: the rename is atomic, touches no User
-- row, and cannot leave an account momentarily role-less between statements. Historical
-- AuditLog rows keep whatever text they were written with (append-only, SCPP 8.1-e) — they are
-- read tolerantly in the client, never rewritten here.
--
-- Requires PostgreSQL ≥ 10 (ALTER TYPE ... RENAME VALUE); provider is postgresql.
ALTER TYPE "Role" RENAME VALUE 'ROC_ADMIN' TO 'MDOC_ADMIN';
