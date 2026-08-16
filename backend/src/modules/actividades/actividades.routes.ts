import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { Rol } from "@prisma/client";
import { requireAuth, requirePermission, requirePermissionAny, huertaIdDeAlcance } from "../../middleware/auth.js";
import { tienePermiso } from "../../core/permissions.js";
import { mensajeErrorValidacion, unoSolo } from "../../core/http.js";
import { prisma } from "../../core/db.js";
import { diaEstaCerrado } from "../nomina/captura.js";
import {
  actividadesParaProgramar,
  ActividadFueraDeAlcanceError,
  DiaCerradoRequiereCasoExtraordinarioActividadError,
  editarAvanceActividad,
  equiposImplementoParaActividad,
  equiposTractorParaActividad,
  listarActividadesProgramadas,
  obtenerActividadProgramada,
  programarActividad,
  registrarAvanceActividad,
} from "./actividades.js";

export const actividadesRouter = Router();
actividadesRouter.use(requireAuth);

// Mismo caso que Aplicaciones/Fertilizantes (9.4/9.7/9.5): la matriz booleana
// de PermisoModulo no distingue "Capturar (programar)" de "Capturar
// (avance)" — se verifica aquí por rol explícito, además del permiso de módulo.
const ROLES_PROGRAMAR: Rol[] = ["gerente_tecnico_produccion"];
const ROLES_AVANCE: Rol[] = ["supervisor_huerta", "capturista_informacion"];
const ROLES_ACCESO_UNIVERSAL: Rol[] = ["director_general", "encargado_sistemas"];

function verificarRol(req: Request, res: Response, permitidos: Rol[]): boolean {
  const rol = req.usuario!.rol;
  if (ROLES_ACCESO_UNIVERSAL.includes(rol) || permitidos.includes(rol)) return true;
  res.status(403).json({ error: "Tu rol no puede realizar esta acción dentro de Actividades." });
  return false;
}

function verificarAlcance(req: Request, res: Response, huertaId: string): boolean {
  const alcance = huertaIdDeAlcance(req);
  if (alcance && alcance !== huertaId) {
    res.status(403).json({ error: "Tu acceso está restringido a tu propia Huerta." });
    return false;
  }
  return true;
}

actividadesRouter.get("/", requirePermission("actividades", "ver"), async (req, res) => {
  const huertaId = typeof req.query.huertaId === "string" ? req.query.huertaId : undefined;
  const alcance = huertaIdDeAlcance(req);
  if (alcance && huertaId && alcance !== huertaId) {
    res.status(403).json({ error: "Tu acceso está restringido a tu propia Huerta." });
    return;
  }
  res.json(await listarActividadesProgramadas(huertaId ?? alcance ?? undefined));
});

actividadesRouter.get("/catalogo", requirePermission("actividades", "ver"), async (_req, res) => {
  res.json(await actividadesParaProgramar());
});

actividadesRouter.get("/equipos-tractor", requirePermission("actividades", "ver"), async (_req, res) => {
  res.json(await equiposTractorParaActividad());
});

actividadesRouter.get("/equipos-implemento", requirePermission("actividades", "ver"), async (_req, res) => {
  res.json(await equiposImplementoParaActividad());
});

actividadesRouter.get("/:id", requirePermission("actividades", "ver"), async (req, res) => {
  const programada = await obtenerActividadProgramada(unoSolo(req.params.id));
  if (!verificarAlcance(req, res, programada.huertaId)) return;
  res.json(programada);
});

const programarSchema = z.object({
  huertaId: z.string().min(1),
  cuadroIds: z.array(z.string().min(1)).min(1),
  actividadId: z.string().min(1),
  fechaInicio: z.string(),
  fechaFin: z.string(),
});

actividadesRouter.post("/", requirePermission("actividades", "capturar"), async (req, res) => {
  if (!verificarRol(req, res, ROLES_PROGRAMAR)) return;
  const parsed = programarSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  try {
    const programada = await programarActividad(parsed.data, req.usuario!.usuarioId);
    res.status(201).json(programada);
  } catch (err) {
    if (err instanceof ActividadFueraDeAlcanceError) {
      res.status(409).json({ error: err.message });
      return;
    }
    if (err instanceof Error) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
});

const cuadroAvanceSchema = z.object({ cuadroId: z.string().min(1), hectareas: z.number().positive() });
const personaLineaSchema = z.object({ personalId: z.string().min(1), horas: z.number().positive() });

const lineaActividadSchema = z.object({
  tipo: z.enum(["gente", "tractor", "mixta"]),
  tractorId: z.string().optional(),
  operadorId: z.string().optional(),
  operadorHoras: z.number().positive().optional(),
  implementoId: z.string().optional(),
  personas: z.array(personaLineaSchema).default([]),
});

const avanceSchema = z.object({
  fechaReal: z.string(),
  cuadros: z.array(cuadroAvanceSchema).min(1),
  lineas: z.array(lineaActividadSchema).min(1),
});

// Se acepta "actividades:capturar" (Supervisor/Capturista, el caso normal) O
// "nomina:editar" (caso extraordinario de un día ya cerrado — mismo patrón
// que Aplicaciones 9.7).
actividadesRouter.post("/:id/avance", requirePermissionAny(["actividades", "capturar"], ["nomina", "editar"]), async (req, res) => {
  const id = unoSolo(req.params.id);
  const programada = await prisma.actividadProgramada.findUnique({ where: { id } });
  if (!programada) {
    res.status(404).json({ error: "Actividad programada no encontrada." });
    return;
  }
  if (!verificarAlcance(req, res, programada.huertaId)) return;

  const parsed = avanceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }

  const cerrado = await diaEstaCerrado(programada.huertaId, parsed.data.fechaReal);
  if (cerrado) {
    if (!(await tienePermiso(req.usuario!.rol, "nomina", "editar"))) {
      res.status(423).json({
        error:
          "La Huerta ya tiene cerrado el día de Nómina de esta fecha — se necesita autorización de caso extraordinario (Encargado de Nóminas, Director General o Gerente Administrativo).",
      });
      return;
    }
  } else if (!verificarRol(req, res, ROLES_AVANCE)) {
    return;
  }

  try {
    const realizada = await registrarAvanceActividad(id, { ...parsed.data, casoExtraordinario: cerrado }, req.usuario!.usuarioId);
    res.status(201).json(realizada);
  } catch (err) {
    if (err instanceof DiaCerradoRequiereCasoExtraordinarioActividadError) {
      res.status(423).json({ error: err.message });
      return;
    }
    if (err instanceof Error) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
});

const editarAvanceSchema = z.object({
  cuadros: z.array(cuadroAvanceSchema).min(1),
  lineas: z.array(lineaActividadSchema).min(1),
});

actividadesRouter.patch("/avance/:realizadaId", requirePermission("actividades", "capturar"), async (req, res) => {
  if (!verificarRol(req, res, ROLES_AVANCE)) return;
  const realizadaId = unoSolo(req.params.realizadaId);
  const realizada = await prisma.actividadRealizada.findUnique({ where: { id: realizadaId }, include: { actividadProgramada: true } });
  if (!realizada) {
    res.status(404).json({ error: "Reporte no encontrado." });
    return;
  }
  if (!verificarAlcance(req, res, realizada.actividadProgramada.huertaId)) return;

  const parsed = editarAvanceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  try {
    res.json(await editarAvanceActividad(realizadaId, parsed.data, req.usuario!.usuarioId));
  } catch (err) {
    if (err instanceof Error) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
});
