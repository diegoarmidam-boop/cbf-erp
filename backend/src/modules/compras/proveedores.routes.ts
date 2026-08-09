import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import { crearProveedor, listarProveedores, mejoresProveedoresPorProducto } from "./proveedores.js";
import { unoSolo } from "../../core/http.js";

export const proveedoresRouter = Router();
proveedoresRouter.use(requireAuth);

proveedoresRouter.get("/", requirePermission("compras", "ver"), async (_req, res) => {
  res.json(await listarProveedores());
});

proveedoresRouter.get("/mejores/:productoId", requirePermission("compras", "ver"), async (req, res) => {
  res.json(await mejoresProveedoresPorProducto(unoSolo(req.params.productoId)));
});

const altaSchema = z.object({
  nombre: z.string().min(1),
  creditoMonto: z.number().nonnegative().optional(),
  creditoVencimiento: z.string().optional(),
  datosFacturacion: z.record(z.string(), z.unknown()).optional(),
});

proveedoresRouter.post("/", requirePermission("compras", "capturar"), async (req, res) => {
  const parsed = altaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  res.status(201).json(await crearProveedor(parsed.data));
});
