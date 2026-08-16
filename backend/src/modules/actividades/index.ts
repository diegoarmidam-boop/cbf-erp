import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { actividadesRouter as actividadesProgramarRouter } from "./actividades.routes.js";
import { catalogoActividadesRouter } from "./catalogo.routes.js";

export const actividadesRouter = Router();
actividadesRouter.use(requireAuth);

// Catálogo de Actividades (9.4, 15-ago-2026): antes vivía en Nómina >
// Catálogos, se mueve a su propio submódulo dentro de Actividades — ver
// catalogo.routes.ts. Va antes que actividadesProgramarRouter porque ese ya
// usa requireAuth internamente también (no afecta, pero evita doble registro
// de nada crítico).
actividadesRouter.use("/definiciones", catalogoActividadesRouter);
actividadesRouter.use(actividadesProgramarRouter);
