import { Router } from "express";
import { huertasRouter } from "./huertas.routes.js";
import { cuadrosRouter } from "./cuadros.routes.js";
import { ciclosRouter } from "./ciclos.routes.js";
import { seccionesRiegoRouter } from "./secciones-riego.routes.js";

export const unidadesProduccionRouter = Router();
unidadesProduccionRouter.use("/huertas", huertasRouter);
unidadesProduccionRouter.use("/cuadros", cuadrosRouter);
unidadesProduccionRouter.use("/ciclos", ciclosRouter);
unidadesProduccionRouter.use("/secciones-riego", seccionesRiegoRouter);
