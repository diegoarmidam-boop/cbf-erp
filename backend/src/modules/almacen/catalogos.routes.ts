import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import { mensajeErrorValidacion, unoSolo } from "../../core/http.js";
import { categorias, contenedores, ingredientesActivos, marcas } from "./catalogos.js";

const nombreSchema = z.object({ nombre: z.string().min(1) });
const activoSchema = z.object({ activo: z.boolean() });

/** Construye el router CRUD (ver/capturar/editar) de uno de los 3 catálogos abiertos de Producto. */
function catalogoRouter(catalogo: { listar: (todas?: boolean) => Promise<unknown>; crear: (nombre: string) => Promise<unknown>; actualizarActivo: (id: string, activo: boolean) => Promise<unknown> }) {
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

  router.patch("/:id/activo", requirePermission("almacen", "editar"), async (req, res) => {
    const parsed = activoSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
      return;
    }
    res.json(await catalogo.actualizarActivo(unoSolo(req.params.id), parsed.data.activo));
  });

  return router;
}

export const categoriasRouter = catalogoRouter(categorias);
export const ingredientesActivosRouter = catalogoRouter(ingredientesActivos);
export const contenedoresRouter = catalogoRouter(contenedores);
export const marcasRouter = catalogoRouter(marcas);
