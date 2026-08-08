import { Router } from "express";
import { z } from "zod";
import { calcularPeriodoNomina } from "@cbf/shared";
import { prisma } from "../../core/db.js";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import { unoSolo } from "../../core/http.js";
import { obtenerConfigNomina } from "./config.js";
import { autorizarBono, generarBonosPendientes, rechazarBono } from "./bonos.js";

export const bonosRouter = Router();
bonosRouter.use(requireAuth);

bonosRouter.get("/", requirePermission("nomina", "ver"), async (_req, res) => {
  res.json(await prisma.bonoConfig.findMany({ include: { diasEspeciales: true } }));
});

const paramsPorTipo = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("asistencia_perfecta"), diasRequeridos: z.number().int().positive(), monto: z.number().positive() }),
  z.object({ tipo: z.literal("permanencia_racha"), mesesRequeridos: z.number().positive(), monto: z.number().positive() }),
  z.object({ tipo: z.literal("dia_doble"), multiplicador: z.number().positive(), fechas: z.array(z.string()).min(1) }),
]);

const crearBonoSchema = z.object({ nombre: z.string().min(1) }).and(paramsPorTipo);

bonosRouter.post("/", requirePermission("nomina", "editar"), async (req, res) => {
  const parsed = crearBonoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { nombre, tipo, ...parametros } = parsed.data;
  const fechas = tipo === "dia_doble" ? (parametros as { fechas: string[] }).fechas : [];

  const bono = await prisma.bonoConfig.create({
    data: {
      nombre,
      tipo,
      parametros,
      diasEspeciales: fechas.length ? { create: fechas.map((f) => ({ fecha: new Date(f) })) } : undefined,
    },
    include: { diasEspeciales: true },
  });
  res.status(201).json(bono);
});

// Genera (sin duplicar) los bonos candidatos del periodo de nómina vigente,
// para que Gerencia los revise antes de autorizar — nunca se pagan solos.
bonosRouter.post("/generar-pendientes", requirePermission("nomina", "editar"), async (_req, res) => {
  const config = await obtenerConfigNomina();
  const hoy = new Date().toISOString().slice(0, 10);
  const periodo = calcularPeriodoNomina(hoy, config.diaCorteIndex);
  const generados = await generarBonosPendientes(periodo.inicio, periodo.fin, hoy);
  res.json({ generados });
});

bonosRouter.get("/pendientes", requirePermission("nomina", "editar"), async (_req, res) => {
  res.json(
    await prisma.bonoOtorgado.findMany({
      where: { estado: "pendiente_autorizar" },
      include: { personal: { select: { nombreCompleto: true } }, bonoConfig: { select: { nombre: true, tipo: true } } },
    })
  );
});

bonosRouter.post("/pendientes/:id/autorizar", requirePermission("nomina", "autoriza"), async (req, res) => {
  res.json(await autorizarBono(unoSolo(req.params.id), req.usuario!.usuarioId));
});

bonosRouter.post("/pendientes/:id/rechazar", requirePermission("nomina", "autoriza"), async (req, res) => {
  res.json(await rechazarBono(unoSolo(req.params.id), req.usuario!.usuarioId));
});
