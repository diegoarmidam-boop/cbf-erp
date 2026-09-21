-- P1 (20-sep-2026): precio unitario obligatorio en Entradas de Almacén Central.
ALTER TABLE `almacencentralmovimiento` ADD COLUMN `precioUnitario` DECIMAL(12,4) NULL;
