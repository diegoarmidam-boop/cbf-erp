import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import { mensajeErrorValidacion, unoSolo } from "../../core/http.js";
import { prisma } from "../../core/db.js";
import {
  actualizarCuadrosSeccion,
  actualizarLineasCintilla,
  crearSeccionRiego,
  historialLineasCintilla,
  listarSeccionesRiego,
} from "./secciones-riego.js";

export const seccionesRiegoRouter = Router();
seccionesRiegoRouter.use(requireAuth);

seccionesRiegoRouter.get("/", requirePermission("unidades_produccion", "ver"), async (req, res) => {
  const huertaId = String(req.query.huertaId ?? "");
  if (!huertaId) {
    res.status(400).json({ error: "huertaId es requerido." });
    return;
  }
  res.json(await listarSeccionesRiego(huertaId));
});

const crearSchema = z.object({ huertaId: z.string().min(1), nombre: z.string().min(1), cuadroIds: z.array(z.string().min(1)) });

seccionesRiegoRouter.post("/", requirePermission("unidades_produccion", "capturar"), async (req, res) => {
  const parsed = crearSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  const seccion = await crearSeccionRiego(parsed.data.huertaId, parsed.data.nombre, parsed.data.cuadroIds);
  res.status(201).json(seccion);
});

const cuadrosSchema = z.object({ cuadroIds: z.array(z.string().min(1)) });

seccionesRiegoRouter.patch("/:id/cuadros", requirePermission("unidades_produccion", "editar"), async (req, res) => {
  const parsed = cuadrosSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  await actualizarCuadrosSeccion(unoSolo(req.params.id), parsed.data.cuadroIds);
  res.status(204).end();
});

// Líneas de cintilla por surco (Prioridad 4, 14-sep-2026) — con historial
// por fecha, ver detalle en secciones-riego.ts. GET regresa todas las
// versiones (la más reciente primero); POST cierra la vigente y abre una
// nueva desde `vigenteDesde`.
seccionesRiegoRouter.get("/:id/lineas-cintilla", requirePermission("unidades_produccion", "ver"), async (req, res) => {
  res.json(await historialLineasCintilla(unoSolo(req.params.id)));
});

const lineasCintillaSchema = z.object({ lineas: z.number().int().positive(), vigenteDesde: z.string().min(1) });

seccionesRiegoRouter.post("/:id/lineas-cintilla", requirePermission("unidades_produccion", "editar"), async (req, res) => {
  const parsed = lineasCintillaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  const version = await actualizarLineasCintilla(unoSolo(req.params.id), parsed.data.lineas, parsed.data.vigenteDesde);
  res.status(201).json(version);
});

// Solo se puede borrar una Sección que nunca se usó — si ya tiene
// fertirriegos programados o registros diarios de Riego, el historial
// depende de ella.
seccionesRiegoRouter.delete("/:id", requirePermission("unidades_produccion", "editar"), async (req, res) => {
  const id = unoSolo(req.params.id);
  const [enFertirriego, enRiego] = await Promise.all([
    prisma.fertirriegoSeccion.findFirst({ where: { seccionId: id } }),
    prisma.riegoRegistroDiario.findFirst({ where: { seccionId: id } }),
  ]);
  if (enFertirriego || enRiego) {
    res.status(409).json({ error: "Esta Sección de Riego ya tiene fertirriegos o registros de riego ligados — no se puede borrar." });
    return;
  }
  await prisma.seccionRiegoCuadro.deleteMany({ where: { seccionId: id } });
  await prisma.seccionRiego.delete({ where: { id } });
  res.status(204).end();
});
