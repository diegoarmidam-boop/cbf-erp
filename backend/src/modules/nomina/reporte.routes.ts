import { Router } from "express";
import { desglosarMonto, hoyISO, sumarDesgloses } from "@cbf/shared";
import { requireAuth, requirePermission, huertaIdDeAlcance } from "../../middleware/auth.js";
import { confirmarNominaSemanal, generarReporteNominaSemanal } from "./reporte.js";
import { detalleActividadesPersonaEnPeriodo } from "./detalle.js";
import { generarPdfSobres } from "./sobre.js";
import { SemanaConfirmadaError } from "./semana-confirmada.js";

export const reporteRouter = Router();
reporteRouter.use(requireAuth);

function hoyQuery(req: { query: Record<string, unknown> }): string {
  return typeof req.query.hoy === "string" ? req.query.hoy : hoyISO();
}

// "Todas UPs vs. por Huerta" (29-ago-2026): ?huertaId= es opcional y filtra
// la vista — si el usuario tiene alcance restringido a una sola Huerta, ese
// alcance manda siempre, sin importar qué mande el query string (mismo
// criterio que huertaIdDeAlcance en Captura del día).
function huertaIdQuery(req: { query: Record<string, unknown> }, alcance: string | null): string | undefined {
  if (alcance) return alcance;
  return typeof req.query.huertaId === "string" ? req.query.huertaId : undefined;
}

reporteRouter.get("/semanal", requirePermission("nomina", "ver"), async (req, res) => {
  res.json(await generarReporteNominaSemanal(hoyQuery(req), huertaIdQuery(req, huertaIdDeAlcance(req))));
});

reporteRouter.get("/semanal/desglose-total", requirePermission("nomina", "ver"), async (req, res) => {
  const reporte = await generarReporteNominaSemanal(hoyQuery(req), huertaIdQuery(req, huertaIdDeAlcance(req)));
  const desgloses = reporte.filas.map((f) => desglosarMonto(f.neto));
  res.json({ periodo: reporte.periodo, totalPorDenominacion: sumarDesgloses(desgloses) });
});

// Acción irreversible (bloque 5): aplica de verdad los descuentos de
// préstamo proyectados, y marca la semana como confirmada/pagada — candado
// permanente, ver semana-confirmada.ts. Requiere permiso de "editar" en
// Nómina — no disponible para Supervisor (solo "capturar"). Siempre global
// (toda la nómina de la semana), sin importar qué filtro de Huerta esté
// activo en pantalla al momento de confirmar.
reporteRouter.post("/semanal/confirmar", requirePermission("nomina", "editar"), async (req, res) => {
  try {
    await confirmarNominaSemanal(hoyQuery(req), req.usuario!.usuarioId);
    res.status(204).end();
  } catch (err) {
    if (err instanceof SemanaConfirmadaError) {
      res.status(423).json({ error: err.message });
      return;
    }
    throw err;
  }
});

reporteRouter.get("/semanal/sobres.pdf", requirePermission("nomina", "ver"), async (req, res) => {
  const reporte = await generarReporteNominaSemanal(hoyQuery(req), huertaIdQuery(req, huertaIdDeAlcance(req)));
  const detallePorPersona = new Map(
    await Promise.all(
      reporte.filas.map(
        async (f) => [f.personalId, await detalleActividadesPersonaEnPeriodo(f.personalId, reporte.periodo.inicio, reporte.periodo.fin)] as const
      )
    )
  );

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="nomina-sobres-${reporte.periodo.fin}.pdf"`);
  const doc = generarPdfSobres(reporte.filas, detallePorPersona, reporte.periodo);
  doc.pipe(res);
  doc.end();
});
