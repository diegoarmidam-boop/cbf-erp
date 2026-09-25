-- V1 P2 (25-sep-2026): Paso 2 de 2 -- ya se hizo el backfill de datos
-- (2 Aplicaciones existentes migradas a "Por Cuadro, un solo Grupo").
-- Se endurece grupoId a obligatorio y se limpian las tablas/columnas
-- viejas que ya quedaron reemplazadas por el modelo de Grupos.

ALTER TABLE `AplicacionProducto` MODIFY COLUMN `grupoId` VARCHAR(191) NOT NULL;
ALTER TABLE `Aplicacion` DROP COLUMN `litrosMezclaPorHa`;
ALTER TABLE `AplicacionCuadro` DROP FOREIGN KEY `AplicacionCuadro_aplicacionId_fkey`;
ALTER TABLE `AplicacionCuadro` DROP FOREIGN KEY `AplicacionCuadro_cuadroId_fkey`;
DROP TABLE `AplicacionCuadro`;
ALTER TABLE `AplicacionRealizadaCuadro` DROP FOREIGN KEY `AplicacionRealizadaCuadro_realizadaId_fkey`;
ALTER TABLE `AplicacionRealizadaCuadro` DROP FOREIGN KEY `AplicacionRealizadaCuadro_cuadroId_fkey`;
DROP TABLE `AplicacionRealizadaCuadro`;
ALTER TABLE `AplicacionRealizada` ALTER COLUMN `hectareas` DROP DEFAULT;
