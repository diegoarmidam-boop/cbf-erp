import PDFDocument from "pdfkit";
import { desglosarMonto } from "@cbf/shared";
import type { FilaReporteSemanal } from "./reporte.js";
import type { LineaDetalleActividad } from "./detalle.js";

const CM = 28.3465; // puntos por centímetro (pdfkit trabaja en puntos, 72/in)
const ANCHO_SOBRE = 9 * CM;
const ALTO_SOBRE = 15 * CM;
const SOBRES_POR_HOJA = 3;
const MARGEN_HOJA = 10;
const ESPACIO_ENTRE = 6;
const PADDING = 10;

function money(n: number): string {
  return "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Nombres cortos de día para la tabla compacta (estructura semanal estándar, L a D). */
const DIA_CORTO = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function nombreDia(fechaISO: string): string {
  // new Date("YYYY-MM-DD") se interpreta en UTC — coherente con cómo se guardan las fechas del periodo.
  return DIA_CORTO[new Date(fechaISO + "T00:00:00Z").getUTCDay()]!;
}

/** Suma por día del detalle de actividades — reemplaza el desglose línea por línea (rediseño 8-ago-2026, 9.11). */
function totalesPorDia(detalle: LineaDetalleActividad[]): { fecha: string; monto: number }[] {
  const porDia = new Map<string, number>();
  for (const linea of detalle) {
    porDia.set(linea.fecha, (porDia.get(linea.fecha) ?? 0) + linea.monto);
  }
  return [...porDia.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([fecha, monto]) => ({ fecha, monto }));
}

/**
 * Rediseño de impresión (9.11, confirmado 8-ago-2026, detectado durante
 * pruebas del sistema real): el diseño original imprimía una hoja completa
 * por persona, poco práctico con volúmenes de ~300 personas. Ahora:
 * - Sobre físico de 9×15 cm exacto, 3 por hoja carta horizontal (el máximo
 *   que cabe con esa medida), con un recuadro como única separación visual
 *   (no hacen falta líneas punteadas de corte).
 * - Contenido simplificado a total ganado por día (tabla compacta de 6-7
 *   días) en vez del detalle de actividades línea por línea — libera
 *   espacio para que quepan subtotal, bonos, descuentos y TOTAL sin
 *   apretarse.
 */
export function generarPdfSobres(
  filas: FilaReporteSemanal[],
  detallePorPersona: Map<string, LineaDetalleActividad[]>,
  periodo: { inicio: string; fin: string }
): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: "letter", layout: "landscape", margin: MARGEN_HOJA });

  filas.forEach((fila, i) => {
    const posicionEnHoja = i % SOBRES_POR_HOJA;
    if (i > 0 && posicionEnHoja === 0) doc.addPage({ size: "letter", layout: "landscape", margin: MARGEN_HOJA });

    const x = MARGEN_HOJA + posicionEnHoja * (ANCHO_SOBRE + ESPACIO_ENTRE);
    const y = MARGEN_HOJA;

    doc.rect(x, y, ANCHO_SOBRE, ALTO_SOBRE).stroke();

    const cx = x + PADDING;
    let cy = y + PADDING;
    const anchoContenido = ANCHO_SOBRE - PADDING * 2;

    doc.fontSize(12).fillColor("#000").text(fila.nombreCompleto, cx, cy, { width: anchoContenido });
    cy += 16;
    doc.fontSize(7.5).fillColor("#666").text(`Periodo ${periodo.inicio} — ${periodo.fin}`, cx, cy, { width: anchoContenido });
    cy += 14;

    doc.moveTo(cx, cy).lineTo(cx + anchoContenido, cy).strokeColor("#ccc").stroke().strokeColor("#000");
    cy += 6;

    const dias = totalesPorDia(detallePorPersona.get(fila.personalId) ?? []);
    const sueldoFijo = fila.tipo === "fijo" ? Math.max(0, fila.bruto - dias.reduce((s, d) => s + d.monto, 0)) : 0;

    doc.fontSize(8).fillColor("#000");
    if (sueldoFijo > 0) {
      doc.text(`Sueldo fijo del periodo:  ${money(sueldoFijo)}`, cx, cy, { width: anchoContenido });
      cy += 11;
    }

    if (dias.length > 0) {
      doc.fontSize(7.5).fillColor("#666").text("Ganado por día:", cx, cy, { width: anchoContenido });
      cy += 10;
      for (const d of dias) {
        doc.fontSize(8).fillColor("#000").text(`${nombreDia(d.fecha)} ${d.fecha.slice(5)}`, cx, cy, { width: anchoContenido * 0.5, continued: true });
        doc.text(money(d.monto), { width: anchoContenido * 0.5, align: "right" });
        cy += 10.5;
      }
      cy += 2;
    }

    doc.moveTo(cx, cy).lineTo(cx + anchoContenido, cy).strokeColor("#ccc").stroke().strokeColor("#000");
    cy += 6;

    doc.fontSize(8.5);
    doc.text("Subtotal:", cx, cy, { width: anchoContenido * 0.6, continued: true }).text(money(fila.bruto), { width: anchoContenido * 0.4, align: "right" });
    cy += 11;
    doc.text("Bonos:", cx, cy, { width: anchoContenido * 0.6, continued: true }).text(money(fila.bonos), { width: anchoContenido * 0.4, align: "right" });
    cy += 11;
    doc
      .text("Descuentos préstamo:", cx, cy, { width: anchoContenido * 0.6, continued: true })
      .text(`-${money(fila.descuentoPrestamos)}`, { width: anchoContenido * 0.4, align: "right" });
    cy += 13;

    doc.fontSize(10.5).text("TOTAL A PAGAR:", cx, cy, { width: anchoContenido, underline: true });
    cy += 14;
    doc.fontSize(13).text(money(fila.neto), cx, cy, { width: anchoContenido, align: "right" });
    cy += 20;

    doc.moveTo(cx, cy).lineTo(cx + anchoContenido, cy).strokeColor("#ccc").stroke().strokeColor("#000");
    cy += 6;

    doc.fontSize(7.5).fillColor("#666").text("Desglose de efectivo:", cx, cy, { width: anchoContenido });
    cy += 10;
    doc.fontSize(8).fillColor("#000");
    for (const pieza of desglosarMonto(fila.neto)) {
      doc.text(`${pieza.cantidad} × $${pieza.denominacion}`, cx, cy, { width: anchoContenido });
      cy += 10.5;
    }
  });

  return doc;
}
