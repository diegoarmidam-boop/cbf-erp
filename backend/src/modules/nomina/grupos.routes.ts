import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../core/db.js";
import { requireAuth, requirePermission, requirePermissionAny } from "../../middleware/auth.js";
import { unoSolo } from "../../core/http.js";
import { agregarMiembroAGrupo, checklistDiaDeGrupo, guardarAsistenciaDia, miembrosDeGrupoEnFecha, quitarMiembroDeGrupo } from "./grupos.js";

export const gruposRouter = Router();
gruposRouter.use(requireAuth);

// Catálogo global (9.11) — ya no se filtra por Huerta.
gruposRouter.get("/", requirePermissionAny(["nomina", "ver"], ["nomina", "capturar"]), async (req, res) => {
  const grupos = await prisma.grupoPago.findMany({ orderBy: { nombre: "asc" } });
  const fecha = typeof req.query.fecha === "string" ? req.query.fecha : undefined;
  const conMiembros = await Promise.all(
    grupos.map(async (g) => ({
      ...g,
      miembrosHoy: fecha ? await miembrosDeGrupoEnFecha(g.id, fecha) : undefined,
    }))
  );
  res.json(conMiembros);
});

const crearGrupoSchema = z.object({
  nombre: z.string().optional(),
  persistente: z.boolean().default(true),
  fecha: z.string(), // fecha del primer miembro / creación (YYYY-MM-DD)
  miembros: z.array(z.string().min(1)).min(1),
});

gruposRouter.post("/", requirePermission("nomina", "capturar"), async (req, res) => {
  const parsed = crearGrupoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { nombre, persistente, fecha, miembros } = parsed.data;
  const grupo = await prisma.grupoPago.create({ data: { nombre, persistente } });
  for (const personalId of miembros) {
    await agregarMiembroAGrupo(grupo.id, personalId, fecha);
  }
  res.status(201).json(grupo);
});

const miembroSchema = z.object({ personalId: z.string().min(1), fecha: z.string() });

gruposRouter.post("/:id/miembros", requirePermission("nomina", "capturar"), async (req, res) => {
  const parsed = miembroSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  await agregarMiembroAGrupo(unoSolo(req.params.id), parsed.data.personalId, parsed.data.fecha);
  res.status(204).end();
});

gruposRouter.delete("/:id/miembros/:personalId", requirePermission("nomina", "capturar"), async (req, res) => {
  const fecha = typeof req.query.fecha === "string" ? req.query.fecha : new Date().toISOString().slice(0, 10);
  await quitarMiembroDeGrupo(unoSolo(req.params.id), unoSolo(req.params.personalId), fecha);
  res.status(204).end();
});

// Asistencia dinámica y sustitución (9.11): checklist editable del día, sin tocar todavía el roster fijo.
gruposRouter.get("/:id/asistencia/:fecha", requirePermissionAny(["nomina", "ver"], ["nomina", "capturar"]), async (req, res) => {
  res.json(await checklistDiaDeGrupo(unoSolo(req.params.id), unoSolo(req.params.fecha)));
});

const asistenciaDiaSchema = z.object({
  marcas: z.array(z.object({ personalId: z.string().min(1), tipo: z.enum(["ausente", "sustituto"]) })),
});

gruposRouter.post("/:id/asistencia/:fecha", requirePermission("nomina", "capturar"), async (req, res) => {
  const parsed = asistenciaDiaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  await guardarAsistenciaDia(unoSolo(req.params.id), unoSolo(req.params.fecha), parsed.data.marcas, req.usuario!.usuarioId);
  res.status(204).end();
});

// Solo se puede borrar un grupo que nunca se usó en una captura — si ya
// tiene RegistroNomina ligado, el historial depende de él (referencia por
// id), así que se bloquea en vez de romper esos registros.
gruposRouter.delete("/:id", requirePermission("nomina", "capturar"), async (req, res) => {
  const id = unoSolo(req.params.id);
  const enUso = await prisma.registroNomina.findFirst({ where: { grupoId: id } });
  if (enUso) {
    res.status(409).json({ error: "Este grupo ya se usó en una captura de Nómina — no se puede borrar." });
    return;
  }
  await prisma.grupoAsistenciaDia.deleteMany({ where: { grupoId: id } });
  await prisma.grupoMiembro.deleteMany({ where: { grupoId: id } });
  await prisma.grupoPago.delete({ where: { id } });
  res.status(204).end();
});
