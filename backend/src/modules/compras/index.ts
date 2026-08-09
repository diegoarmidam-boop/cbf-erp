import { Router } from "express";
import { proveedoresRouter } from "./proveedores.routes.js";
import { ordenesRouter } from "./ordenes.routes.js";

export const comprasRouter = Router();
comprasRouter.use("/proveedores", proveedoresRouter);
comprasRouter.use("/ordenes", ordenesRouter);
