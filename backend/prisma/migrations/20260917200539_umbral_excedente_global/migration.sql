-- Prioridad 2 (V35, 17-sep-2026): umbral de excedente global del Comparador.
ALTER TABLE `empresaconfig` ADD COLUMN `umbralExcedentePctDefault` DECIMAL(5, 2) NOT NULL DEFAULT 20;
