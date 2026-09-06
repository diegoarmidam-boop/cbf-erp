import { Router } from "express";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import { unoSolo } from "../../core/http.js";
import { detalleInventarioIngrediente, detalleInventarioProducto, listarInventarioAgrupado } from "./inventario.js";

export const inventarioRouter = Router();
inventarioRouter.use(requireAuth);

inventarioRouter.get("/", requirePermission("almacen", "ver"), async (_req, res) => {
  res.json(await listarInventarioAgrupado());
});

inventarioRouter.get("/ingrediente/:nombre/detalle", requirePermission("almacen", "ver"), async (req, res) => {
  res.json(await detalleInventarioIngrediente(unoSolo(req.params.nombre)));
});

inventarioRouter.get("/producto/:productoId/detalle", requirePermission("almacen", "ver"), async (req, res) => {
  res.json(await detalleInventarioProducto(unoSolo(req.params.productoId)));
});
