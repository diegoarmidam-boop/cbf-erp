import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { Rol } from "@prisma/client";
import { requireAuth, requirePermission, requirePermissionAny, huertaIdDeAlcance } from "../../middleware/auth.js";
import { tienePermiso } from "../../core/permissions.js";
import { mensajeErrorValidacion, unoSolo } from "../../core/http.js";
import { prisma } from "../../core/db.js";
import { diaEstaCerrado } from "../nomina/captura.js";
import {
  cancelarGranularEntregada,
  confirmarEntregaGranular,
  confirmarRecepcionCancelacionGranular,
  DiaCerradoRequiereCasoExtraordinarioError,
  editarRealizadaGranular,
  equiposImplementoParaFertilizacion,
  gruposParaFertilizacion,
  liberarGranularVencida,
  listarGranular,
  NoSePuedeCancelarError,
  obtenerGranular,
  productosParaFertilizacion,
  programarGranular,
  ProductoNoAutorizadoFertilizanteError,
  registrarRealizadaGranular,
  StockNoComprometidoError,
  TransicionFertilizacionInvalidaError,
} from "./granular.js";

export const granularRouter = Router();
granularRouter.use(requireAuth);

// Mismo motivo que en Aplicaciones (9.7): el documento distingue "Capturar
// (programar)" de "Capturar (realizada)" como roles distintos, algo que la
// matriz booleana de PermisoModulo no expresa dentro de un mismo módulo.
const ROLES_PROGRAMAR: Rol[] = ["gerente_tecnico_produccion", "asistente_tecnico_produccion"];
const ROLES_REALIZADA: Rol[] = ["supervisor_huerta", "capturista_informacion"];
const ROLES_ACCESO_UNIVERSAL: Rol[] = ["director_general", "encargado_sistemas"];
// Cancelación de fertilización entregada y vencida (9.5/9.7): mismo criterio restringido que Aplicaciones.
const ROLES_CANCELAR: Rol[] = ["gerente_tecnico_produccion"];

