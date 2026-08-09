-- AlterTable
ALTER TABLE `almacencentralmovimiento` MODIFY `tipo` ENUM('entrada_compra', 'salida_comprometida', 'salida_real', 'prestamo_rancho', 'merma', 'baja_caducidad', 'abono_sobrante', 'ajuste_manual', 'consumo_maquinaria') NOT NULL;
