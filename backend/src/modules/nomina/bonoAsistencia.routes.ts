import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { Rol } from "@prisma/client";
import { hoyISO, sumarDias } from "@cbf/shared";
import { prisma } from "../../core/db.js";
import { requireAuth, requirePermission, requirePermissionAny, huertaIdDeAlcance } from "../../middleware/auth.js";
import { mensajeErrorCaptura, mensajeErrorValidacion, unoSolo } from "../../core/http.js";
import {
  actualizarConfigPersonaBono,
  actualizarMontosBonoAsistencia,
  guardarAjusteAsistencia,
  listarAjustesAsistencia,
  listarConfigPersonasBono,
  obtenerMontosBonoAsistencia,
  resumenBonoAsistencia,
  semanaDelBonoParaHoy,
  verificarAjusteEditable,
} from "./bonoAsistencia.js";
import { generarPdfHojaFirmaBono } from "./hojaFirmaBono.js";
import { SemanaConfirmadaError } from "./semana-confirmada.js";

export const bonoAsistenciaRouter = Router();
bonoAsistenciaRouter.use(requireAuth);

const hoyQuery = (req: Request) => (typeof req.query.hoy === "string" ? req.query.hoy : hoyISO());

// Ajustes de Asistencia (7.5): Recursos Humanos y Supervisor de Huerta (este
// último solo de su propia UP). Director General/Sistemas siempre (acceso
// universal, mismo patrón que aplicaciones.routes.ts).
const ROLES_ACCESO_UNIVERSAL: Rol[] = ["director_general", "encargado_sistemas"];
const ROLES_AJUSTES: Rol[] = ["recursos_humanos", "supervisor_huerta"];

function verificarRolAjustes(req: Request, res: Response): boolean {
  const rol = req.usuario!.rol;
  if (ROLES_ACCESO_UNIVERSAL.includes(rol) || ROLES_AJUSTES.includes(rol)) return true;
  res.status(403).json({ error: "Solo Recursos Humanos y el Supervisor de Huerta capturan Ajustes de Asistencia." });
  return false;
}

/** Supervisor de Huerta: solo personas de su propia UP (su Huerta base o donde trabajaron esa semana). */
async function personaEnAlcance(req: Request, personalId: string, fecha: string): Promise<boolean> {
  const alcance = huertaIdDeAlcance(req);
  if (!alcance) return true;
  const persona = await prisma.personal.findUnique({ where: { id: personalId }, select: { huertaId: true } });
  if (persona?.huertaId === alcance) return true;
  const { semana } = await semanaDelBonoParaHoy(fecha);
  const trabajo = await prisma.registroNomina.findFirst({
    where: { personalId, huertaId: alcance, fecha: { gte: new Date(sumarDias(semana.inicio, -7)), lte: new Date(sumarDias(semana.fin, 7)) } },
    select: { id: true },
  });
  return !!trabajo;
}

// Semana del bono + quién califica (en vivo, o congelado si la semana ya se cerró).
bonoAsistenciaRouter.get("/resumen", requirePermissionAny(["nomina", "ver"], ["nomina", "capturar"]), async (req, res) => {
  res.json(await resumenBonoAsistencia(hoyQuery(req)));
});

bonoAsistenciaRouter.get("/hoja-firma.pdf", requirePermission("nomina", "ver"), async (req, res) => {
  const resumen = await resumenBonoAsistencia(hoyQuery(req));
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="bono-asistencia-firma-${resumen.periodoNomina.fin}.pdf"`);
  const doc = generarPdfHojaFirmaBono(resumen);
  doc.pipe(res);
  doc.end();
});

// ---- Ajustes de Asistencia ----
bonoAsistenciaRouter.get("/ajustes", requirePermissionAny(["nomina", "ver"], ["nomina", "capturar"]), async (req, res) => {
  const { semana } = await semanaDelBonoParaHoy(hoyQuery(req));
  const desde = typeof req.query.desde === "string" ? req.query.desde : semana.inicio;
  const hasta = typeof req.query.hasta === "string" ? req.query.hasta : semana.fin;
  const ajustes = await listarAjustesAsistencia(desde, hasta);
  const alcance = huertaIdDeAlcance(req);
  res.json(alcance ? ajustes.filter((a) => a.personal.huertaId === alcance) : ajustes);
});

const ajusteSchema = z.object({
  personalId: z.string().min(1),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  diaCompleto: z.boolean(),
  justificado: z.boolean(),
  nota: z.string().optional(),
});

bonoAsistenciaRouter.post("/ajustes", requirePermission("nomina", "capturar"), async (req, res) => {
  if (!verificarRolAjustes(req, res)) return;
  const parsed = ajusteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  if (!(await personaEnAlcance(req, parsed.data.personalId, parsed.data.fecha))) {
    res.status(403).json({ error: "Tu acceso está restringido a tu propia Huerta." });
    return;
  }
  try {
    res.status(201).json(await guardarAjusteAsistencia(parsed.data, req.usuario!.usuarioId));
  } catch (err) {
    res.status(err instanceof SemanaConfirmadaError ? 423 : 400).json({ error: mensajeErrorCaptura(err) });
  }
});

bonoAsistenciaRouter.delete("/ajustes/:id", requirePermission("nomina", "capturar"), async (req, res) => {
  if (!verificarRolAjustes(req, res)) return;
  const ajuste = await prisma.bonoAsistenciaAjuste.findUnique({ where: { id: unoSolo(req.params.id) } });
  if (!ajuste) {
    res.status(404).json({ error: "Ajuste no encontrado." });
    return;
  }
  const fecha = ajuste.fecha.toISOString().slice(0, 10);
  if (!(await personaEnAlcance(req, ajuste.personalId, fecha))) {
    res.status(403).json({ error: "Tu acceso está restringido a tu propia Huerta." });
    return;
  }
  try {
    await verificarAjusteEditable(fecha);
    await prisma.bonoAsistenciaAjuste.delete({ where: { id: ajuste.id } });
    res.status(204).end();
  } catch (err) {
    res.status(err instanceof SemanaConfirmadaError ? 423 : 400).json({ error: mensajeErrorCaptura(err) });
  }
});

// ---- Configuración (7.7) ----
bonoAsistenciaRouter.get("/config", requirePermission("nomina", "ver"), async (req, res) => {
  const { semana } = await semanaDelBonoParaHoy(hoyQuery(req));
  res.json({ montos: await obtenerMontosBonoAsistencia(), personas: await listarConfigPersonasBono(semana) });
});

const montosSchema = z.object({ montoDefault: z.number().nonnegative().optional(), montoEspecial: z.number().nonnegative().optional() });

bonoAsistenciaRouter.put("/config/montos", requirePermission("nomina", "editar"), async (req, res) => {
  const parsed = montosSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  await actualizarMontosBonoAsistencia(parsed.data);
  res.json(await obtenerMontosBonoAsistencia());
});

const configPersonaSchema = z.object({
  bonoAsistenciaNunca: z.boolean().optional(),
  bonoAsistenciaMedioTiempo: z.boolean().optional(),
  bonoAsistenciaMontoEspecial: z.boolean().optional(),
});

bonoAsistenciaRouter.put("/config/personas/:id", requirePermission("nomina", "editar"), async (req, res) => {
  const parsed = configPersonaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  res.json(await actualizarConfigPersonaBono(unoSolo(req.params.id), parsed.data));
});
