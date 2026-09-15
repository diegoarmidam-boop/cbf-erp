-- Prioridad 5 (14-sep-2026): módulo Vivero desde cero.
ALTER TABLE `ciclo` ADD COLUMN `tipoCharola` VARCHAR(191) NULL,
    ADD COLUMN `cavidadesPorCharola` INTEGER NULL;

CREATE TABLE `viverolote` (
    `id` VARCHAR(191) NOT NULL,
    `cicloId` VARCHAR(191) NOT NULL,
    `variedad` VARCHAR(191) NOT NULL,
    `fechaRemojo` DATE NULL,
    `fechaCalentar` DATE NULL,
    `fechaSiembraCharolas` DATE NOT NULL,
    `fechaTapado` DATE NULL,
    `fechaSalidaVivero` DATE NULL,
    `creadoPorId` VARCHAR(191) NOT NULL,
    `fechaCreacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `viverolote_cicloId_idx`(`cicloId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `viverocharola` (
    `id` VARCHAR(191) NOT NULL,
    `loteId` VARCHAR(191) NOT NULL,
    `codigo` VARCHAR(191) NOT NULL,
    `muertas` INTEGER NOT NULL DEFAULT 0,
    `fechaConteo` DATE NULL,

    UNIQUE INDEX `viverocharola_loteId_codigo_key`(`loteId`, `codigo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `viveroriego` (
    `id` VARCHAR(191) NOT NULL,
    `loteId` VARCHAR(191) NOT NULL,
    `fecha` DATE NOT NULL,
    `capturadoPorId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `viveroriego_loteId_fecha_key`(`loteId`, `fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `viverotraspaso` (
    `id` VARCHAR(191) NOT NULL,
    `loteId` VARCHAR(191) NOT NULL,
    `cantidadCharolas` INTEGER NOT NULL,
    `huertaId` VARCHAR(191) NOT NULL,
    `cuadroId` VARCHAR(191) NULL,
    `fecha` DATE NOT NULL,
    `capturadoPorId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `viveroconteocampo` (
    `id` VARCHAR(191) NOT NULL,
    `traspasoId` VARCHAR(191) NOT NULL,
    `fecha` DATE NOT NULL,
    `prendieron` INTEGER NOT NULL,
    `murieron` INTEGER NOT NULL,
    `capturadoPorId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `viveropresupuestosemilla` (
    `id` VARCHAR(191) NOT NULL,
    `cicloId` VARCHAR(191) NOT NULL,
    `variedad` VARCHAR(191) NOT NULL,
    `productoId` VARCHAR(191) NOT NULL,
    `cantidadNecesaria` DECIMAL(12, 3) NOT NULL,
    `creadoPorId` VARCHAR(191) NOT NULL,
    `fechaCreacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `viverolote` ADD CONSTRAINT `viverolote_cicloId_fkey` FOREIGN KEY (`cicloId`) REFERENCES `ciclo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `viverocharola` ADD CONSTRAINT `viverocharola_loteId_fkey` FOREIGN KEY (`loteId`) REFERENCES `viverolote`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `viveroriego` ADD CONSTRAINT `viveroriego_loteId_fkey` FOREIGN KEY (`loteId`) REFERENCES `viverolote`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `viverotraspaso` ADD CONSTRAINT `viverotraspaso_loteId_fkey` FOREIGN KEY (`loteId`) REFERENCES `viverolote`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `viverotraspaso` ADD CONSTRAINT `viverotraspaso_huertaId_fkey` FOREIGN KEY (`huertaId`) REFERENCES `huerta`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `viverotraspaso` ADD CONSTRAINT `viverotraspaso_cuadroId_fkey` FOREIGN KEY (`cuadroId`) REFERENCES `cuadro`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `viveroconteocampo` ADD CONSTRAINT `viveroconteocampo_traspasoId_fkey` FOREIGN KEY (`traspasoId`) REFERENCES `viverotraspaso`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `viveropresupuestosemilla` ADD CONSTRAINT `viveropresupuestosemilla_cicloId_fkey` FOREIGN KEY (`cicloId`) REFERENCES `ciclo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `viveropresupuestosemilla` ADD CONSTRAINT `viveropresupuestosemilla_productoId_fkey` FOREIGN KEY (`productoId`) REFERENCES `producto`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
