-- AlterTable
ALTER TABLE `ordencompra` ADD COLUMN `motivoRechazo` VARCHAR(191) NULL,
    MODIFY `estado` ENUM('pendiente_autorizar', 'pendiente_cotizar', 'generada', 'recibida', 'rechazada') NOT NULL;
