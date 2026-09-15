-- Prioridad 2 (14-sep-2026): precisión del Comparador de Cotizaciones.
-- precioValor pasa de Decimal(10,2) a (12,4) -- un precio capturado con
-- solo 2 decimales generó casi $300 MXN de diferencia real contra la
-- factura del proveedor al multiplicarse por miles de kg.
-- precioUnitario (OrdenCompra) también pasa a (12,4) -- es un valor
-- intermedio (se multiplica después por cantidadSolicitada para Cuentas
-- por Pagar y para valorizar Almacén), no el número final en pantalla.
ALTER TABLE `comparacioncotizacion` MODIFY `precioValor` DECIMAL(12, 4) NOT NULL;
ALTER TABLE `ordencompra` MODIFY `precioUnitario` DECIMAL(12, 4) NULL;
