import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission, huertaIdDeAlcance } from "../../middleware/auth.js";
import { prisma } from "../../core/db.js";
import { mensajeErrorCaptura, mensajeErrorValidacion, unoSolo } from "../../core/http.js";
import { crearEquipo, editarEquipo, listarEquipos, sugerirFolio } from "./equipos.js";
import { registrarTraslado, historialTraslados, TrasladoSoloParaTractoresError } from "./traslados.js";

export const equiposRouter = Router();
equiposRouter.use(requireAuth);

const tipoEnum = z.enum(["tractor", "camioneta", "remolque", "implemento", "drone", "motobomba"]);

// `todas=true` para la pantalla de catálogo (para poder reactivar); el
// resto de selectores del sistema solo debe ofrecer equipos activos.
equiposRouter.get("/", requirePermission("equipos", "ver"), async (req, res) => {
  const tipo = tipoEnum.safeParse(req.query.tipo);
  if (req.query.todas === "true") {
    res.json(await prisma.equipo.findMany({ where: { tipo: tipo.success ? tipo.data : undefined }, orderBy: { folio: "asc" } }));
    return;
  }
  res.json(await listarEquipos(tipo.success ? tipo.data : undefined));
});

equiposRouter.get("/sugerir-folio", requirePermission("equipos", "capturar"), async (req, res) => {
  const tipo = tipoEnum.safeParse(req.query.tipo);
  if (!tipo.success) {
    res.status(400).json({ error: "tipo es requerido." });
    return;
  }
  res.json({ folio: await sugerirFolio(tipo.data) });
});

const altaSchema = z.object({
  tipo: tipoEnum,
  folio: z.string().min(1),
  marca: z.string().optional(),
  modelo: z.string().optional(),
  anio: z.number().int().optional(),
  placas: z.string().optional(),
  operadorDesignadoId: z.string().optional(),
});

equiposRouter.post("/", requirePermission("equipos", "capturar"), async (req, res) => {
  const parsed = altaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  try {
    res.status(201).json(await crearEquipo(parsed.data));
  } catch (err) {
    res.status(400).json({ error: mensajeErrorCaptura(err) });
  }
});

const editarSchema = z.object({
  marca: z.string().optional(),
  modelo: z.string().optional(),
  anio: z.number().int().optional(),
  placas: z.string().optional(),
  operadorDesignadoId: z.string().nullable().optional(),
});

equiposRouter.patch("/:id", requirePermission("equipos", "editar"), async (req, res) => {
  const parsed = editarSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  try {
    res.json(await editarEquipo(unoSolo(req.params.id), parsed.data));
  } catch (err) {
    res.status(400).json({ error: mensajeErrorCaptura(err) });
  }
});

const activoSchema = z.object({ activo: z.boolean() });

// Desactivar en vez de borrar — cargas de combustible, mantenimiento y uso
// diario históricos dependen de este equipo.
equiposRouter.patch("/:id/activo", requirePermission("equipos", "editar"), async (req, res) => {
  const parsed = activoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  const equipo = await prisma.equipo.update({ where: { id: unoSolo(req.params.id) }, data: { activo: parsed.data.activo } });
  res.json(equipo);
});

// Traslado de tractor entre ranchos (V1 P3, 26-sep-2026, 9.13e) — la única
// forma de cambiar el "Rancho actual" de un tractor, siempre con bitácora.
const trasladoSchema = z.object({
  fecha: z.string(),
  huertaDestinoId: z.string().min(1),
  litros: z.number().positive(),
  fotoUrl: z.string().min(1),
});

equiposRouter.get("/:id/traslados", requirePermission("equipos", "ver"), async (req, res) => {
  res.json(await historialTraslados(unoSolo(req.params.id)));
});

equiposRouter.post("/:id/traslados", requirePermission("equipos", "capturar"), async (req, res) => {
  const parsed = trasladoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  // Lo registra el Supervisor del rancho DESTINO (9.13e) — un usuario con
  // alcance de Huerta (Supervisor) solo puede registrar Traslados HACIA su
  // propia Huerta; roles sin alcance (Dirección General, etc.) no tienen
  // esta restricción.
  const alcance = huertaIdDeAlcance(req);
  if (alcance && alcance !== parsed.data.huertaDestinoId) {
    res.status(403).json({ error: "Solo puedes registrar Traslados hacia tu propia Huerta." });
    return;
  }
  try {
    const traslado = await registrarTraslado({ equipoId: unoSolo(req.params.id), ...parsed.data }, req.usuario!.usuarioId);
    res.status(201).json(traslado);
  } catch (err) {
    if (err instanceof TrasladoSoloParaTractoresError) {
      res.status(400).json({ error: err.message });
      return;
    }
    res.status(400).json({ error: mensajeErrorCaptura(err) });
  }
});
