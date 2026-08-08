import PDFDocument from "pdfkit";
import { desglosarMonto } from "@cbf/shared";
import type { FilaReporteSemanal } from "./reporte.js";
import type { LineaDetalleActividad } from "./detalle.js";

function money(n: number): string {
  return "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Una hoja por persona, lista para pegarse a un sobre de efectivo: desglose
 * de actividades por día, subtotal, descuentos, bonos, TOTAL y el desglose
 * de billetes/monedas exacto para armar el sobre (bloque 9.11).
 */
export function generarPdfSobres(
  filas: FilaReporteSemanal[],
  detallePorPersona: Map<string, LineaDetalleActividad[]>,
  periodo: { inicio: string; fin: string }
): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: "A5", margin: 30 });

  filas.forEach((fila, i) => {
    if (i > 0) doc.addPage({ size: "A5", margin: 30 });

    doc.fontSize(14).text(fila.nombreCompleto, { underline: true });
    doc.fontSize(9).fillColor("#666").text(`Periodo ${periodo.inicio} — ${periodo.fin}`);
    doc.moveDown();

    doc.fontSize(10).fillColor("#000").text("Detalle de actividades");
    const detalle = detallePorPersona.get(fila.personalId) ?? [];
    for (const linea of detalle) {
      doc.fontSize(8).text(`${linea.fecha}  ${linea.actividad}  x${linea.cantidad}  ${money(linea.monto)}`);
    }
    doc.moveDown();

    doc.fontSize(10);
    doc.text(`Subtotal:              ${money(fila.bruto)}`);
    doc.text(`Bonos:                 ${money(fila.bonos)}`);
    doc.text(`Descuentos préstamo:   -${money(fila.descuentoPrestamos)}`);
    doc.fontSize(13).text(`TOTAL A PAGAR:  ${money(fila.neto)}`, { underline: true });
    doc.moveDown();

    doc.fontSize(10).text("Desglose de efectivo:");
    for (const pieza of desglosarMonto(fila.neto)) {
      doc.fontSize(9).text(`  ${pieza.cantidad} x $${pieza.denominacion}`);
    }
  });

  return doc;
}
