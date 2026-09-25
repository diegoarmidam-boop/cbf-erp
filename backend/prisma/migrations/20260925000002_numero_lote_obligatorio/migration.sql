-- V1 P1 (25-sep-2026): los 13 lotes existentes ya se renumeraron (script de
-- migración de datos, fuera de este archivo) — numeroLote deja de ser
-- opcional ahora que todas las filas tienen un valor.
ALTER TABLE `productolote` MODIFY COLUMN `numeroLote` INT NOT NULL;
