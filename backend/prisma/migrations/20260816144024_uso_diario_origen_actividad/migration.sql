-- AlterTable
ALTER TABLE `equipousodiario` MODIFY `origen` ENUM('manual', 'automatico_aplicacion', 'automatico_actividad') NOT NULL DEFAULT 'manual';
