import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import { prisma } from "../../core/db.js";
import { actualizarDiasCredito, crearProveedor, listarProveedores, mejoresProveedoresPorProducto } from "./proveedores.js";
import { unoSolo } from "../../core/http.js";

export const proveedoresRouter = Router();
proveedoresRouter.use(requireAuth);

// `todas=true` para la pantalla de catálogo (para poder reactivar); el
// selector de "cotizar orden" solo debe ofrecer proveedores activos.
proveedoresRouter.get("/", requirePermission("compras", "ver"), async (req, res) => {
  if (req.query.todas === "true") {
    res.json(await prisma.proveedor.findMany({ orderBy: { nombre: "asc" } }));
    return;
  }
  res.json(await listarProveedores());
});

proveedoresRouter.get("/mejores/:productoId", requirePermission("compras", "ver"), async (req, res) => {
  res.json(await mejoresProveedoresPorProducto(unoSolo(req.params.productoId)));
});

const altaSchema = z.object({
  nombre: z.string().min(1),
  creditoMonto: z.number().nonnegative().optional(),
  creditoVencimiento: z.string().optional(),
  diasCredito: z.number().int().nonnegative().optional(),
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

const diasCreditoSchema = z.object({ diasCredito: z.number().int().nonnegative() });

proveedoresRouter.patch("/:id/dias-credito", requirePermission("compras", "capturar"), async (req, res) => {
  const parsed = diasCreditoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  res.json(await actualizarDiasCredito(unoSolo(req.params.id), parsed.data.diasCredito));
});

const activoSchema = z.object({ activo: z.boolean() });

// Desactivar en vez de borrar — las Órdenes de Compra ya formalizadas
// dependen de este proveedor.
proveedoresRouter.patch("/:id/activo", requirePermission("compras", "capturar"), async (req, res) => {
  const parsed = activoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const proveedor = await prisma.proveedor.update({ where: { id: unoSolo(req.params.id) }, data: { activo: parsed.data.activo } });
  res.json(proveedor);
});
