import { Router } from "express";
import { granularRouter } from "./granular.routes.js";
import { fertirriegoRouter } from "./fertirriego.routes.js";

export const fertilizantesModuleRouter = Router();
fertilizantesModuleRouter.use("/granular", granularRouter);
fertilizantesModuleRouter.use("/fertirriego", fertirriegoRouter);
