import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../core/db.js";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import { tienePermiso } from "../../core/permissions.js";
import { crearSolicitud } from "../../core/solicitudes.js";
import { unoSolo } from "../../core/http.js";

export const actividadesRouter = Router();
actividadesRouter.use(requireAuth);

actividadesRouter.get("/", requirePermission("nomina", "ver"), async (_req, res) => {
  const actividades = await prisma.actividad.findMany({ where: { activo: true }, orderBy: { nombre: "asc" } });
  res.json(actividades);
});

const nuevaActividadSchema = z.object({
  nombre: z.string().min(1),
  unidad: z.enum(["hora", "dia", "surco", "planta", "remolque", "caja", "cuadro", "kg", "ha"]),
  tarifa: z.number().nonnegative(),
  usarTarifaGeneral: z.boolean().default(false),
  esquemaPago: z.enum(["individual_hora", "individual_caja", "grupal_remolque", "depende_empacadores"]),
  requiereCuadro: z.boolean().default(false),
});

// Alta de actividad — la autoriza el Gerente Administrativo (bloque 4). Si
// quien la propone ya tiene ese permiso (Gerente Administrativo, Director
// General), se crea directo; si no, queda como solicitud pendiente.
actividadesRouter.post("/", requirePermission("nomina", "capturar"), async (req, res) => {
  const parsed = nuevaActividadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
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

const cambioTarifaSchema = z.object({
  tarifa: z.number().nonnegative(),
  usarTarifaGeneral: z.boolean(),
});

actividadesRouter.patch("/:id/tarifa", requirePermission("nomina", "capturar"), async (req, res) => {
  const parsed = cambioTarifaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
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
  res.status(202).json({ mensaje: "Propuesta de cambio de tarifa enviada — pendiente de autorización.", solicitud });
});
