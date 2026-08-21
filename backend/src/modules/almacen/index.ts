import { Router } from "express";
import { productosRouter } from "./productos.routes.js";
import { movimientosRouter } from "./movimientos.routes.js";
import { almacenLocalRouter } from "./almacen-local.routes.js";
import { categoriasRouter, contenedoresRouter, ingredientesActivosRouter } from "./catalogos.routes.js";
import { preferenciasRouter } from "./preferencias.routes.js";

export const almacenRouter = Router();
almacenRouter.use("/productos", productosRouter);
almacenRouter.use("/movimientos", movimientosRouter);
almacenRouter.use("/local", almacenLocalRouter);
almacenRouter.use("/categorias", categoriasRouter);
almacenRouter.use("/ingredientes-activos", ingredientesActivosRouter);
almacenRouter.use("/ingredientes-activos/:id/preferencia", preferenciasRouter);
almacenRouter.use("/contenedores", contenedoresRouter);
