-- V1 P1 (25-sep-2026): Número de Lote de Almacén (consecutivo único global),
-- fecha de llegada para el FIFO por fecha (no caducidad), y marca de "fuera
-- de orden" cuando Bodega elige un lote distinto al sugerido al entregar.
ALTER TABLE `productolote` ADD COLUMN `numeroLote` INT NULL;
ALTER TABLE `productolote` ADD COLUMN `fechaLlegada` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);
ALTER TABLE `productolote` ADD UNIQUE INDEX `ProductoLote_numeroLote_key` (`numeroLote`);

ALTER TABLE `almacencentralmovimiento` ADD COLUMN `fueraDeOrden` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `almacencentralmovimiento` ADD COLUMN `motivoFueraDeOrden` VARCHAR(191) NULL;
