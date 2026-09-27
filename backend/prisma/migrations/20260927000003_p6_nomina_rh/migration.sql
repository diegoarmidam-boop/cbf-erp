-- V1 P6 (27-sep-2026): Nómina y Recursos Humanos (9.11/9.12). Todo aditivo
-- — 0 Personal tipo=fijo activo hoy, ningún dato real en riesgo.

ALTER TABLE `Puesto` MODIFY COLUMN `periodicidad` ENUM('semanal', 'catorcenal', 'quincenal', 'mensual') NOT NULL;

ALTER TABLE `Personal` ADD COLUMN `pendienteAutorizacion` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `Personal` ADD COLUMN `autorizadoPorId` VARCHAR(191) NULL;
ALTER TABLE `Personal` ADD COLUMN `fechaAutorizacion` DATETIME(3) NULL;
ALTER TABLE `Personal` ADD COLUMN `nominaPagadaHasta` DATE NULL;
ALTER TABLE `Personal` ADD COLUMN `diaPagoMensual` ENUM('primer_viernes', 'ultimo_viernes') NULL;
ALTER TABLE `Personal` ADD COLUMN `formaPago` ENUM('efectivo', 'transferencia') NOT NULL DEFAULT 'efectivo';
ALTER TABLE `Personal` ADD COLUMN `banco` VARCHAR(191) NULL;
ALTER TABLE `Personal` ADD COLUMN `numeroCuentaOClabe` VARCHAR(191) NULL;
ALTER TABLE `Personal` ADD COLUMN `titularCuenta` VARCHAR(191) NULL;
