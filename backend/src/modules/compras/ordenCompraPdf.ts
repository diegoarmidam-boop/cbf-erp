import path from "node:path";
import PDFDocument from "pdfkit";
import { importeALetra } from "@cbf/shared";
import { prisma } from "../../core/db.js";
import { obtenerEmpresaConfig } from "../configuracion/empresa.js";

const ROSA = "#e6127a";
const VINO = "#6b2140";
const GRIS = "#6b7280";
const NEGRO = "#22242b";
const LOGO_PATH = path.resolve(process.cwd(), "src/assets/logo-chula-brand.jpg");
const MARGEN = 40;

function nf(valor: number, maxDecimales = 2): string {
  return valor.toLocaleString("es-MX", { maximumFractionDigits: maxDecimales, minimumFractionDigits: maxDecimales });
}

export class OrdenSinFolioError extends Error {
  constructor() {
    super("Esta orden todavía no tiene folio — genera la orden desde el Comparador de Cotizaciones primero.");
  }
}

/**
 * Documento Orden de Compra (3.1, 2-sep-2026, 9.14): solicitud de surtido
 * al Proveedor, NO comprobante fiscal — no calcula IVA/IEPS/retenciones
 * (queda para una futura fase de Contabilidad). Solo tiene sentido para
 * una orden que ya pasó por "Generar orden de compra" en el Comparador
 * (folio + Proveedor + precio ya fijos).
 */
export async function obtenerOrdenCompraParaPdf(id: string) {
  const orden = await prisma.ordenCompra.findUniqueOrThrow({
    where: { id },
    include: { producto: true, proveedor: true },
  });
  if (orden.numero == null || !orden.proveedor || orden.precioUnitario == null) {
    throw new OrdenSinFolioError();
  }
  const empresa = await obtenerEmpresaConfig();

  const cantidad = Number(orden.cantidadSolicitada);
  const precioUnitario = Number(orden.precioUnitario);
  const importe = cantidad * precioUnitario;

  return {
    numero: orden.numero,
    fecha: (orden.fechaFormalizacion ?? orden.fechaCreacion).toISOString().slice(0, 10),
    empresa: {
      razonSocial: empresa.razonSocial ?? "—",
      rfc: empresa.rfc ?? "—",
      domicilioFiscal: empresa.domicilioFiscal ?? "—",
      telefono: empresa.telefono ?? "—",
    },
    proveedor: {
      nombre: orden.proveedor.nombre,
    },
    producto: {
      nombreComercial: orden.producto.nombreComercial,
      ingredienteActivo: orden.producto.ingredienteActivo ?? "—",
      unidad: orden.producto.unidad,
    },
    cantidad,
    precioUnitario,
    importe,
    importeEnLetra: importeALetra(importe),
    firmaAtiende: empresa.firmaAtiendeNombre ?? "—",
    firmaAutoriza: empresa.firmaAutorizaNombre ?? "—",
  };
}

export type OrdenCompraPdfData = Awaited<ReturnType<typeof obtenerOrdenCompraParaPdf>>;

function encabezado(doc: PDFKit.PDFDocument, folio: number) {
  try {
    doc.image(LOGO_PATH, MARGEN, 30, { width: 70 });
  } catch {
    // Si el logo no está disponible no debe tumbar la generación del PDF.
  }
  doc.fontSize(16).fillColor(VINO).font("Helvetica-Bold").text("Orden de Compra", MARGEN + 85, 38, { width: 300 });
  doc.fontSize(11).fillColor(NEGRO).font("Helvetica-Bold").text(`Folio: ${String(folio).padStart(6, "0")}`, doc.page.width - MARGEN - 150, 38, {
    width: 150,
    align: "right",
  });
  doc.moveTo(MARGEN, 108).lineTo(doc.page.width - MARGEN, 108).strokeColor(ROSA).lineWidth(2).stroke();
  doc.fillColor(NEGRO).font("Helvetica").lineWidth(1);
  return 122;
}

function bloqueDatos(doc: PDFKit.PDFDocument, y: number, titulo: string, lineas: string[], x: number, ancho: number): number {
  doc.fontSize(9).fillColor(GRIS).font("Helvetica-Bold").text(titulo.toUpperCase(), x, y, { width: ancho });
  let cy = y + 13;
  doc.fontSize(10).fillColor(NEGRO).font("Helvetica");
  for (const linea of lineas) {
    doc.text(linea, x, cy, { width: ancho });
    cy += doc.heightOfString(linea, { width: ancho }) + 2;
  }
  return cy;
}

