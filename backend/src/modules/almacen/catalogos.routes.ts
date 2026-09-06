import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireDirectorOSistemas, requirePermission } from "../../middleware/auth.js";
import { mensajeErrorValidacion, unoSolo } from "../../core/http.js";
import { categorias, contenedores, ingredientesActivos, marcas } from "./catalogos.js";

const nombreSchema = z.object({ nombre: z.string().min(1) });
const activoSchema = z.object({ activo: z.boolean() });

/**
 * Construye el router CRUD de uno de los catálogos abiertos de Producto.
 * "+" (crear) se queda con el permiso normal del módulo donde ya vive —
 * editar nombre o desactivar/reactivar un valor ya existente es exclusivo
 * de Configuración → Catálogos (Prioridad 6, 4-sep-2026), sin importar la
 * matriz de permisos normal.
 */
function catalogoRouter(catalogo: {
  listar: (todas?: boolean) => Promise<unknown>;
  crear: (nombre: string) => Promise<unknown>;
  editar: (id: string, nombre: string) => Promise<unknown>;
  actualizarActivo: (id: string, activo: boolean) => Promise<unknown>;
}) {
  const router = Router();
  router.use(requireAuth);

  router.get("/", requirePermission("almacen", "ver"), async (req, res) => {
    res.json(await catalogo.listar(req.query.todas === "true"));
  });

  router.post("/", requirePermission("almacen", "capturar"), async (req, res) => {
    const parsed = nombreSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
      return;
    }
    res.status(201).json(await catalogo.crear(parsed.data.nombre));
  });

  router.patch("/:id", requireDirectorOSistemas, async (req, res) => {
    const parsed = nombreSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
      return;
    }
    res.json(await catalogo.editar(unoSolo(req.params.id), parsed.data.nombre));
  });

  router.patch("/:id/activo", requireDirectorOSistemas, async (req, res) => {
    const parsed = activoSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
      return;
    }
    res.json(await catalogo.actualizarActivo(unoSolo(req.params.id), parsed.data.activo));
  });

  return router;
}

// Categoría (Prioridad 3, 4-sep-2026): alta con su propio check "¿Requiere
// Ingrediente Activo?" — editar nombre/check o desactivar/reactivar una
// categoría ya existente es exclusivo de Configuración → Catálogos
// (Prioridad 6, 4-sep-2026).
const categoriaAltaSchema = z.object({ nombre: z.string().min(1), requiereIngredienteActivo: z.boolean() });
const requiereIngredienteSchema = z.object({ requiereIngredienteActivo: z.boolean() });

export const categoriasRouter = Router();
categoriasRouter.use(requireAuth);

categoriasRouter.get("/", requirePermission("almacen", "ver"), async (req, res) => {
  res.json(await categorias.listar(req.query.todas === "true"));
});

categoriasRouter.post("/", requirePermission("almacen", "capturar"), async (req, res) => {
  const parsed = categoriaAltaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  res.status(201).json(await categorias.crear(parsed.data.nombre, parsed.data.requiereIngredienteActivo));
});

categoriasRouter.patch("/:id", requireDirectorOSistemas, async (req, res) => {
  const parsed = nombreSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  res.json(await categorias.editar(unoSolo(req.params.id), parsed.data.nombre));
});

categoriasRouter.patch("/:id/activo", requireDirectorOSistemas, async (req, res) => {
  const parsed = activoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  res.json(await categorias.actualizarActivo(unoSolo(req.params.id), parsed.data.activo));
});

categoriasRouter.patch("/:id/requiere-ingrediente-activo", requireDirectorOSistemas, async (req, res) => {
  const parsed = requiereIngredienteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  res.json(await categorias.actualizarRequiereIngredienteActivo(unoSolo(req.params.id), parsed.data.requiereIngredienteActivo));
});

export const ingredientesActivosRouter = catalogoRouter(ingredientesActivos);
export const contenedoresRouter = catalogoRouter(contenedores);
export const marcasRouter = catalogoRouter(marcas);
