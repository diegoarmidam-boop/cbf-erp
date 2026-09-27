import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { Rol } from "@prisma/client";
import { requireAuth, requirePermission, requirePermissionAny, huertaIdDeAlcance } from "../../middleware/auth.js";
import { tienePermiso } from "../../core/permissions.js";
import { mensajeErrorCaptura, mensajeErrorValidacion, unoSolo } from "../../core/http.js";
import { prisma } from "../../core/db.js";
import { diaEstaCerrado } from "../nomina/captura.js";
import {
  DiaCerradoRequiereCasoExtraordinarioSegundaCintillaError,
  editarAvanceSegundaCintilla,
  listarSegundaCintillaProgramadas,
  obtenerSegundaCintillaProgramada,
  programarSegundaCintilla,
  registrarAvanceSegundaCintilla,
} from "./segunda-cintilla.js";

export const segundaCintillaRouter = Router();
segundaCintillaRouter.use(requireAuth);

// Mismo motivo que Actividades/Aplicaciones: "Capturar (programar)" es de
// Dirección/Gerencia Técnica/Asistentes, "Capturar (avance)" de
// Supervisor/Capturista — la matriz booleana de PermisoModulo no distingue
// ambos dentro de un mismo módulo.
const ROLES_PROGRAMAR: Rol[] = ["gerente_tecnico_produccion", "asistente_tecnico_produccion"];
const ROLES_AVANCE: Rol[] = ["supervisor_huerta", "capturista_informacion"];
const ROLES_ACCESO_UNIVERSAL: Rol[] = ["director_general", "encargado_sistemas"];

function verificarRol(req: Request, res: Response, permitidos: Rol[]): boolean {
  const rol = req.usuario!.rol;
  if (ROLES_ACCESO_UNIVERSAL.includes(rol) || permitidos.includes(rol)) return true;
  res.status(403).json({ error: "Tu rol no puede realizar esta acción dentro de Riego." });
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

segundaCintillaRouter.get("/", requirePermission("riego", "ver"), async (req, res) => {
  const huertaId = typeof req.query.huertaId === "string" ? req.query.huertaId : undefined;
  const alcance = huertaIdDeAlcance(req);
  if (alcance && huertaId && alcance !== huertaId) {
    res.status(403).json({ error: "Tu acceso está restringido a tu propia Huerta." });
    return;
  }
  res.json(await listarSegundaCintillaProgramadas(huertaId ?? alcance ?? undefined));
});

segundaCintillaRouter.get("/:id", requirePermission("riego", "ver"), async (req, res) => {
  const programada = await obtenerSegundaCintillaProgramada(unoSolo(req.params.id));
  if (!verificarAlcance(req, res, programada.huertaId)) return;
  res.json(programada);
});

const programarSchema = z.object({
  huertaId: z.string().min(1),
  seccionIds: z.array(z.string().min(1)).min(1),
  fechaInicio: z.string(),
  fechaFin: z.string(),
});

segundaCintillaRouter.post("/", requirePermission("riego", "capturar"), async (req, res) => {
  if (!verificarRol(req, res, ROLES_PROGRAMAR)) return;
  const parsed = programarSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  try {
    res.status(201).json(await programarSegundaCintilla(parsed.data, req.usuario!.usuarioId));
  } catch (err) {
    res.status(400).json({ error: mensajeErrorCaptura(err) });
  }
});

const personaSchema = z.object({ personalId: z.string().min(1), horas: z.number().positive() });

const avanceSchema = z.object({
  seccionId: z.string().min(1),
  fechaReal: z.string(),
  hectareas: z.number().positive(),
  personas: z.array(personaSchema).min(1),
  comentario: z.string().optional(),
});

// Se acepta "riego:capturar" (Supervisor/Capturista, el caso normal) O
// "nomina:editar" (caso extraordinario de un día ya cerrado — mismo patrón
// que Actividades/Aplicaciones).
segundaCintillaRouter.post("/:id/avance", requirePermissionAny(["riego", "capturar"], ["nomina", "editar"]), async (req, res) => {
  const id = unoSolo(req.params.id);
  const programada = await prisma.segundaCintillaProgramacion.findUnique({ where: { id } });
  if (!programada) {
    res.status(404).json({ error: "Programación no encontrada." });
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
    const realizada = await registrarAvanceSegundaCintilla(id, { ...parsed.data, casoExtraordinario: cerrado }, req.usuario!.usuarioId);
    res.status(201).json(realizada);
  } catch (err) {
    if (err instanceof DiaCerradoRequiereCasoExtraordinarioSegundaCintillaError) {
      res.status(423).json({ error: err.message });
      return;
    }
    res.status(400).json({ error: mensajeErrorCaptura(err) });
  }
});

const editarAvanceSchema = z.object({
  hectareas: z.number().positive(),
  personas: z.array(personaSchema).min(1),
  comentario: z.string().optional(),
});

segundaCintillaRouter.patch("/avance/:realizadaId", requirePermission("riego", "capturar"), async (req, res) => {
  if (!verificarRol(req, res, ROLES_AVANCE)) return;
  const realizadaId = unoSolo(req.params.realizadaId);
  const realizada = await prisma.segundaCintillaRealizada.findUnique({ where: { id: realizadaId }, include: { programacion: true } });
  if (!realizada) {
    res.status(404).json({ error: "Reporte no encontrado." });
    return;
  }
  if (!verificarAlcance(req, res, realizada.programacion.huertaId)) return;

  const parsed = editarAvanceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  try {
    res.json(await editarAvanceSegundaCintilla(realizadaId, parsed.data, req.usuario!.usuarioId));
  } catch (err) {
    res.status(400).json({ error: mensajeErrorCaptura(err) });
  }
});
