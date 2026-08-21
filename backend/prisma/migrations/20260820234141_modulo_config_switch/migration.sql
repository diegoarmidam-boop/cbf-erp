-- CreateTable
CREATE TABLE `ModuloConfig` (
    `modulo` VARCHAR(191) NOT NULL,
    `comunicacionActiva` BOOLEAN NOT NULL DEFAULT true,

    PRIMARY KEY (`modulo`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
