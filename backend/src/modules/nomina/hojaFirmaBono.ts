import path from "node:path";
import PDFDocument from "pdfkit";
import type { ResumenBonoAsistencia } from "./bonoAsistencia.js";

const ROSA = "#e6127a";
const VINO = "#6b2140";
const GRIS = "#6b7280";
const LOGO_PATH = path.resolve(process.cwd(), "src/assets/logo-chula-brand.jpg");

const dinero = (n: number) => "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (iso: string) => iso.split("-").reverse().join("/");

/**
 * Hoja de firma específica del Bono de Asistencia Semanal (V1 P7): se
 * genera junto a las hojas de pago y sobres al cerrar la semana, para que
 * la gente firme de recibido por separado. Solo quienes ganaron el bono.
 */
export function generarPdfHojaFirmaBono(resumen: ResumenBonoAsistencia): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: "LETTER", margin: 40 });
  const ganadores = resumen.filas.filter((f) => f.resultado.monto > 0);
  const ANCHO = 612 - 80;
  let y = 40;

  const encabezado = () => {
    try {
      doc.image(LOGO_PATH, 40, y, { width: 56 });
    } catch {
      /* sin logo: no bloquea el PDF */
    }
    doc.fillColor(VINO).fontSize(16).font("Helvetica-Bold").text("Bono de Asistencia Semanal — Hoja de firma", 110, y + 4, { width: ANCHO - 70 });
    doc
      .fillColor(GRIS)
      .fontSize(9.5)
      .font("Helvetica")
      .text(`Semana de asistencia: Lunes ${fmt(resumen.semanaBono.inicio)} a Sábado ${fmt(resumen.semanaBono.fin)}`, 110, y + 26)
      .text(`Nómina que se paga: ${fmt(resumen.periodoNomina.inicio)} a ${fmt(resumen.periodoNomina.fin)}`, 110, y + 39);
    y += 70;
    doc.moveTo(40, y).lineTo(40 + ANCHO, y).strokeColor(ROSA).lineWidth(2).stroke();
    y += 10;
    doc.fillColor(GRIS).fontSize(9).font("Helvetica-Bold");
    doc.text("Nombre", 44, y).text("Monto", 300, y, { width: 70, align: "right" }).text("Firma de recibido", 390, y);
    y += 14;
    doc.moveTo(40, y).lineTo(40 + ANCHO, y).strokeColor("#d1d5db").lineWidth(0.5).stroke();
    y += 6;
  };

  encabezado();
  let total = 0;
  for (const f of ganadores) {
    if (y > 720) {
      doc.addPage();
      y = 40;
      encabezado();
    }
    total += f.resultado.monto;
    doc.fillColor("#22242b").fontSize(10).font("Helvetica").text(f.nombreCompleto, 44, y + 6, { width: 250 });
    doc.text(dinero(f.resultado.monto), 300, y + 6, { width: 70, align: "right" });
    doc.moveTo(390, y + 24).lineTo(40 + ANCHO - 4, y + 24).strokeColor("#9ca3af").lineWidth(0.5).stroke();
    y += 30;
  }
  if (ganadores.length === 0) {
    doc.fillColor(GRIS).fontSize(11).text("Nadie ganó el bono en esta semana.", 44, y + 10);
  } else {
    doc.moveTo(40, y).lineTo(40 + ANCHO, y).strokeColor(ROSA).lineWidth(1).stroke();
    doc.fillColor(VINO).font("Helvetica-Bold").fontSize(11).text(`Total: ${dinero(total)}  ·  ${ganadores.length} persona${ganadores.length === 1 ? "" : "s"}`, 44, y + 8);
  }
  return doc;
}
