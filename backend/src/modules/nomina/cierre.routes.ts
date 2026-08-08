import { Router } from "express";
import { requireAuth, requirePermission, huertaIdDeAlcance } from "../../middleware/auth.js";
import { tienePermiso } from "../../core/permissions.js";
import { cerrarDia, CierreVencidoRequiereAutorizacionError, diasPendientesDeCierre, reabrirDia } from "./cierre.js";

export const cierreRouter = Router();
cierreRouter.use(requireAuth);

cierreRouter.get("/pendientes", requirePermission("nomina", "ver"), async (req, res) => {
  const huertaId = String(req.query.huertaId ?? "");
  const alcance = huertaIdDeAlcance(req);
  if (alcance && alcance !== huertaId) {
    res.status(403).json({ error: "Tu acceso está restringido a tu propia Huerta." });
    return;
  }
  res.json(await diasPendientesDeCierre(huertaId));
});

cierreRouter.post("/:huertaId/:fecha", requirePermission("nomina", "capturar"), async (req, res) => {
  const { huertaId, fecha } = req.params as { huertaId: string; fecha: string };
  const alcance = huertaIdDeAlcance(req);
  if (alcance && alcance !== huertaId) {
    res.status(403).json({ error: "Tu acceso está restringido a tu propia Huerta." });
    return;
  }
  const puedeForzarVencido = await tienePermiso(req.usuario!.rol, "nomina", "editar");
  try {
    await cerrarDia(huertaId, fecha, req.usuario!.usuarioId, puedeForzarVencido);
    res.status(204).end();
  } catch (err) {
    if (err instanceof CierreVencidoRequiereAutorizacionError) {
      res.status(403).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// Reabrir un día ya cerrado es una excepción al candado normal — se
// restringe a quien tiene permiso de "editar" en Nómina (Directivo/RH/
// Gerencia), no a cualquiera con solo "capturar".
cierreRouter.delete("/:huertaId/:fecha", requirePermission("nomina", "editar"), async (req, res) => {
  const { huertaId, fecha } = req.params as { huertaId: string; fecha: string };
  await reabrirDia(huertaId, fecha);
  res.status(204).end();
});
