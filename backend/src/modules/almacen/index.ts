import { Router } from "express";
import { productosRouter } from "./productos.routes.js";
import { movimientosRouter } from "./movimientos.routes.js";
import { almacenLocalRouter } from "./almacen-local.routes.js";

export const almacenRouter = Router();
almacenRouter.use("/productos", productosRouter);
almacenRouter.use("/movimientos", movimientosRouter);
almacenRouter.use("/local", almacenLocalRouter);
