import { Router } from "express";
import { actividadesRouter } from "./actividades.routes.js";
import { configRouter } from "./config.routes.js";
import { gruposRouter } from "./grupos.routes.js";
import { capturaRouter } from "./captura.routes.js";
import { cierreRouter } from "./cierre.routes.js";
import { prestamosRouter } from "./prestamos.routes.js";
import { bonosRouter } from "./bonos.routes.js";
import { asistenciaRouter } from "./asistencia.routes.js";
import { reporteRouter } from "./reporte.routes.js";

export const nominaRouter = Router();

nominaRouter.use("/actividades", actividadesRouter);
nominaRouter.use("/config", configRouter);
nominaRouter.use("/grupos", gruposRouter);
nominaRouter.use("/captura", capturaRouter);
nominaRouter.use("/cierre", cierreRouter);
nominaRouter.use("/prestamos", prestamosRouter);
nominaRouter.use("/bonos", bonosRouter);
nominaRouter.use("/asistencia", asistenciaRouter);
nominaRouter.use("/reporte", reporteRouter);
