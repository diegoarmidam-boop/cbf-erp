import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import { mensajeErrorValidacion, unoSolo } from "../../core/http.js";
import { tienePermiso, type Accion } from "../../core/permissions.js";
import { actualizarPersonal, crearPersonal, darDeBaja, listarPersonal, obtenerPersonal } from "./personal.js";

export const personalRouter = Router();
personalRouter.use(requireAuth);

// El listado es más permisivo que el resto del módulo a propósito: Nómina
// (y más adelante Aplicaciones/Fertilizantes) necesitan elegir personas al
// capturar aunque ese rol no tenga acceso general a RH — cualquiera de
// estos permisos basta para ver el listado.
const MODULOS_QUE_NECESITAN_LISTA_PERSONAL: [string, Accion][] = [
  ["rh", "ver"],
  ["nomina", "capturar"],
];

personalRouter.get("/", async (req, res) => {
  let permitido = false;
  for (const [modulo, accion] of MODULOS_QUE_NECESITAN_LISTA_PERSONAL) {
    if (await tienePermiso(req.usuario!.rol, modulo, accion)) {
      permitido = true;
      break;
    }
  }
  if (!permitido) {
    res.status(403).json({ error: "Tu rol no tiene permiso para ver el listado de Personal." });
    return;
  }
  const tipo = req.query.tipo === "fijo" || req.query.tipo === "destajo" ? req.query.tipo : undefined;
  const incluirInactivos = req.query.incluirInactivos === "true";
  res.json(await listarPersonal({ tipo, incluirInactivos }));
});

personalRouter.get("/:id", requirePermission("rh", "ver"), async (req, res) => {
  const persona = await obtenerPersonal(unoSolo(req.params.id));
  if (!persona) {
    res.status(404).json({ error: "No encontrado." });
    return;
  }
  res.json(persona);
});

const altaSchemaBase = z.object({
  nombreCompleto: z.string().min(1),
  tipo: z.enum(["fijo", "destajo"]),
  fechaNacimiento: z.string().optional(),
  identificacion: z.string().optional(),
  domicilio: z.string().optional(),
  telefono: z.string().optional(),
  telefonoEmergencia: z.string().optional(),
  fechaIngreso: z.string().optional(),
  huertaId: z.string().optional(),
  puestoId: z.string().optional(),
  sueldo: z.number().nonnegative().optional(),
  rfc: z.string().optional(),
  imssOSeguro: z.string().optional(),
});

personalRouter.post("/", requirePermission("rh", "capturar"), async (req, res) => {
  const parsed = altaSchemaBase.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  const persona = await crearPersonal(parsed.data);
  res.status(201).json(persona);
});

personalRouter.patch("/:id", requirePermission("rh", "editar"), async (req, res) => {
  const parsed = altaSchemaBase.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  const persona = await actualizarPersonal(unoSolo(req.params.id), parsed.data);
  res.json(persona);
});

const bajaSchema = z.object({ motivo: z.string().min(1, "El motivo de baja es obligatorio.") });

personalRouter.post("/:id/baja", requirePermission("rh", "editar"), async (req, res) => {
  const parsed = bajaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  const persona = await darDeBaja(unoSolo(req.params.id), parsed.data.motivo, req.usuario!.usuarioId);
  res.json(persona);
});
