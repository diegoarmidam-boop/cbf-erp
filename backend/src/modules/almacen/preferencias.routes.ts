import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import { tienePermiso } from "../../core/permissions.js";
import { mensajeErrorCaptura, mensajeErrorValidacion, unoSolo } from "../../core/http.js";
import { agregarSustituto, establecerPreferido, obtenerPreferencia, quitarSustituto, reordenarSustitutos } from "./preferencias.js";

export const preferenciasRouter = Router({ mergeParams: true });
preferenciasRouter.use(requireAuth);

// mergeParams:true trae `:id` del router padre (almacen/index.ts) en
// tiempo de ejecución, pero el tipado de Express 5 no lo sabe porque este
// router no declara ":id" en sus propias rutas — sin este cast, TS ve
// `req.params` como `{}` en cada handler.
function idIngredienteActivo(req: { params: unknown }): string {
  return unoSolo((req.params as Record<string, string>).id);
}

// Solo Director General/Gerente Técnico de Producción pueden definir o
// modificar (9.15) — mismo permiso "almacen_regulado"/autoriza que ya
// controla quién autoriza productos agroquímicos/fertilizantes nuevos.
async function requiereAutorizacionRegulada(rolUsuario: string): Promise<boolean> {
  return tienePermiso(rolUsuario as never, "almacen_regulado", "autoriza");
}

preferenciasRouter.get("/", requirePermission("almacen", "ver"), async (req, res) => {
  try {
    res.json(await obtenerPreferencia(idIngredienteActivo(req)));
  } catch (err) {
    res.status(404).json({ error: mensajeErrorCaptura(err) });
  }
});

const preferidoSchema = z.object({ productoId: z.string().nullable() });

preferenciasRouter.put("/preferido", async (req, res) => {
  if (!(await requiereAutorizacionRegulada(req.usuario!.rol))) {
    res.status(403).json({ error: "Solo Dirección General o el Gerente Técnico de Producción pueden definir el producto preferido." });
    return;
  }
  const parsed = preferidoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  try {
    res.json(await establecerPreferido(idIngredienteActivo(req), parsed.data.productoId));
  } catch (err) {
    res.status(400).json({ error: mensajeErrorCaptura(err) });
  }
});

const sustitutoSchema = z.object({ productoId: z.string().min(1) });

preferenciasRouter.post("/sustitutos", async (req, res) => {
  if (!(await requiereAutorizacionRegulada(req.usuario!.rol))) {
    res.status(403).json({ error: "Solo Dirección General o el Gerente Técnico de Producción pueden agregar sustitutos autorizados." });
    return;
  }
  const parsed = sustitutoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  try {
    res.status(201).json(await agregarSustituto(idIngredienteActivo(req), parsed.data.productoId));
  } catch (err) {
    res.status(400).json({ error: mensajeErrorCaptura(err) });
  }
});

preferenciasRouter.delete("/sustitutos/:sustitutoId", async (req, res) => {
  if (!(await requiereAutorizacionRegulada(req.usuario!.rol))) {
    res.status(403).json({ error: "Solo Dirección General o el Gerente Técnico de Producción pueden quitar sustitutos autorizados." });
    return;
  }
  try {
    res.json(await quitarSustituto(idIngredienteActivo(req), unoSolo(req.params.sustitutoId)));
  } catch (err) {
    res.status(400).json({ error: mensajeErrorCaptura(err) });
  }
});

const reordenarSchema = z.object({ ordenDeIds: z.array(z.string()).min(1) });

preferenciasRouter.patch("/sustitutos/reordenar", async (req, res) => {
  if (!(await requiereAutorizacionRegulada(req.usuario!.rol))) {
    res.status(403).json({ error: "Solo Dirección General o el Gerente Técnico de Producción pueden reordenar sustitutos autorizados." });
    return;
  }
  const parsed = reordenarSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  try {
    res.json(await reordenarSustitutos(idIngredienteActivo(req), parsed.data.ordenDeIds));
  } catch (err) {
    res.status(400).json({ error: mensajeErrorCaptura(err) });
  }
});
