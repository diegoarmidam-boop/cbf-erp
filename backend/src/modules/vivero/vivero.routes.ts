import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import { mensajeErrorCaptura, mensajeErrorValidacion, unoSolo } from "../../core/http.js";
import {
  actualizarCharolaCiclo,
  actualizarFechasLote,
  agregarCharolas,
  capturarMuertas,
  CicloSinCharolaConfirmadaError,
  CodigoCharolaDuplicadoError,
  crearLote,
  crearPresupuestoSemilla,
  crearTraspaso,
  listarLotes,
  listarPresupuestoSemilla,
  listarTraspasos,
  obtenerLote,
  registrarConteoCampo,
  registrarRiegoVivero,
  reporteSobrevivenciaPorCiclo,
} from "./vivero.js";

export const viveroRouter = Router();
viveroRouter.use(requireAuth);

const charolaCicloSchema = z.object({ tipoCharola: z.string().min(1), cavidadesPorCharola: z.number().int().positive() });

viveroRouter.patch("/ciclos/:cicloId/charola", requirePermission("vivero", "editar"), async (req, res) => {
  const parsed = charolaCicloSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  res.json(await actualizarCharolaCiclo(unoSolo(req.params.cicloId), parsed.data.tipoCharola, parsed.data.cavidadesPorCharola));
});

const crearLoteSchema = z.object({
  cicloId: z.string().min(1),
  variedad: z.string().min(1),
  fechaSiembraCharolas: z.string().min(1),
  fechaRemojo: z.string().optional(),
  fechaCalentar: z.string().optional(),
  fechaTapado: z.string().optional(),
  fechaSalidaVivero: z.string().optional(),
});

viveroRouter.get("/lotes", requirePermission("vivero", "ver"), async (req, res) => {
  const cicloId = String(req.query.cicloId ?? "");
  if (!cicloId) {
    res.status(400).json({ error: "cicloId es requerido." });
    return;
  }
  res.json(await listarLotes(cicloId));
});

viveroRouter.get("/lotes/:id", requirePermission("vivero", "ver"), async (req, res) => {
  res.json(await obtenerLote(unoSolo(req.params.id)));
});

viveroRouter.post("/lotes", requirePermission("vivero", "capturar"), async (req, res) => {
  const parsed = crearLoteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  try {
    const lote = await crearLote(parsed.data, req.usuario!.usuarioId);
    res.status(201).json(lote);
  } catch (err) {
    if (err instanceof CicloSinCharolaConfirmadaError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
});

const fechasLoteSchema = z.object({
  fechaRemojo: z.string().optional(),
  fechaCalentar: z.string().optional(),
  fechaSiembraCharolas: z.string().optional(),
  fechaTapado: z.string().optional(),
  fechaSalidaVivero: z.string().optional(),
});

viveroRouter.patch("/lotes/:id/fechas", requirePermission("vivero", "editar"), async (req, res) => {
  const parsed = fechasLoteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  res.json(await actualizarFechasLote(unoSolo(req.params.id), parsed.data));
});

const charolasSchema = z.object({ codigos: z.array(z.string().min(1)).min(1) });

viveroRouter.post("/lotes/:id/charolas", requirePermission("vivero", "capturar"), async (req, res) => {
  const parsed = charolasSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  try {
    res.status(201).json(await agregarCharolas(unoSolo(req.params.id), parsed.data.codigos));
  } catch (err) {
    if (err instanceof CodigoCharolaDuplicadoError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
});

const muertasSchema = z.object({ muertas: z.number().int().min(0), fecha: z.string().min(1) });

viveroRouter.patch("/charolas/:id/muertas", requirePermission("vivero", "capturar"), async (req, res) => {
  const parsed = muertasSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  res.json(await capturarMuertas(unoSolo(req.params.id), parsed.data.muertas, parsed.data.fecha));
});

viveroRouter.get("/ciclos/:cicloId/sobrevivencia", requirePermission("vivero", "ver"), async (req, res) => {
  res.json(await reporteSobrevivenciaPorCiclo(unoSolo(req.params.cicloId)));
});

const riegoSchema = z.object({ fecha: z.string().min(1) });

viveroRouter.post("/lotes/:id/riego", requirePermission("vivero", "capturar"), async (req, res) => {
  const parsed = riegoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  res.status(201).json(await registrarRiegoVivero(unoSolo(req.params.id), parsed.data.fecha, req.usuario!.usuarioId));
});

const traspasoSchema = z.object({
  cantidadCharolas: z.number().int().positive(),
  huertaId: z.string().min(1),
  cuadroId: z.string().optional(),
  fecha: z.string().min(1),
});

viveroRouter.post("/lotes/:id/traspasos", requirePermission("vivero", "capturar"), async (req, res) => {
  const parsed = traspasoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  const traspaso = await crearTraspaso({ loteId: unoSolo(req.params.id), ...parsed.data }, req.usuario!.usuarioId);
  res.status(201).json(traspaso);
});

viveroRouter.get("/lotes/:id/traspasos", requirePermission("vivero", "ver"), async (req, res) => {
  res.json(await listarTraspasos(unoSolo(req.params.id)));
});

const conteoCampoSchema = z.object({ prendieron: z.number().int().min(0), murieron: z.number().int().min(0), fecha: z.string().min(1) });

viveroRouter.post("/traspasos/:id/conteo", requirePermission("vivero", "capturar"), async (req, res) => {
  const parsed = conteoCampoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  const conteo = await registrarConteoCampo(unoSolo(req.params.id), parsed.data.prendieron, parsed.data.murieron, parsed.data.fecha, req.usuario!.usuarioId);
  res.status(201).json(conteo);
});

const presupuestoSchema = z.object({
  cicloId: z.string().min(1),
  variedad: z.string().min(1),
  productoId: z.string().min(1),
  cantidadNecesaria: z.number().positive(),
});

viveroRouter.get("/presupuesto-semilla", requirePermission("vivero", "ver"), async (req, res) => {
  const cicloId = String(req.query.cicloId ?? "");
  if (!cicloId) {
    res.status(400).json({ error: "cicloId es requerido." });
    return;
  }
  res.json(await listarPresupuestoSemilla(cicloId));
});

viveroRouter.post("/presupuesto-semilla", requirePermission("vivero", "capturar"), async (req, res) => {
  const parsed = presupuestoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  try {
    const presupuesto = await crearPresupuestoSemilla(
      parsed.data.cicloId,
      parsed.data.variedad,
      parsed.data.productoId,
      parsed.data.cantidadNecesaria,
      req.usuario!.usuarioId
    );
    res.status(201).json(presupuesto);
  } catch (err) {
    res.status(400).json({ error: mensajeErrorCaptura(err) });
  }
});
