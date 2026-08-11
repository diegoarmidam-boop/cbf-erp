import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { Rol } from "@prisma/client";
import { requireAuth, requirePermission, requirePermissionAny, huertaIdDeAlcance } from "../../middleware/auth.js";
import { tienePermiso } from "../../core/permissions.js";
import { unoSolo } from "../../core/http.js";
import { prisma } from "../../core/db.js";
import { diaEstaCerrado } from "../nomina/captura.js";
import {
  cancelarAplicacionEntregada,
  confirmarEntrega,
  confirmarRecepcionCancelacion,
  DiaCerradoRequiereCasoExtraordinarioError,
  editarRealizada,
  equiposImplementoParaAplicacion,
  equiposTractorParaAplicacion,
  liberarAplicacionVencida,
  listarAplicaciones,
  NoSePuedeCancelarError,
  obtenerAplicacion,
  productosParaAplicacion,
  programarAplicacion,
  ProductoNoAutorizadoAplicacionError,
  registrarRealizada,
  StockNoComprometidoError,
  TransicionAplicacionInvalidaError,
} from "./aplicaciones.js";

export const aplicacionesRouter = Router();
aplicacionesRouter.use(requireAuth);

// El documento distingue "Capturar (programar)" de "Capturar (realizada)"
// como acciones de roles distintos dentro del mismo módulo (9.7) — la
// matriz booleana de PermisoModulo no alcanza a expresar esa distinción
// (ambos grupos comparten capturar=true en "aplicaciones"), así que se
// verifica aquí por rol explícito, además del permiso de módulo.
const ROLES_PROGRAMAR: Rol[] = ["gerente_tecnico_produccion", "asistente_tecnico_produccion"];
const ROLES_REALIZADA: Rol[] = ["supervisor_huerta", "ayudante_supervisor"];
const ROLES_ACCESO_UNIVERSAL: Rol[] = ["director_general", "encargado_sistemas"];
// Cancelación de aplicación entregada y vencida (9.7): solo Director General/Gerente Técnico — más restringido que programar (sin Asistente Técnico).
const ROLES_CANCELAR: Rol[] = ["gerente_tecnico_produccion"];

