import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { unoSolo } from "./http.js";
import { tienePermiso } from "./permissions.js";
import {
  autorizarSolicitud,
  obtenerSolicitud,
  rechazarSolicitud,
  solicitudesPendientes,
  SolicitudYaResueltaError,
} from "./solicitudes.js";
import { activadoresSolicitud } from "./solicitudes.activadores.js";

// Qué módulo gobierna el permiso de autorizar cada tipo de solicitud —
// mapeo transcrito de la tabla "Quién autoriza qué" (bloque 4).
const MODULO_POR_TIPO: Record<string, string> = {
  actividad_alta: "nomina",
  actividad_tarifa: "nomina",
  personal_alta: "rh",
  producto_alta: "almacen",
  producto_regulado_alta: "aplicaciones", // Dirección General o Gerente Técnico — regla más restrictiva
  orden_compra_manual: "compras",
};

export const solicitudesRouter = Router();
solicitudesRouter.use(requireAuth);

solicitudesRouter.get("/", async (req, res) => {
  const tipo = typeof req.query.tipo === "string" ? req.query.tipo : undefined;
  const todas = await solicitudesPendientes(tipo);
  // Solo se listan las que este rol podría autorizar en algún módulo, para
  // no exponer solicitudes de otras áreas en el contador de pendientes.
  const visibles = [];
  for (const s of todas) {
    const modulo = MODULO_POR_TIPO[s.tipo];
    if (modulo && (await tienePermiso(req.usuario!.rol, modulo, "autoriza"))) visibles.push(s);
  }
  res.json(visibles);
});

const resolverSchema = z.object({ motivoRechazo: z.string().optional() });

async function verificarPuedeResolver(id: string, rol: import("@prisma/client").Rol) {
  const objetivo = await obtenerSolicitud(id);
  const modulo = objetivo ? MODULO_POR_TIPO[objetivo.tipo] : undefined;
  if (!objetivo || !modulo || !(await tienePermiso(rol, modulo, "autoriza"))) return null;
  return objetivo;
}

solicitudesRouter.post("/:id/autorizar", async (req, res) => {
  const id = unoSolo(req.params.id);
  const objetivo = await verificarPuedeResolver(id, req.usuario!.rol);
  if (!objetivo) {
    res.status(403).json({ error: "Tu rol no puede autorizar este tipo de solicitud (o ya no existe)." });
    return;
  }
  try {
    const activador = activadoresSolicitud[objetivo.tipo];
    const resultado = await autorizarSolicitud(id, req.usuario!.usuarioId, activador);
    res.json(resultado);
  } catch (err) {
    if (err instanceof SolicitudYaResueltaError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
});

solicitudesRouter.post("/:id/rechazar", async (req, res) => {
  const id = unoSolo(req.params.id);
  const objetivo = await verificarPuedeResolver(id, req.usuario!.rol);
  if (!objetivo) {
    res.status(403).json({ error: "Tu rol no puede rechazar este tipo de solicitud (o ya no existe)." });
    return;
  }
  const parsed = resolverSchema.safeParse(req.body);
  try {
    const resultado = await rechazarSolicitud(id, req.usuario!.usuarioId, parsed.success ? parsed.data.motivoRechazo : undefined);
    res.json(resultado);
  } catch (err) {
    if (err instanceof SolicitudYaResueltaError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
});
