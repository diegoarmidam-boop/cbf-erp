-- V1 P7, 27-sep-2026 (9.5): se quitan "cada_2_dias", "cada_3_dias" y
-- "patron_2_1" ("2 sí, 1 no") de FrecuenciaFertirriego — 0 registros de
-- FertirriegoProgramacion los usaban (verificado antes de esta migración).
-- Solo quedan "diario" y "dias_semana".
-- AlterTable
ALTER TABLE `fertirriegoprogramacion`
    MODIFY `frecuencia` ENUM('diario', 'dias_semana') NOT NULL;
