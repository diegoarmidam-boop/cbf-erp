-- AlterTable
ALTER TABLE `fertirriegoprogramacion` ADD COLUMN `diasSemana` JSON NULL,
    MODIFY `frecuencia` ENUM('diario', 'cada_2_dias', 'cada_3_dias', 'patron_2_1', 'dias_semana') NOT NULL;
