import { Router } from "express";
import { desglosarMonto, sumarDesgloses } from "@cbf/shared";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import { confirmarNominaSemanal, generarReporteNominaSemanal } from "./reporte.js";
import { detalleActividadesPersonaEnPeriodo } from "./detalle.js";
import { generarPdfSobres } from "./sobre.js";

export const reporteRouter = Router();
reporteRouter.use(requireAuth);

function hoyQuery(req: { query: Record<string, unknown> }): string {
  return typeof req.query.hoy === "string" ? req.query.hoy : new Date().toISOString().slice(0, 10);
}

reporteRouter.get("/semanal", requirePermission("nomina", "ver"), async (req, res) => {
  res.json(await generarReporteNominaSemanal(hoyQuery(req)));
});

reporteRouter.get("/semanal/desglose-total", requirePermission("nomina", "ver"), async (req, res) => {
  const reporte = await generarReporteNominaSemanal(hoyQuery(req));
  const desgloses = reporte.filas.map((f) => desglosarMonto(f.neto));
  res.json({ periodo: reporte.periodo, totalPorDenominacion: sumarDesgloses(desgloses) });
});

// Acción irreversible (bloque 5): aplica de verdad los descuentos de
// préstamo proyectados. Requiere permiso de "editar" en Nómina — no
// disponible para Supervisor (solo "capturar").
reporteRouter.post("/semanal/confirmar", requirePermission("nomina", "editar"), async (req, res) => {
  await confirmarNominaSemanal(hoyQuery(req), req.usuario!.usuarioId);
  res.status(204).end();
});

reporteRouter.get("/semanal/sobres.pdf", requirePermission("nomina", "ver"), async (req, res) => {
  const reporte = await generarReporteNominaSemanal(hoyQuery(req));
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
