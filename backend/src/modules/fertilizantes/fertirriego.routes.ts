import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { Rol } from "@prisma/client";
import { requireAuth, requirePermission, huertaIdDeAlcance } from "../../middleware/auth.js";
import { mensajeErrorCaptura, mensajeErrorValidacion, unoSolo } from "../../core/http.js";
import {
  confirmarEntregaFertirriego,
  editarFertirriegoProgramada,
  liberarFertirriegoVencido,
  listarFertirriego,
  obtenerFertirriego,
  programarFertirriego,
  RolNoPuedeAjustarRecetaFertirriegoError,
  YaHayAvanceRegistradoFertirriegoError,
} from "./fertirriego.js";
import { ProductoNoAutorizadoFertilizanteError, StockNoComprometidoError, TransicionFertilizacionInvalidaError } from "./granular.js";
import { construirOrdenFertirriego } from "../ordenes/ordenes.js";
import { generarPdfOrdenFertirriego } from "../ordenes/pdf.js";
import {
  actualizarActivoRecetaFertirriego,
  crearRecetaFertirriego,
  editarRecetaFertirriego,
  listarRecetasFertirriego,
  obtenerRecetaFertirriego,
  puedeAdministrarRecetasFertirriego,
} from "./recetario-fertirriego.js";

export const fertirriegoRouter = Router();
fertirriegoRouter.use(requireAuth);

// Recetario de Fertirriego (27-ago-2026): registrado ANTES de "/:id" — si
// no, Express intenta interpretar "recetario" como un id de programación.
const dosisFertirriegoEnum = z.enum(["kg_ha", "l_ha", "g_ha"]);
const recetaFertirriegoProductoSchema = z.object({
  productoId: z.string().min(1),
  dosisValor: z.number().positive(),
  dosisUnidad: dosisFertirriegoEnum,
});

fertirriegoRouter.get("/recetario", async (req, res) => {
  res.json(await listarRecetasFertirriego(req.query.todas === "true"));
});

fertirriegoRouter.get("/recetario/:id", async (req, res) => {
  try {
    res.json(await obtenerRecetaFertirriego(unoSolo(req.params.id)));
  } catch (err) {
    res.status(404).json({ error: mensajeErrorCaptura(err) });
  }
});

const crearRecetaFertirriegoSchema = z.object({
  nombre: z.string().min(1),
  productos: z.array(recetaFertirriegoProductoSchema).min(1),
});

fertirriegoRouter.post("/recetario", async (req, res) => {
  if (!puedeAdministrarRecetasFertirriego(req.usuario!.rol)) {
    res.status(403).json({ error: "Solo Dirección General o el Gerente Técnico de Producción pueden crear recetas." });
    return;
  }
  const parsed = crearRecetaFertirriegoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  try {
    res.status(201).json(await crearRecetaFertirriego(parsed.data, req.usuario!.usuarioId));
  } catch (err) {
    res.status(400).json({ error: mensajeErrorCaptura(err) });
  }
});

const editarRecetaFertirriegoSchema = z.object({
  nombre: z.string().min(1).optional(),
  productos: z.array(recetaFertirriegoProductoSchema).min(1).optional(),
});

fertirriegoRouter.patch("/recetario/:id", async (req, res) => {
  if (!puedeAdministrarRecetasFertirriego(req.usuario!.rol)) {
    res.status(403).json({ error: "Solo Dirección General o el Gerente Técnico de Producción pueden editar recetas." });
    return;
  }
  const parsed = editarRecetaFertirriegoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  try {
    res.json(await editarRecetaFertirriego(unoSolo(req.params.id), parsed.data));
  } catch (err) {
    res.status(400).json({ error: mensajeErrorCaptura(err) });
  }
});

const activoRecetaFertirriegoSchema = z.object({ activo: z.boolean() });

fertirriegoRouter.patch("/recetario/:id/activo", async (req, res) => {
  if (!puedeAdministrarRecetasFertirriego(req.usuario!.rol)) {
    res.status(403).json({ error: "Solo Dirección General o el Gerente Técnico de Producción pueden desactivar recetas." });
    return;
  }
  const parsed = activoRecetaFertirriegoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  res.json(await actualizarActivoRecetaFertirriego(unoSolo(req.params.id), parsed.data.activo));
});

// Mismo motivo que Granular/Aplicaciones: "Capturar (programar)" es de
// Dirección/Gerencia Técnica/Asistentes, no algo que la matriz booleana
// distinga dentro de un mismo módulo.
const ROLES_PROGRAMAR: Rol[] = ["gerente_tecnico_produccion", "asistente_tecnico_produccion"];
const ROLES_ACCESO_UNIVERSAL: Rol[] = ["director_general", "encargado_sistemas"];

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

fertirriegoRouter.get("/", requirePermission("fertilizantes", "ver"), async (req, res) => {
  const huertaId = typeof req.query.huertaId === "string" ? req.query.huertaId : undefined;
  const alcance = huertaIdDeAlcance(req);
  if (alcance && huertaId && alcance !== huertaId) {
    res.status(403).json({ error: "Tu acceso está restringido a tu propia Huerta." });
    return;
  }
  res.json(await listarFertirriego(huertaId ?? alcance ?? undefined, req.query.incluirCerradas === "true"));
});

