import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import { tienePermiso } from "../../core/permissions.js";
import { crearSolicitud } from "../../core/solicitudes.js";
import { prisma } from "../../core/db.js";
import { mensajeErrorValidacion, unoSolo } from "../../core/http.js";
import { crearProductoAutorizado, editarProducto, esCategoriaRegulada, listarProductos, productosAutorizados } from "./productos.js";

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
  marca: z.string().optional(),
  contenedor: z.string().min(1),
  presentacionCantidad: z.number().positive(),
  unidad: z.string().min(1),
  requiereLote: z.boolean(),
});

// Regla del bloque 4: agroquímico/fertilizante los autoriza Gerente
// Técnico/Director; cualquier otra categoría la autogestiona el Encargado
// de Bodega directamente (no necesita pasar por nadie más).
productosRouter.post("/", requirePermission("almacen", "capturar"), async (req, res) => {
  const parsed = altaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
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

// Editar datos ya capturados (bloque 4: el Director General siempre puede
// editar) — misma regla de autorización que dar de alta/desactivar: para
// categorías reguladas (agroquímico/fertilizante) hace falta el permiso de
// "autoriza" del módulo correspondiente, para el resto basta "editar".
productosRouter.patch("/:id", requirePermission("almacen", "editar"), async (req, res) => {
  const parsed = altaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  const producto = await prisma.producto.findUniqueOrThrow({ where: { id: unoSolo(req.params.id) } });
  const reguladoAntes = esCategoriaRegulada(producto.categoria);
  const reguladoDespues = esCategoriaRegulada(parsed.data.categoria);
  if (reguladoAntes || reguladoDespues) {
    const puedeAutorizar = await tienePermiso(req.usuario!.rol, "almacen_regulado", "autoriza");
    if (!puedeAutorizar) {
      res.status(403).json({ error: "Editar un producto agroquímico/fertilizante requiere el mismo permiso que autorizarlo." });
      return;
    }
  }
  res.json(await editarProducto(producto.id, parsed.data));
});

const activoSchema = z.object({ activo: z.boolean() });

// Desactivar en vez de borrar — lotes, movimientos, Aplicaciones/
// Fertilizaciones históricas dependen de este producto. Mismo grupo que
// puede autorizarlo es el que puede desactivarlo (regla "más restrictiva"
// del bloque 4 para agroquímico/fertilizante).
productosRouter.patch("/:id/activo", requirePermission("almacen", "capturar"), async (req, res) => {
  const parsed = activoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  const producto = await prisma.producto.findUniqueOrThrow({ where: { id: unoSolo(req.params.id) } });
  const regulado = esCategoriaRegulada(producto.categoria);
  const moduloAutoriza = regulado ? "almacen_regulado" : "almacen";
  const puedeAutorizar = await tienePermiso(req.usuario!.rol, moduloAutoriza, "autoriza");
  if (!puedeAutorizar) {
    res.status(403).json({ error: "Tu rol no puede desactivar este producto." });
    return;
  }
  res.json(await prisma.producto.update({ where: { id: producto.id }, data: { activo: parsed.data.activo } }));
});
