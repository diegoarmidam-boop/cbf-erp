import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import { mensajeErrorCaptura, mensajeErrorValidacion, unoSolo } from "../../core/http.js";
import { actualizarActivoReceta, crearReceta, editarReceta, listarRecetas, obtenerReceta, puedeAdministrarRecetas, tiposAplicacion } from "./recetario.js";

export const recetarioRouter = Router();
recetarioRouter.use(requireAuth);

export const tiposAplicacionRouter = Router();
tiposAplicacionRouter.use(requireAuth);

tiposAplicacionRouter.get("/", async (req, res) => {
  res.json(await tiposAplicacion.listar(req.query.todas === "true"));
});

const nombreSchema = z.object({ nombre: z.string().min(1) });

tiposAplicacionRouter.post("/", async (req, res) => {
  const parsed = nombreSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  res.status(201).json(await tiposAplicacion.crear(parsed.data.nombre));
});

const activoSchema = z.object({ activo: z.boolean() });

tiposAplicacionRouter.patch("/:id/activo", async (req, res) => {
  const parsed = activoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  res.json(await tiposAplicacion.actualizarActivo(unoSolo(req.params.id), parsed.data.activo));
});

const moduloEnum = z.enum(["aplicaciones", "fertirriego"]);
const concentracionUnidadEnum = z.enum(["ml_l", "g_l", "kg_l"]);
const recetaProductoSchema = z.object({
  productoId: z.string().min(1),
  concentracionValor: z.number().positive(),
  concentracionUnidad: concentracionUnidadEnum,
});

recetarioRouter.get("/", async (req, res) => {
  const parsedModulo = moduloEnum.safeParse(req.query.modulo);
  if (!parsedModulo.success) {
    res.status(400).json({ error: "Falta indicar el módulo (aplicaciones o fertirriego)." });
    return;
  }
  res.json(await listarRecetas(parsedModulo.data, req.query.todas === "true"));
});

recetarioRouter.get("/:id", async (req, res) => {
  try {
    res.json(await obtenerReceta(unoSolo(req.params.id)));
  } catch (err) {
    res.status(404).json({ error: mensajeErrorCaptura(err) });
  }
});

const crearRecetaSchema = z.object({
  nombre: z.string().min(1),
  modulo: moduloEnum,
  tipoAplicacionId: z.string().optional(),
  litrosPorHa: z.number().positive(),
  productos: z.array(recetaProductoSchema).min(1),
});

recetarioRouter.post("/", async (req, res) => {
  if (!puedeAdministrarRecetas(req.usuario!.rol)) {
    res.status(403).json({ error: "Solo Dirección General o el Gerente Técnico de Producción pueden crear recetas." });
    return;
  }
  const parsed = crearRecetaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  try {
    res.status(201).json(await crearReceta(parsed.data, req.usuario!.usuarioId));
  } catch (err) {
    res.status(400).json({ error: mensajeErrorCaptura(err) });
  }
});

const editarRecetaSchema = z.object({
  nombre: z.string().min(1).optional(),
  tipoAplicacionId: z.string().nullable().optional(),
  litrosPorHa: z.number().positive().optional(),
  productos: z.array(recetaProductoSchema).min(1).optional(),
});

recetarioRouter.patch("/:id", async (req, res) => {
  if (!puedeAdministrarRecetas(req.usuario!.rol)) {
    res.status(403).json({ error: "Solo Dirección General o el Gerente Técnico de Producción pueden editar recetas." });
    return;
  }
  const parsed = editarRecetaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  try {
    res.json(await editarReceta(unoSolo(req.params.id), parsed.data));
  } catch (err) {
    res.status(400).json({ error: mensajeErrorCaptura(err) });
  }
});

recetarioRouter.patch("/:id/activo", async (req, res) => {
  if (!puedeAdministrarRecetas(req.usuario!.rol)) {
    res.status(403).json({ error: "Solo Dirección General o el Gerente Técnico de Producción pueden desactivar recetas." });
    return;
  }
  const parsed = activoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  res.json(await actualizarActivoReceta(unoSolo(req.params.id), parsed.data.activo));
});