export function generarPdfOrdenCompra(orden: OrdenCompraPdfData): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: "letter", margin: MARGEN });
  let y = encabezado(doc, orden.numero);
  const anchoMitad = (doc.page.width - MARGEN * 2 - 20) / 2;

  const finEmpresa = bloqueDatos(
    doc,
    y,
    "Datos de facturación",
    [orden.empresa.razonSocial, `RFC: ${orden.empresa.rfc}`, orden.empresa.domicilioFiscal, `Tel: ${orden.empresa.telefono}`],
    MARGEN,
    anchoMitad
  );
  const finProveedor = bloqueDatos(doc, y, "Proveedor", [orden.proveedor.nombre], MARGEN + anchoMitad + 20, anchoMitad);
  y = Math.max(finEmpresa, finProveedor) + 8;

  doc.fontSize(9).fillColor(GRIS).font("Helvetica-Bold").text("FECHA", MARGEN, y);
  doc.fontSize(10).fillColor(NEGRO).font("Helvetica").text(orden.fecha, MARGEN, y + 13);
  y += 40;

  // Tabla de un solo producto — mismo estilo visual que Orden de
  // Aplicación/Fertirriego (fondo vino, texto blanco en encabezado).
  const anchos = [60, 60, 220, 90, 90];
  const encabezados = ["Cantidad", "Unidad", "Descripción", "Valor unitario", "Importe"];
  const anchoTotal = anchos.reduce((s, a) => s + a, 0);

  doc.fontSize(9).font("Helvetica-Bold");
  const descripcion = `${orden.producto.nombreComercial} (${orden.producto.ingredienteActivo})`;
  const alturaEncabezado = Math.max(20, doc.heightOfString(encabezados[2]!, { width: anchos[2]! - 8 }) + 10);
  doc.rect(MARGEN, y, anchoTotal, alturaEncabezado).fill(VINO);
  let cx = MARGEN;
  doc.fillColor("#fff");
  encabezados.forEach((h, i) => {
    doc.text(h, cx + 4, y + 6, { width: anchos[i]! - 8 });
    cx += anchos[i]!;
  });
  y += alturaEncabezado;

  doc.font("Helvetica").fillColor(NEGRO).fontSize(9);
  const alturaFila = Math.max(20, doc.heightOfString(descripcion, { width: anchos[2]! - 8 }) + 9);
  cx = MARGEN;
  const valoresFila = [nf(orden.cantidad, 3), orden.producto.unidad, descripcion, `$${nf(orden.precioUnitario)}`, `$${nf(orden.importe)}`];
  valoresFila.forEach((valor, i) => {
    doc.text(valor, cx + 4, y + 5, { width: anchos[i]! - 8 });
    cx += anchos[i]!;
  });
  doc.rect(MARGEN, y - alturaEncabezado, anchoTotal, alturaEncabezado + alturaFila).strokeColor(GRIS).stroke();
  y += alturaFila + 16;

  doc.font("Helvetica-Bold").fontSize(12).text(`Total: $${nf(orden.importe)}`, MARGEN, y, { width: anchoTotal, align: "right" });
  y += 22;
  doc.font("Helvetica").fontSize(9.5).text(orden.importeEnLetra, MARGEN, y, { width: anchoTotal });
  y += 50;

  const anchoFirma = (anchoTotal - 40) / 2;
  doc.moveTo(MARGEN, y).lineTo(MARGEN + anchoFirma, y).strokeColor(GRIS).stroke();
  doc.moveTo(MARGEN + anchoFirma + 40, y).lineTo(MARGEN + anchoFirma * 2 + 40, y).strokeColor(GRIS).stroke();
  y += 6;
  doc.fontSize(9.5).text(`Atentamente: ${orden.firmaAtiende}`, MARGEN, y, { width: anchoFirma, align: "center" });
  doc.text(`Autorizó: ${orden.firmaAutoriza}`, MARGEN + anchoFirma + 40, y, { width: anchoFirma, align: "center" });

  return doc;
}
