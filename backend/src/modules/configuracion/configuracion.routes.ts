import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import { mensajeErrorValidacion, unoSolo } from "../../core/http.js";
import { MODULOS_CON_SWITCH, cambiarModuloConfig, listarModulosConfig } from "../../core/moduloComunicacion.js";
import { actualizarEmpresaConfig, obtenerEmpresaConfig } from "./empresa.js";

// Pantalla "Configuración del sistema" (bloque de arquitectura, 20-ago-2026):
// visible y operable únicamente por Director General o Gerente/Encargado de
// Sistemas — cualquier otro rol ni siquiera debe ver esta ruta en el menú
// (ver web/src/lib/modulos.ts), pero el candado real vive aquí, no solo en
// el frontend.
const ROLES_PERMITIDOS = new Set(["director_general", "encargado_sistemas"]);

export const configuracionRouter = Router();
configuracionRouter.use(requireAuth);
configuracionRouter.use((req, res, next) => {
  if (!ROLES_PERMITIDOS.has(req.usuario!.rol)) {
    res.status(403).json({ error: "Solo Dirección General o el Encargado de Sistemas puede ver Configuración del sistema." });
    return;
  }
  next();
});

configuracionRouter.get("/modulos", async (_req, res) => {
  res.json(await listarModulosConfig());
});

const moduloEnum = z.enum(MODULOS_CON_SWITCH);
const cambiarSchema = z.object({ comunicacionActiva: z.boolean() });

configuracionRouter.patch("/modulos/:modulo", async (req, res) => {
  const parsedModulo = moduloEnum.safeParse(unoSolo(req.params.modulo));
  if (!parsedModulo.success) {
    res.status(400).json({ error: "Módulo no reconocido." });
    return;
  }
  const parsed = cambiarSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  res.json(await cambiarModuloConfig(parsedModulo.data, parsed.data.comunicacionActiva));
});

// Datos de facturación de la empresa y firmas de Orden de Compra (2-sep-2026, 9.14).
configuracionRouter.get("/empresa", async (_req, res) => {
  res.json(await obtenerEmpresaConfig());
});

const empresaSchema = z.object({
  razonSocial: z.string().optional(),
  rfc: z.string().optional(),
  domicilioFiscal: z.string().optional(),
  telefono: z.string().optional(),
  firmaAtiendeNombre: z.string().optional(),
  firmaAutorizaNombre: z.string().optional(),
});

configuracionRouter.patch("/empresa", async (req, res) => {
  const parsed = empresaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  res.json(await actualizarEmpresaConfig(parsed.data));
});