function verificarRol(req: Request, res: Response, permitidos: Rol[]): boolean {
  const rol = req.usuario!.rol;
  if (ROLES_ACCESO_UNIVERSAL.includes(rol) || permitidos.includes(rol)) return true;
  res.status(403).json({ error: "Tu rol no puede realizar esta acción dentro de Fertilizantes." });
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

granularRouter.get("/", requirePermission("fertilizantes", "ver"), async (req, res) => {
  const huertaId = typeof req.query.huertaId === "string" ? req.query.huertaId : undefined;
  const alcance = huertaIdDeAlcance(req);
  if (alcance && huertaId && alcance !== huertaId) {
    res.status(403).json({ error: "Tu acceso está restringido a tu propia Huerta." });
    return;
  }
  res.json(await listarGranular(huertaId ?? alcance ?? undefined));
});

granularRouter.get("/productos", requirePermission("fertilizantes", "ver"), async (_req, res) => {
  res.json(await productosParaFertilizacion());
});

granularRouter.get("/equipos-implemento", requirePermission("fertilizantes", "ver"), async (_req, res) => {
  res.json(await equiposImplementoParaFertilizacion());
});

// Grupos de Pago es catálogo global (9.11) — ya no se filtra por Huerta.
granularRouter.get("/grupos", requirePermission("fertilizantes", "ver"), async (_req, res) => {
  res.json(await gruposParaFertilizacion());
});

granularRouter.get("/:id", requirePermission("fertilizantes", "ver"), async (req, res) => {
  const fertilizacion = await obtenerGranular(unoSolo(req.params.id));
  if (!verificarAlcance(req, res, fertilizacion.huertaId)) return;
  res.json(fertilizacion);
});

const productoGranularSchema = z.object({
  productoId: z.string().min(1),
  modoDosis: z.enum(["kg_ha", "g_planta"]),
  dosisValor: z.number().positive(),
});

const programarSchema = z.object({
  huertaId: z.string().min(1),
  cuadroIds: z.array(z.string().min(1)).min(1),
  productos: z.array(productoGranularSchema).min(1),
  recursoTipo: z.enum(["gente", "implemento"]),
  equipoId: z.string().optional(),
  fechaInicio: z.string(),
  fechaFin: z.string(),
});

granularRouter.post("/", requirePermission("fertilizantes", "capturar"), async (req, res) => {
  if (!verificarRol(req, res, ROLES_PROGRAMAR)) return;
  const parsed = programarSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  try {
    const fertilizacion = await programarGranular(parsed.data, req.usuario!.usuarioId);
    res.status(201).json(fertilizacion);
  } catch (err) {
    if (err instanceof ProductoNoAutorizadoFertilizanteError) {
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

// Confirmar entrega es una acción de Almacén (9.5/9.15), no de quien programó.
granularRouter.post("/:id/entregar", requirePermission("almacen", "capturar"), async (req, res) => {
  try {
    const fertilizacion = await confirmarEntregaGranular(unoSolo(req.params.id), req.usuario!.usuarioId);
    res.json(fertilizacion);
  } catch (err) {
    if (err instanceof TransicionFertilizacionInvalidaError || err instanceof StockNoComprometidoError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
});

const cuadroAvanceSchema = z.object({ cuadroId: z.string().min(1), hectareas: z.number().positive() });

const realizadaSchema = z.object({
  personalId: z.string().optional(),
  grupoId: z.string().optional(),
  horas: z.number().positive(),
  fechaReal: z.string(),
  cuadros: z.array(cuadroAvanceSchema).min(1),
});

// Se acepta "fertilizantes:capturar" (Supervisor, el caso normal) O
// "nomina:editar" (caso extraordinario de un día ya cerrado — ver abajo).
granularRouter.post("/:id/realizada", requirePermissionAny(["fertilizantes", "capturar"], ["nomina", "editar"]), async (req, res) => {
  const id = unoSolo(req.params.id);
  const fertilizacion = await prisma.fertilizacionGranular.findUnique({ where: { id } });
  if (!fertilizacion) {
    res.status(404).json({ error: "Fertilización no encontrada." });
    return;
  }
  if (!verificarAlcance(req, res, fertilizacion.huertaId)) return;

  const parsed = realizadaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }

  const cerrado = await diaEstaCerrado(fertilizacion.huertaId, parsed.data.fechaReal);
  if (cerrado) {
    if (!(await tienePermiso(req.usuario!.rol, "nomina", "editar"))) {
      res.status(423).json({
        error:
          "La Huerta ya tiene cerrado el día de Nómina de esta fecha — se necesita autorización de caso extraordinario (Encargado de Nóminas, Director General o Gerente Administrativo).",
      });
      return;
    }
  } else if (!verificarRol(req, res, ROLES_REALIZADA)) {
    return;
  }

  try {
    const realizada = await registrarRealizadaGranular(id, { ...parsed.data, casoExtraordinario: cerrado }, req.usuario!.usuarioId);
    res.status(201).json(realizada);
  } catch (err) {
    if (err instanceof Error) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
});

const editarRealizadaSchema = z.object({
  personalId: z.string().optional(),
  grupoId: z.string().optional(),
  horas: z.number().positive(),
  cuadros: z.array(cuadroAvanceSchema).min(1),
});

granularRouter.patch("/realizada/:realizadaId", requirePermission("fertilizantes", "capturar"), async (req, res) => {
  if (!verificarRol(req, res, ROLES_REALIZADA)) return;
  const realizadaId = unoSolo(req.params.realizadaId);
  const realizada = await prisma.fertilizacionGranularRealizada.findUnique({ where: { id: realizadaId }, include: { fertilizacion: true } });
  if (!realizada) {
    res.status(404).json({ error: "Reporte no encontrado." });
    return;
  }
  if (!verificarAlcance(req, res, realizada.fertilizacion.huertaId)) return;

  const parsed = editarRealizadaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  try {
    res.json(await editarRealizadaGranular(realizadaId, parsed.data, req.usuario!.usuarioId));
  } catch (err) {
    if (err instanceof Error) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
});

granularRouter.post("/:id/liberar", requirePermission("fertilizantes", "capturar"), async (req, res) => {
  if (!verificarRol(req, res, ROLES_PROGRAMAR)) return;
  try {
    const fertilizacion = await liberarGranularVencida(unoSolo(req.params.id), req.usuario!.usuarioId);
    res.json(fertilizacion);
  } catch (err) {
    if (err instanceof TransicionFertilizacionInvalidaError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// Protocolo de cancelación de fertilización entregada y vencida a 15 días — solo Director/Gerente Técnico.
granularRouter.post("/:id/cancelar", requirePermission("fertilizantes", "capturar"), async (req, res) => {
  if (!verificarRol(req, res, ROLES_CANCELAR)) return;
  try {
    const fertilizacion = await cancelarGranularEntregada(unoSolo(req.params.id), req.usuario!.usuarioId);
    res.json(fertilizacion);
  } catch (err) {
    if (err instanceof NoSePuedeCancelarError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// Firma digital de recepción del Encargado de Bodega.
granularRouter.post("/:id/confirmar-recepcion-cancelacion", requirePermission("almacen", "capturar"), async (req, res) => {
  try {
    const fertilizacion = await confirmarRecepcionCancelacionGranular(unoSolo(req.params.id), req.usuario!.usuarioId);
    res.json(fertilizacion);
  } catch (err) {
    if (err instanceof NoSePuedeCancelarError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
});
