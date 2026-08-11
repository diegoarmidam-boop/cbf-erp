import { Router, type Request } from "express";
import { z } from "zod";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import { tienePermiso } from "../../core/permissions.js";
import { unoSolo } from "../../core/http.js";
import {
  entregarAHuerta,
  lotesDeProducto,
  movimientosProducto,
  registrarEntrada,
  registrarSalidaDirecta,
  stockTotalProducto,
  stockTotalTodos,
  stockComprometidoPendienteTodos,
  StockInsuficienteError,
} from "./movimientos.js";

export const movimientosRouter = Router();
movimientosRouter.use(requireAuth);

// Debe registrarse antes de "/:productoId" para no ser interpretado como un productoId literal "stock-todos".
movimientosRouter.get("/stock-todos", requirePermission("almacen", "ver"), async (_req, res) => {
  res.json(await stockTotalTodos());
});

// Debe registrarse antes de "/:productoId" por la misma razón que stock-todos.
movimientosRouter.get("/comprometido-todos", requirePermission("almacen", "ver"), async (_req, res) => {
  res.json(await stockComprometidoPendienteTodos());
});

movimientosRouter.get("/:productoId/stock", requirePermission("almacen", "ver"), async (req, res) => {
  const productoId = unoSolo(req.params.productoId);
  res.json({ total: await stockTotalProducto(productoId), lotes: await lotesDeProducto(productoId) });
});

movimientosRouter.get("/:productoId", requirePermission("almacen", "ver"), async (req, res) => {
  res.json(await movimientosProducto(unoSolo(req.params.productoId)));
});

const entradaSchema = z.object({
  productoId: z.string().min(1),
  cantidad: z.number().positive(),
  lote: z.string().optional(),
  fechaCaducidad: z.string().optional(),
});

movimientosRouter.post("/entrada", requirePermission("almacen", "capturar"), async (req, res) => {
  const parsed = entradaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { productoId, cantidad, ...opciones } = parsed.data;
  res.status(201).json(await registrarEntrada(productoId, cantidad, req.usuario!.usuarioId, opciones));
});

const entregaSchema = z.object({ productoId: z.string().min(1), huertaId: z.string().min(1), cantidad: z.number().positive() });

movimientosRouter.post("/entregar-a-huerta", requirePermission("almacen", "capturar"), async (req, res) => {
  const parsed = entregaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const local = await entregarAHuerta(parsed.data.productoId, parsed.data.huertaId, parsed.data.cantidad, req.usuario!.usuarioId);
    res.status(201).json(local);
  } catch (err) {
    if (err instanceof StockInsuficienteError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
});

const salidaSchema = z.object({
  productoId: z.string().min(1),
  tipo: z.enum(["prestamo_rancho", "merma", "baja_caducidad", "abono_sobrante", "ajuste_manual"]),
  cantidad: z.number().positive(),
  motivoAjuste: z.string().optional(),
});

// Mermas y ajustes exigen doble-check de Gerencia (9.15) — se gatea con
// "editar" en vez de solo "capturar", que sí basta para las demás salidas.
movimientosRouter.post("/salida", requirePermission("almacen", "capturar"), async (req, res) => {
  const parsed = salidaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if ((parsed.data.tipo === "merma" || parsed.data.tipo === "ajuste_manual") && !(await requiereEditar(req))) {
    res.status(403).json({ error: 'Mermas y ajustes requieren permiso de "editar" (doble-check de Gerencia).' });
    return;
  }
  try {
    const mov = await registrarSalidaDirecta(
      parsed.data.productoId,
      parsed.data.tipo,
      parsed.data.cantidad,
      req.usuario!.usuarioId,
      parsed.data.motivoAjuste
    );
    res.status(201).json(mov);
  } catch (err) {
    if (err instanceof StockInsuficienteError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
});

function requiereEditar(req: Request): Promise<boolean> {
  return tienePermiso(req.usuario!.rol, "almacen", "editar");
}
