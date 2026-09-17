-- Prioridades 7 y 8 (V35, 17-sep-2026): cancelar Orden generada + editar
-- Solicitud manual con reautorización condicional.
ALTER TABLE `ordencompra`
    ADD COLUMN `observacionesCancelacion` VARCHAR(191) NULL,
    ADD COLUMN `canceladoPorId` VARCHAR(191) NULL,
    ADD COLUMN `editadoPorId` VARCHAR(191) NULL,
    ADD COLUMN `fechaEdicion` DATETIME(3) NULL;
