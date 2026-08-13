-- DropForeignKey
ALTER TABLE `aplicacionrealizadacuadro` DROP FOREIGN KEY `aplicacionrealizadacuadro_cuadroId_fkey`;

-- DropForeignKey
ALTER TABLE `aplicacionrealizadacuadro` DROP FOREIGN KEY `aplicacionrealizadacuadro_realizadaId_fkey`;

-- DropForeignKey
ALTER TABLE `aplicacionrealizadalinea` DROP FOREIGN KEY `aplicacionrealizadalinea_implementoId_fkey`;

-- DropForeignKey
ALTER TABLE `aplicacionrealizadalinea` DROP FOREIGN KEY `aplicacionrealizadalinea_operadorId_fkey`;

-- DropForeignKey
ALTER TABLE `aplicacionrealizadalinea` DROP FOREIGN KEY `aplicacionrealizadalinea_realizadaId_fkey`;

-- DropForeignKey
ALTER TABLE `aplicacionrealizadalinea` DROP FOREIGN KEY `aplicacionrealizadalinea_tractorId_fkey`;

-- DropForeignKey
ALTER TABLE `aplicacionrealizadalineapersona` DROP FOREIGN KEY `aplicacionrealizadalineapersona_lineaId_fkey`;

-- DropForeignKey
ALTER TABLE `aplicacionrealizadalineapersona` DROP FOREIGN KEY `aplicacionrealizadalineapersona_personalId_fkey`;

-- DropForeignKey
ALTER TABLE `comparacioncotizacion` DROP FOREIGN KEY `comparacioncotizacion_itemId_fkey`;

-- DropForeignKey
ALTER TABLE `comparacioncotizacion` DROP FOREIGN KEY `comparacioncotizacion_proveedorId_fkey`;

-- DropForeignKey
ALTER TABLE `comparacionitem` DROP FOREIGN KEY `comparacionitem_comparacionId_fkey`;

-- DropForeignKey
ALTER TABLE `comparacionitem` DROP FOREIGN KEY `comparacionitem_productoId_fkey`;

-- DropForeignKey
ALTER TABLE `fertilizaciongranularrealizadacuadro` DROP FOREIGN KEY `fertilizaciongranularrealizadacuadro_cuadroId_fkey`;

-- DropForeignKey
ALTER TABLE `fertilizaciongranularrealizadacuadro` DROP FOREIGN KEY `fertilizaciongranularrealizadacuadro_realizadaId_fkey`;

-- DropForeignKey
ALTER TABLE `grupoasistenciadia` DROP FOREIGN KEY `grupoasistenciadia_grupoId_fkey`;

-- DropForeignKey
ALTER TABLE `grupoasistenciadia` DROP FOREIGN KEY `grupoasistenciadia_personalId_fkey`;

-- AlterTable
ALTER TABLE `permisomodulo` MODIFY `rol` ENUM('director_general', 'encargado_sistemas', 'gerente_tecnico_produccion', 'asistente_tecnico_produccion', 'supervisor_huerta', 'ayudante_supervisor', 'regador', 'gerente_mantenimiento', 'mecanico', 'supervisor_cosecha', 'supervisor_empaque', 'encargado_cosecha_empaque', 'gerente_logistica', 'recursos_humanos', 'encargado_nominas', 'gerente_administrativo', 'contador', 'asistente_administrativo', 'encargado_compras', 'encargado_bodega', 'bodeguista', 'auditor', 'capturista_informacion') NOT NULL;

-- AlterTable
ALTER TABLE `registronomina` MODIFY `origen` ENUM('manual', 'automatico_aplicacion', 'automatico_fertilizacion', 'automatico_actividad', 'automatico_cosecha', 'automatico_empaque') NOT NULL DEFAULT 'manual';

-- AlterTable
ALTER TABLE `usuario` MODIFY `rol` ENUM('director_general', 'encargado_sistemas', 'gerente_tecnico_produccion', 'asistente_tecnico_produccion', 'supervisor_huerta', 'ayudante_supervisor', 'regador', 'gerente_mantenimiento', 'mecanico', 'supervisor_cosecha', 'supervisor_empaque', 'encargado_cosecha_empaque', 'gerente_logistica', 'recursos_humanos', 'encargado_nominas', 'gerente_administrativo', 'contador', 'asistente_administrativo', 'encargado_compras', 'encargado_bodega', 'bodeguista', 'auditor', 'capturista_informacion') NOT NULL;

