import { Router } from "express";
import { proveedoresRouter } from "./proveedores.routes.js";
import { ordenesRouter } from "./ordenes.routes.js";
import { cxpRouter } from "./cxp.routes.js";
import { comparadorRouter } from "./comparador.routes.js";
import { zonasRouter } from "./zonas.routes.js";
import { centrosCostoRouter } from "./centrosCosto.routes.js";
import { ordenesGeneracionRouter } from "./ordenesGeneracion.routes.js";

export const comprasRouter = Router();
comprasRouter.use("/proveedores", proveedoresRouter);
comprasRouter.use("/ordenes", ordenesRouter);
comprasRouter.use("/cxp", cxpRouter);
comprasRouter.use("/comparador", comparadorRouter);
comprasRouter.use("/zonas", zonasRouter);
comprasRouter.use("/centros-costo", centrosCostoRouter);
comprasRouter.use("/ordenes-generacion", ordenesGeneracionRouter);
