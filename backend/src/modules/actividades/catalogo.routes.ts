import { Router } from "express";
import { z } from "zod";
import { requirePermission, requirePermissionAny } from "../../middleware/auth.js";
import { tienePermiso } from "../../core/permissions.js";
import { crearSolicitud } from "../../core/solicitudes.js";
import { mensajeErrorValidacion, unoSolo } from "../../core/http.js";
import { prisma } from "../../core/db.js";

// Catálogo de Actividades (9.4, 15-ago-2026): vivía en Nómina > Catálogos
// porque el módulo de Actividades se construyó después (10-11-ago-2026) —
// se mueve aquí para que viva junto al resto del módulo, con edición
// general (antes solo se podía cambiar tarifa/activo por separado).
export const catalogoActividadesRouter = Router();

catalogoActividadesRouter.get("/", requirePermissionAny(["actividades", "ver"], ["actividades", "capturar"]), async (req, res) => {
  const todas = req.query.todas === "true";
  const actividades = await prisma.actividad.findMany({ where: todas ? {} : { activo: true }, orderBy: { nombre: "asc" } });
  res.json(actividades);
});

const actividadSchema = z.object({
  nombre: z.string().min(1),
  unidad: z.enum(["hora", "dia", "surco", "planta", "remolque", "caja", "cuadro", "kg", "ha"]),
  tarifa: z.number().nonnegative(),
  usarTarifaGeneral: z.boolean().default(false),
  esquemaPago: z.enum(["individual_hora", "individual_caja", "grupal_remolque", "depende_empacadores"]),
  requiereCuadro: z.boolean().default(false),
  tipoRecurso: z.enum(["gente", "tractor", "mixta"]).default("gente"),
});

// Alta — la autoriza el Gerente Administrativo (bloque 4). Si quien la
// propone ya tiene ese permiso, se crea directo; si no, queda como
// solicitud pendiente.
catalogoActividadesRouter.post("/", requirePermission("actividades", "capturar"), async (req, res) => {
  const parsed = actividadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }

  const puedeAutorizar = await tienePermiso(req.usuario!.rol, "nomina", "autoriza");
  if (puedeAutorizar) {
    const actividad = await prisma.actividad.create({ data: parsed.data });
    res.status(201).json(actividad);
    return;
  }

  const solicitud = await crearSolicitud({
    tipo: "actividad_alta",
    entidadTabla: "Actividad",
    payload: parsed.data,
    propuestoPorId: req.usuario!.usuarioId,
  });
  res.status(202).json({ mensaje: "Propuesta enviada — queda pendiente de autorización.", solicitud });
});

// Editar datos ya capturados (bloque 4: el Director General siempre puede
// editar) — antes solo existían PATCH /:id/tarifa y /:id/activo por
// separado; se consolida en una sola edición general.
catalogoActividadesRouter.patch("/:id", requirePermission("actividades", "capturar"), async (req, res) => {
  const parsed = actividadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  const actividad = await prisma.actividad.findUnique({ where: { id: unoSolo(req.params.id) } });
  if (!actividad) {
    res.status(404).json({ error: "Actividad no encontrada." });
    return;
  }

  const puedeAutorizar = await tienePermiso(req.usuario!.rol, "nomina", "autoriza");
  if (puedeAutorizar) {
    const actualizada = await prisma.actividad.update({ where: { id: actividad.id }, data: parsed.data });
    res.json(actualizada);
    return;
  }

  const solicitud = await crearSolicitud({
    tipo: "actividad_tarifa",
    entidadTabla: "Actividad",
    entidadId: actividad.id,
    payload: parsed.data,
    propuestoPorId: req.usuario!.usuarioId,
  });
  res.status(202).json({ mensaje: "Propuesta de cambio enviada — pendiente de autorización.", solicitud });
});

const activoSchema = z.object({ activo: z.boolean() });

// Desactivar en vez de borrar — RegistroNomina histórico depende de esta
// fila; una actividad inactiva simplemente deja de ofrecerse en capturas
// nuevas, pero su historial sigue intacto.
catalogoActividadesRouter.patch("/:id/activo", requirePermission("actividades", "capturar"), async (req, res) => {
  const parsed = activoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  const actividad = await prisma.actividad.update({ where: { id: unoSolo(req.params.id) }, data: { activo: parsed.data.activo } });
  res.json(actividad);
});