-- CreateTable
CREATE TABLE `ActividadProgramada` (
    `id` VARCHAR(191) NOT NULL,
    `huertaId` VARCHAR(191) NOT NULL,
    `actividadId` VARCHAR(191) NOT NULL,
    `fechaInicio` DATE NOT NULL,
    `fechaFin` DATE NOT NULL,
    `hectareasTotalesProgramadas` DECIMAL(10, 4) NOT NULL,
    `creadoPorId` VARCHAR(191) NOT NULL,
    `fechaCreacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ActividadProgramadaCuadro` (
    `actividadProgramadaId` VARCHAR(191) NOT NULL,
    `cuadroId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`actividadProgramadaId`, `cuadroId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ActividadRealizada` (
    `id` VARCHAR(191) NOT NULL,
    `actividadProgramadaId` VARCHAR(191) NOT NULL,
    `fechaReal` DATE NOT NULL,
    `registradoPorId` VARCHAR(191) NOT NULL,

    INDEX `ActividadRealizada_actividadProgramadaId_idx`(`actividadProgramadaId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ActividadRealizadaCuadro` (
    `id` VARCHAR(191) NOT NULL,
    `realizadaId` VARCHAR(191) NOT NULL,
    `cuadroId` VARCHAR(191) NOT NULL,
    `hectareas` DECIMAL(10, 4) NOT NULL,

    INDEX `ActividadRealizadaCuadro_realizadaId_idx`(`realizadaId`),
    INDEX `ActividadRealizadaCuadro_cuadroId_idx`(`cuadroId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ActividadRealizadaPersona` (
    `id` VARCHAR(191) NOT NULL,
    `realizadaId` VARCHAR(191) NOT NULL,
    `personalId` VARCHAR(191) NOT NULL,
    `horas` DECIMAL(6, 2) NOT NULL,

    INDEX `ActividadRealizadaPersona_realizadaId_idx`(`realizadaId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `GrupoAsistenciaDia` ADD CONSTRAINT `GrupoAsistenciaDia_grupoId_fkey` FOREIGN KEY (`grupoId`) REFERENCES `GrupoPago`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GrupoAsistenciaDia` ADD CONSTRAINT `GrupoAsistenciaDia_personalId_fkey` FOREIGN KEY (`personalId`) REFERENCES `Personal`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ComparacionItem` ADD CONSTRAINT `ComparacionItem_comparacionId_fkey` FOREIGN KEY (`comparacionId`) REFERENCES `Comparacion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ComparacionItem` ADD CONSTRAINT `ComparacionItem_productoId_fkey` FOREIGN KEY (`productoId`) REFERENCES `Producto`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ComparacionCotizacion` ADD CONSTRAINT `ComparacionCotizacion_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `ComparacionItem`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ComparacionCotizacion` ADD CONSTRAINT `ComparacionCotizacion_proveedorId_fkey` FOREIGN KEY (`proveedorId`) REFERENCES `Proveedor`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActividadProgramada` ADD CONSTRAINT `ActividadProgramada_huertaId_fkey` FOREIGN KEY (`huertaId`) REFERENCES `Huerta`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActividadProgramada` ADD CONSTRAINT `ActividadProgramada_actividadId_fkey` FOREIGN KEY (`actividadId`) REFERENCES `Actividad`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActividadProgramadaCuadro` ADD CONSTRAINT `ActividadProgramadaCuadro_actividadProgramadaId_fkey` FOREIGN KEY (`actividadProgramadaId`) REFERENCES `ActividadProgramada`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActividadProgramadaCuadro` ADD CONSTRAINT `ActividadProgramadaCuadro_cuadroId_fkey` FOREIGN KEY (`cuadroId`) REFERENCES `Cuadro`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActividadRealizada` ADD CONSTRAINT `ActividadRealizada_actividadProgramadaId_fkey` FOREIGN KEY (`actividadProgramadaId`) REFERENCES `ActividadProgramada`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActividadRealizadaCuadro` ADD CONSTRAINT `ActividadRealizadaCuadro_realizadaId_fkey` FOREIGN KEY (`realizadaId`) REFERENCES `ActividadRealizada`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActividadRealizadaCuadro` ADD CONSTRAINT `ActividadRealizadaCuadro_cuadroId_fkey` FOREIGN KEY (`cuadroId`) REFERENCES `Cuadro`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActividadRealizadaPersona` ADD CONSTRAINT `ActividadRealizadaPersona_realizadaId_fkey` FOREIGN KEY (`realizadaId`) REFERENCES `ActividadRealizada`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActividadRealizadaPersona` ADD CONSTRAINT `ActividadRealizadaPersona_personalId_fkey` FOREIGN KEY (`personalId`) REFERENCES `Personal`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AplicacionRealizadaCuadro` ADD CONSTRAINT `AplicacionRealizadaCuadro_realizadaId_fkey` FOREIGN KEY (`realizadaId`) REFERENCES `AplicacionRealizada`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AplicacionRealizadaCuadro` ADD CONSTRAINT `AplicacionRealizadaCuadro_cuadroId_fkey` FOREIGN KEY (`cuadroId`) REFERENCES `Cuadro`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AplicacionRealizadaLinea` ADD CONSTRAINT `AplicacionRealizadaLinea_realizadaId_fkey` FOREIGN KEY (`realizadaId`) REFERENCES `AplicacionRealizada`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AplicacionRealizadaLinea` ADD CONSTRAINT `AplicacionRealizadaLinea_tractorId_fkey` FOREIGN KEY (`tractorId`) REFERENCES `Equipo`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AplicacionRealizadaLinea` ADD CONSTRAINT `AplicacionRealizadaLinea_operadorId_fkey` FOREIGN KEY (`operadorId`) REFERENCES `Personal`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AplicacionRealizadaLinea` ADD CONSTRAINT `AplicacionRealizadaLinea_implementoId_fkey` FOREIGN KEY (`implementoId`) REFERENCES `Equipo`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AplicacionRealizadaLineaPersona` ADD CONSTRAINT `AplicacionRealizadaLineaPersona_lineaId_fkey` FOREIGN KEY (`lineaId`) REFERENCES `AplicacionRealizadaLinea`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AplicacionRealizadaLineaPersona` ADD CONSTRAINT `AplicacionRealizadaLineaPersona_personalId_fkey` FOREIGN KEY (`personalId`) REFERENCES `Personal`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FertilizacionGranularRealizadaCuadro` ADD CONSTRAINT `FertilizacionGranularRealizadaCuadro_realizadaId_fkey` FOREIGN KEY (`realizadaId`) REFERENCES `FertilizacionGranularRealizada`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FertilizacionGranularRealizadaCuadro` ADD CONSTRAINT `FertilizacionGranularRealizadaCuadro_cuadroId_fkey` FOREIGN KEY (`cuadroId`) REFERENCES `Cuadro`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER TABLE `aplicacionrealizadacuadro` RENAME INDEX `aplicacionrealizadacuadro_cuadroId_idx` TO `AplicacionRealizadaCuadro_cuadroId_idx`;

-- RenameIndex
ALTER TABLE `aplicacionrealizadacuadro` RENAME INDEX `aplicacionrealizadacuadro_realizadaId_idx` TO `AplicacionRealizadaCuadro_realizadaId_idx`;

-- RenameIndex
ALTER TABLE `aplicacionrealizadalinea` RENAME INDEX `aplicacionrealizadalinea_realizadaId_idx` TO `AplicacionRealizadaLinea_realizadaId_idx`;

-- RenameIndex
ALTER TABLE `categoriaproducto` RENAME INDEX `categoriaproducto_nombre_key` TO `CategoriaProducto_nombre_key`;

-- RenameIndex
ALTER TABLE `comparacioncotizacion` RENAME INDEX `comparacioncotizacion_itemId_idx` TO `ComparacionCotizacion_itemId_idx`;

-- RenameIndex
ALTER TABLE `comparacionitem` RENAME INDEX `comparacionitem_comparacionId_idx` TO `ComparacionItem_comparacionId_idx`;

-- RenameIndex
ALTER TABLE `contenedor` RENAME INDEX `contenedor_nombre_key` TO `Contenedor_nombre_key`;

-- RenameIndex
ALTER TABLE `fertilizaciongranularrealizadacuadro` RENAME INDEX `fertilizaciongranularrealizadacuadro_cuadroId_idx` TO `FertilizacionGranularRealizadaCuadro_cuadroId_idx`;

-- RenameIndex
ALTER TABLE `fertilizaciongranularrealizadacuadro` RENAME INDEX `fertilizaciongranularrealizadacuadro_realizadaId_idx` TO `FertilizacionGranularRealizadaCuadro_realizadaId_idx`;

-- RenameIndex
ALTER TABLE `grupoasistenciadia` RENAME INDEX `grupoasistenciadia_grupoId_fecha_idx` TO `GrupoAsistenciaDia_grupoId_fecha_idx`;

-- RenameIndex
ALTER TABLE `grupoasistenciadia` RENAME INDEX `grupoasistenciadia_grupoId_fecha_personalId_key` TO `GrupoAsistenciaDia_grupoId_fecha_personalId_key`;

-- RenameIndex
ALTER TABLE `ingredienteactivo` RENAME INDEX `ingredienteactivo_nombre_key` TO `IngredienteActivo_nombre_key`;