fertirriegoRouter.get("/:id", requirePermission("fertilizantes", "ver"), async (req, res) => {
  const fertirriego = await obtenerFertirriego(unoSolo(req.params.id));
  if (!verificarAlcance(req, res, fertirriego.huertaId)) return;
  res.json(fertirriego);
});

// Orden de Fertirriego (9.5 Camino 2, 25-ago-2026, corregida 27-ago-2026):
// documento para el Encargado de Riego, en pantalla (JSON) o descargable en
// PDF — dosis × hectáreas por válvula, ya no requiere capacidad de tanque.
fertirriegoRouter.get("/:id/orden", requirePermission("fertilizantes", "ver"), async (req, res) => {
  const fertirriego = await obtenerFertirriego(unoSolo(req.params.id));
  if (!verificarAlcance(req, res, fertirriego.huertaId)) return;
  res.json(await construirOrdenFertirriego(unoSolo(req.params.id)));
});

fertirriegoRouter.get("/:id/orden.pdf", requirePermission("fertilizantes", "ver"), async (req, res) => {
  const fertirriego = await obtenerFertirriego(unoSolo(req.params.id));
  if (!verificarAlcance(req, res, fertirriego.huertaId)) return;
  const orden = await construirOrdenFertirriego(unoSolo(req.params.id));
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="orden-fertirriego-${unoSolo(req.params.id)}.pdf"`);
  const doc = generarPdfOrdenFertirriego(orden);
  doc.pipe(res);
  doc.end();
});

const productoFertirriegoSchema = z.object({
  productoId: z.string().min(1),
  dosisValor: z.number().positive(),
  dosisUnidad: dosisFertirriegoEnum,
});

const programarSchema = z.object({
  huertaId: z.string().min(1),
  seccionIds: z.array(z.string().min(1)).min(1),
  productos: z.array(productoFertirriegoSchema).min(1),
  frecuencia: z.enum(["diario", "cada_2_dias", "cada_3_dias", "patron_2_1"]),
  fechaInicio: z.string(),
  fechaFin: z.string(),
  recetaId: z.string().optional(),
  actualizarRecetaOriginal: z.boolean().optional(),
});

fertirriegoRouter.post("/", requirePermission("fertilizantes", "capturar"), async (req, res) => {
  if (!verificarRol(req, res, ROLES_PROGRAMAR)) return;
  const parsed = programarSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  try {
    const fertirriego = await programarFertirriego(parsed.data, req.usuario!.usuarioId, req.usuario!.rol);
    res.status(201).json(fertirriego);
  } catch (err) {
    if (err instanceof ProductoNoAutorizadoFertilizanteError) {
      res.status(409).json({ error: err.message });
      return;
    }
    if (err instanceof RolNoPuedeAjustarRecetaFertirriegoError) {
      res.status(403).json({ error: err.message });
      return;
    }
    if (err instanceof Error) {
      res.status(400).json({ error: mensajeErrorCaptura(err) });
      return;
    }
    throw err;
  }
});

// Editar (1.9, 31-ago-2026): permitido mientras Riego no tenga todavía
// ningún día registrado sobre este fertirriego — mismos roles que "Programar".
fertirriegoRouter.patch("/:id", requirePermission("fertilizantes", "capturar"), async (req, res) => {
  if (!verificarRol(req, res, ROLES_PROGRAMAR)) return;
  const parsed = programarSchema.omit({ huertaId: true }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  try {
    const fertirriego = await editarFertirriegoProgramada(unoSolo(req.params.id), parsed.data, req.usuario!.usuarioId, req.usuario!.rol);
    res.json(fertirriego);
  } catch (err) {
    if (
      err instanceof ProductoNoAutorizadoFertilizanteError ||
      err instanceof YaHayAvanceRegistradoFertirriegoError ||
      err instanceof TransicionFertilizacionInvalidaError
    ) {
      res.status(409).json({ error: err.message });
      return;
    }
    if (err instanceof RolNoPuedeAjustarRecetaFertirriegoError) {
      res.status(403).json({ error: err.message });
      return;
    }
    if (err instanceof Error) {
      res.status(400).json({ error: mensajeErrorCaptura(err) });
      return;
    }
    throw err;
  }
});

// Confirmar entrega es una acción de Almacén (9.5/9.15). A partir de aquí la
// ejecución diaria del fertirriego vive en Riego (9.6), todavía no construido.
fertirriegoRouter.post("/:id/entregar", requirePermission("almacen", "capturar"), async (req, res) => {
  try {
    const fertirriego = await confirmarEntregaFertirriego(unoSolo(req.params.id), req.usuario!.usuarioId);
    res.json(fertirriego);
  } catch (err) {
    if (err instanceof TransicionFertilizacionInvalidaError || err instanceof StockNoComprometidoError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
});

fertirriegoRouter.post("/:id/liberar", requirePermission("fertilizantes", "capturar"), async (req, res) => {
  if (!verificarRol(req, res, ROLES_PROGRAMAR)) return;
  try {
    const fertirriego = await liberarFertirriegoVencido(unoSolo(req.params.id), req.usuario!.usuarioId);
    res.json(fertirriego);
  } catch (err) {
    if (err instanceof TransicionFertilizacionInvalidaError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
});
