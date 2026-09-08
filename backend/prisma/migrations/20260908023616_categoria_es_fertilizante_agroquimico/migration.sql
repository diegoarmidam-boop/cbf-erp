-- AlterTable
ALTER TABLE `categoriaproducto` ADD COLUMN `esAgroquimico` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `esFertilizante` BOOLEAN NOT NULL DEFAULT false;
