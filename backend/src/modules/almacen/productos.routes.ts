import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import { tienePermiso } from "../../core/permissions.js";
import { crearSolicitud } from "../../core/solicitudes.js";
import { crearProductoAutorizado, esCategoriaRegulada, listarProductos, productosAutorizados } from "./productos.js";

export const productosRouter = Router();
productosRouter.use(requireAuth);

productosRouter.get("/", requirePermission("almacen", "ver"), async (req, res) => {
  const categoria = typeof req.query.categoria === "string" ? req.query.categoria : undefined;
  const soloAutorizados = req.query.autorizados === "true";
  res.json(soloAutorizados ? await productosAutorizados(categoria) : await listarProductos(categoria));
});

const altaSchema = z.object({
  categoria: z.string().min(1),
  ingredienteActivo: z.string().optional(),
  nombreComercial: z.string().min(1),
  presentacion: z.string().min(1),
  unidad: z.string().min(1),
  requiereLote: z.boolean(),
});

// Regla del bloque 4: agroquímico/fertilizante los autoriza Gerente
// Técnico/Director; cualquier otra categoría la autogestiona el Encargado
// de Bodega directamente (no necesita pasar por nadie más).
productosRouter.post("/", requirePermission("almacen", "capturar"), async (req, res) => {
  const parsed = altaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const regulado = esCategoriaRegulada(parsed.data.categoria);
  const moduloAutoriza = regulado ? "almacen_regulado" : "almacen";
  const puedeAutorizar = await tienePermiso(req.usuario!.rol, moduloAutoriza, "autoriza");

  if (puedeAutorizar) {
    const producto = await crearProductoAutorizado(parsed.data, req.usuario!.usuarioId);
    res.status(201).json(producto);
    return;
  }

  const solicitud = await crearSolicitud({
    tipo: "producto_regulado_alta",
    entidadTabla: "Producto",
    payload: parsed.data,
    propuestoPorId: req.usuario!.usuarioId,
  });
  res.status(202).json({ mensaje: "Propuesta enviada — pendiente de autorización.", solicitud });
});
