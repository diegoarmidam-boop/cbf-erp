import { Router } from "express";
import { puestosRouter } from "./puestos.routes.js";
import { doNotHireRouter } from "./donothire.routes.js";
import { usuariosRouter } from "./usuarios.routes.js";

export const rhRouter = Router();
rhRouter.use("/puestos", puestosRouter);
rhRouter.use("/do-not-hire", doNotHireRouter);
rhRouter.use("/usuarios", usuariosRouter);