function verificarRol(req: Request, res: Response, permitidos: Rol[]): boolean {
  const rol = req.usuario!.rol;
  if (ROLES_ACCESO_UNIVERSAL.includes(rol) || permitidos.includes(rol)) return true;
  res.status(403).json({ error: "Tu rol no puede realizar esta acción dentro de Aplicaciones." });
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

aplicacionesRouter.get("/", requirePermission("aplicaciones", "ver"), async (req, res) => {
  const huertaId = typeof req.query.huertaId === "string" ? req.query.huertaId : undefined;
  const alcance = huertaIdDeAlcance(req);
  if (alcance && huertaId && alcance !== huertaId) {
    res.status(403).json({ error: "Tu acceso está restringido a tu propia Huerta." });
    return;
  }
  res.json(await listarAplicaciones(huertaId ?? alcance ?? undefined));
});

aplicacionesRouter.get("/productos", requirePermission("aplicaciones", "ver"), async (_req, res) => {
  res.json(await productosParaAplicacion());
});

aplicacionesRouter.get("/equipos-implemento", requirePermission("aplicaciones", "ver"), async (_req, res) => {
  res.json(await equiposImplementoParaAplicacion());
});

aplicacionesRouter.get("/equipos-tractor", requirePermission("aplicaciones", "ver"), async (_req, res) => {
  res.json(await equiposTractorParaAplicacion());
});

aplicacionesRouter.get("/:id", requirePermission("aplicaciones", "ver"), async (req, res) => {
  const aplicacion = await obtenerAplicacion(unoSolo(req.params.id));
  if (!verificarAlcance(req, res, aplicacion.huertaId)) return;
  res.json(aplicacion);
});

const programarSchema = z.object({
  huertaId: z.string().min(1),
  cuadroIds: z.array(z.string().min(1)).min(1),
  productoId: z.string().min(1),
  recursoSugerido: z.enum(["mochila", "turbina", "aguilon"]),
  concentracionValor: z.number().positive(),
  concentracionUnidad: z.enum(["ml_l", "g_l", "kg_l"]),
  litrosMezclaPorHa: z.number().positive(),
  fechaInicio: z.string(),
  fechaFin: z.string(),
});

aplicacionesRouter.post("/", requirePermission("aplicaciones", "capturar"), async (req, res) => {
  if (!verificarRol(req, res, ROLES_PROGRAMAR)) return;
  const parsed = programarSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const aplicacion = await programarAplicacion(parsed.data, req.usuario!.usuarioId);
    res.status(201).json(aplicacion);
  } catch (err) {
    if (err instanceof ProductoNoAutorizadoAplicacionError) {
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

// Confirmar entrega es, físicamente, una acción de Almacén (quien
// entrega el producto a la Huerta) — no de quien programó (9.7/9.15).
aplicacionesRouter.post("/:id/entregar", requirePermission("almacen", "capturar"), async (req, res) => {
  try {
    const aplicacion = await confirmarEntrega(unoSolo(req.params.id), req.usuario!.usuarioId);
    res.json(aplicacion);
  } catch (err) {
    if (err instanceof TransicionAplicacionInvalidaError || err instanceof StockNoComprometidoError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
});

const cuadroAvanceSchema = z.object({ cuadroId: z.string().min(1), hectareas: z.number().positive() });

const lineaRealizadaSchema = z.object({
  modalidad: z.enum(["mochila", "turbina", "aguilon"]),
  tractorId: z.string().optional(),
  operadorId: z.string().optional(),
  implementoId: z.string().optional(),
  horas: z.number().positive(),
  personalIds: z.array(z.string().min(1)).default([]),
});

const realizadaSchema = z.object({
  fechaReal: z.string(),
  cuadros: z.array(cuadroAvanceSchema).min(1),
  lineas: z.array(lineaRealizadaSchema).min(1),
});

// Se acepta "aplicaciones:capturar" (Supervisor/Ayudante, el caso normal) O
// "nomina:editar" (Encargado de Nóminas/Director/Gerente Administrativo,
// solo relevante para el caso extraordinario de un día ya cerrado — ver
// abajo). Fuera de ese caso, el segundo grupo no tiene por qué usar esta
// ruta y el chequeo de rol interno los filtra igual.
aplicacionesRouter.post("/:id/realizada", requirePermissionAny(["aplicaciones", "capturar"], ["nomina", "editar"]), async (req, res) => {
  const id = unoSolo(req.params.id);
  const aplicacion = await prisma.aplicacion.findUnique({ where: { id } });
  if (!aplicacion) {
    res.status(404).json({ error: "Aplicación no encontrada." });
    return;
  }
  if (!verificarAlcance(req, res, aplicacion.huertaId)) return;

  const parsed = realizadaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const cerrado = await diaEstaCerrado(aplicacion.huertaId, parsed.data.fechaReal);
  if (cerrado) {
    // Caso extraordinario (9.11): solo Encargado(s) de Nómina, Director General o Gerente Administrativo.
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
    const realizada = await registrarRealizada(id, { ...parsed.data, casoExtraordinario: cerrado }, req.usuario!.usuarioId);
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
  cuadros: z.array(cuadroAvanceSchema).min(1),
  lineas: z.array(lineaRealizadaSchema).min(1),
});

aplicacionesRouter.patch("/realizada/:realizadaId", requirePermission("aplicaciones", "capturar"), async (req, res) => {
  if (!verificarRol(req, res, ROLES_REALIZADA)) return;
  const realizadaId = unoSolo(req.params.realizadaId);
  const realizada = await prisma.aplicacionRealizada.findUnique({ where: { id: realizadaId }, include: { aplicacion: true } });
  if (!realizada) {
    res.status(404).json({ error: "Reporte no encontrado." });
    return;
  }
  if (!verificarAlcance(req, res, realizada.aplicacion.huertaId)) return;

  const parsed = editarRealizadaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    res.json(await editarRealizada(realizadaId, parsed.data, req.usuario!.usuarioId));
  } catch (err) {
    if (err instanceof Error) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// Liberar (vencimiento de 15 días sin entregar, o cancelación manual) es
// una decisión de Dirección/Gerencia Técnica (9.7) — mismos roles que
// programan, no de campo.
aplicacionesRouter.post("/:id/liberar", requirePermission("aplicaciones", "capturar"), async (req, res) => {
  if (!verificarRol(req, res, ROLES_PROGRAMAR)) return;
  try {
    const aplicacion = await liberarAplicacionVencida(unoSolo(req.params.id), req.usuario!.usuarioId);
    res.json(aplicacion);
  } catch (err) {
    if (err instanceof TransicionAplicacionInvalidaError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// Protocolo de cancelación de aplicación entregada y vencida a 15 días (9.7) — solo Director/Gerente Técnico.
aplicacionesRouter.post("/:id/cancelar", requirePermission("aplicaciones", "capturar"), async (req, res) => {
  if (!verificarRol(req, res, ROLES_CANCELAR)) return;
  try {
    const aplicacion = await cancelarAplicacionEntregada(unoSolo(req.params.id), req.usuario!.usuarioId);
    res.json(aplicacion);
  } catch (err) {
    if (err instanceof NoSePuedeCancelarError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// Firma digital de recepción del Encargado de Bodega — no bloquea el ajuste de inventario, que ya ocurrió al cancelar.
aplicacionesRouter.post("/:id/confirmar-recepcion-cancelacion", requirePermission("almacen", "capturar"), async (req, res) => {
  try {
    const aplicacion = await confirmarRecepcionCancelacion(unoSolo(req.params.id), req.usuario!.usuarioId);
    res.json(aplicacion);
  } catch (err) {
    if (err instanceof NoSePuedeCancelarError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
});
