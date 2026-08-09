import { Router } from "express";
import { equiposRouter } from "./equipos.routes.js";
import { combustibleRouter } from "./combustible.routes.js";
import { mantenimientoRouter } from "./mantenimiento.routes.js";
import { usoDiarioRouter } from "./uso-diario.routes.js";

export const equiposModuleRouter = Router();
equiposModuleRouter.use("/", equiposRouter);
equiposModuleRouter.use("/combustible", combustibleRouter);
equiposModuleRouter.use("/mantenimiento", mantenimientoRouter);
equiposModuleRouter.use("/uso-diario", usoDiarioRouter);
