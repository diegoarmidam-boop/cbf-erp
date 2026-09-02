import path from "node:path";
import PDFDocument from "pdfkit";
import type { OrdenAplicacion, OrdenFertirriego } from "./ordenes.js";

// Identidad de marca Chula (25-ago-2026, primer PDF del sistema que la
// aplica) — mismos tokens de color que web/src/styles/tokens.css
// (--pink/--wine), no los colores verdes de los Excel originales.
const ROSA = "#e6127a";
const VINO = "#6b2140";
const GRIS = "#6b7280";
const GRIS_CLARO = "#e8e8ef";
const NEGRO = "#22242b";
const LOGO_PATH = path.resolve(process.cwd(), "src/assets/logo-chula-brand.jpg");

const MARGEN = 40;

// Separador de miles (27-ago-2026, pedido para todo el sistema) — mismo
// criterio que web/src/lib/numero.ts, duplicado aquí porque el PDF corre
// en el backend, sin acceso a ese módulo del frontend.
function nf(valor: number, maxDecimales = 3): string {
  return valor.toLocaleString("es-MX", { maximumFractionDigits: maxDecimales });
}

/**
 * 9.16 (2-sep-2026, corrección visual): la línea separadora rosa vivía en
 * y=90, dentro del propio rango vertical del logo (y=30 a y=100, con
 * width:70 y el logo cuadrado escalando proporcional) — atravesaba
 * justo el wordmark "CHULA BRAND" de la imagen. Se baja la línea a y=108,
 * después del borde inferior real del logo, con margen.
 */
function encabezadoMarca(doc: PDFKit.PDFDocument, titulo: string) {
  try {
    doc.image(LOGO_PATH, MARGEN, 30, { width: 70 });
  } catch {
    // Si el logo no está disponible no debe tumbar la generación del PDF.
  }
  doc.fontSize(16).fillColor(VINO).font("Helvetica-Bold").text(titulo, MARGEN + 85, 38, { width: 400 });
  doc.moveTo(MARGEN, 108).lineTo(doc.page.width - MARGEN, 108).strokeColor(ROSA).lineWidth(2).stroke();
  doc.fillColor(NEGRO).font("Helvetica").lineWidth(1);
  return 122;
}

function filaEncabezado(doc: PDFKit.PDFDocument, x: number, y: number, ancho: number, etiqueta: string, valor: string) {
  doc.fontSize(8).fillColor(GRIS).text(etiqueta.toUpperCase(), x, y, { width: ancho });
  doc.fontSize(10.5).fillColor(NEGRO).text(valor, x, y + 11, { width: ancho });
}

function grid(doc: PDFKit.PDFDocument, y: number, columnas: { etiqueta: string; valor: string }[], porFila = 4) {
  const anchoUtil = doc.page.width - MARGEN * 2;
  const anchoCol = anchoUtil / porFila;
  let cy = y;
  columnas.forEach((c, i) => {
    const col = i % porFila;
    if (col === 0 && i > 0) cy += 34;
    filaEncabezado(doc, MARGEN + col * anchoCol, cy, anchoCol - 8, c.etiqueta, c.valor);
  });
  return cy + 34;
}

/**
 * 9.16 (2-sep-2026, corrección visual): antes usaba alturas fijas (20 para
 * encabezado, 18 por fila) — cuando un encabezado o una celda envolvía a 2
 * líneas (PDFKit hace word-wrap automático, no trunca), el texto se salía
 * de esa altura fija y descuadraba la fila siguiente. Ahora mide con
 * `heightOfString` la altura real que va a ocupar cada celda (con la
 * fuente/tamaño que de verdad se va a usar) y usa el máximo de la fila
 * como su altura — todas las columnas de esa fila comparten esa altura,
 * así que nunca se desalinean aunque una sola celda envuelva a 2+ líneas.
 */
const PAD_X = 4;

function tabla(doc: PDFKit.PDFDocument, y: number, anchos: number[], encabezados: string[], filas: string[][]): number {
  const anchoTotal = anchos.reduce((s, a) => s + a, 0);
  let cy = y;

  doc.fontSize(8.5).font("Helvetica-Bold");
  const alturaEncabezado = Math.max(
    20,
    ...encabezados.map((h, i) => doc.heightOfString(h, { width: anchos[i]! - PAD_X * 2 }) + 10)
  );
  doc.rect(MARGEN, cy, anchoTotal, alturaEncabezado).fill(VINO);
  let cx = MARGEN;
  doc.fillColor("#fff");
  encabezados.forEach((h, i) => {
    doc.text(h, cx + PAD_X, cy + 6, { width: anchos[i]! - PAD_X * 2 });
    cx += anchos[i]!;
  });
  cy += alturaEncabezado;
  doc.font("Helvetica").fillColor(NEGRO);

  filas.forEach((fila, filaIdx) => {
    doc.fontSize(8.5).font("Helvetica");
    const alturaFila = Math.max(
      18,
      ...fila.map((valor, i) => doc.heightOfString(valor, { width: anchos[i]! - PAD_X * 2 }) + 9)
    );
    if (filaIdx % 2 === 1) doc.rect(MARGEN, cy, anchoTotal, alturaFila).fill(GRIS_CLARO);
    doc.fillColor(NEGRO);
    cx = MARGEN;
    fila.forEach((valor, i) => {
      doc.text(valor, cx + PAD_X, cy + 5, { width: anchos[i]! - PAD_X * 2 });
      cx += anchos[i]!;
    });
    cy += alturaFila;
  });
  doc.rect(MARGEN, y, anchoTotal, cy - y).strokeColor(GRIS_CLARO).stroke();
  return cy;
}

export function generarPdfOrdenAplicacion(orden: OrdenAplicacion): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: "letter", margin: MARGEN });
  let y = encabezadoMarca(doc, "Orden de Aplicación");
  const e = orden.encabezado;

  y = grid(doc, y, [
    { etiqueta: "Semana", valor: `${e.semana.inicio} al ${e.semana.fin}` },
    { etiqueta: "Lote / Huerta", valor: e.loteHuerta },
    { etiqueta: "No. de aplicación", valor: String(e.numeroAplicacion) },
    { etiqueta: "Fecha programada", valor: e.fechaProgramada },
    { etiqueta: "Capacidad tanque/bomba", valor: `${nf(e.capacidadTanque)} L` },
    { etiqueta: "Tipo de aplicación", valor: e.tipoAplicacion ?? "Sin especificar" },
    { etiqueta: "Hectáreas a aplicar", valor: `${nf(e.hectareasAAplicar)} ha` },
    { etiqueta: "Gasto de agua", valor: `${nf(e.gastoAguaLHa)} L/ha` },
    { etiqueta: "Volumen total de agua", valor: `${nf(e.volumenTotalAguaL)} L` },
    { etiqueta: "Tanques a preparar", valor: nf(e.tanquesAPreparar) },
    { etiqueta: "Plantas a tratar", valor: e.plantasATratar != null ? nf(Math.round(e.plantasATratar)) : "No disponible" },
    { etiqueta: "Productos en la mezcla", valor: nf(e.numeroProductos) },
    { etiqueta: "Equipo de aplicación", valor: e.equipoAplicacion },
    { etiqueta: "Hectáreas por tanque", valor: `${nf(e.hectareasPorTanque)} ha` },
  ]);

  y += 6;
  doc.rect(MARGEN, y, doc.page.width - MARGEN * 2, 26).fill(ROSA);
  doc.fontSize(10).fillColor("#fff").font("Helvetica-Bold").text(orden.resumenPreparar, MARGEN + 8, y + 8, { width: doc.page.width - MARGEN * 2 - 16 });
  doc.font("Helvetica").fillColor(NEGRO);
  y += 38;

  const anchos = [24, 90, 85, 45, 45, 70, 75, 75];
  tabla(
    doc,
    y,
    anchos,
    ["No.", "Producto", "Ing. Activo", "Dosis", "Unidad", "Total lote", "Por tanque", "Último tanque"],
    orden.productos.map((p) => [
      String(p.numero),
      p.nombreComercial,
      p.ingredienteActivo,
      nf(p.dosisValor),
      p.unidadDosis,
      `${nf(p.cantidadTotalLote.valor)} ${p.cantidadTotalLote.unidad}`,
      `${nf(p.cantidadPorTanqueCompleto.valor)} ${p.cantidadPorTanqueCompleto.unidad}`,
      `${nf(p.cantidadUltimoTanque.valor)} ${p.cantidadUltimoTanque.unidad}`,
    ])
  );

  return doc;
}

export function generarPdfOrdenFertirriego(orden: OrdenFertirriego): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: "letter", layout: "landscape", margin: MARGEN });
  let y = encabezadoMarca(doc, "Orden de Fertirriego");
  const e = orden.encabezado;

  y = grid(
    doc,
    y,
    [
      { etiqueta: "Lote", valor: e.lote },
      { etiqueta: "Semana", valor: `${e.semana.inicio} al ${e.semana.fin}` },
      { etiqueta: "Fecha", valor: e.fecha },
      { etiqueta: "Válvulas del lote", valor: nf(e.valvulasDelLote) },
      { etiqueta: "Receta", valor: e.receta ?? "Programación libre" },
      { etiqueta: "Frecuencia", valor: e.frecuencia },
      { etiqueta: "Riegos en la semana", valor: nf(e.riegosEnLaSemana) },
      { etiqueta: "Riegos en la campaña", valor: `${nf(e.riegosEnCampania)} (hasta ${e.fechaFinCampania})` },
      { etiqueta: "Hectáreas totales", valor: `${nf(e.hectareasTotales)} ha` },
    ],
    4
  );
  y += 10;

  const anchoValvula = 90;
  const anchoHectareas = 70;
  const anchoProducto = (doc.page.width - MARGEN * 2 - anchoValvula - anchoHectareas) / Math.max(1, orden.productos.length);
  const anchos = [anchoValvula, anchoHectareas, ...orden.productos.map(() => anchoProducto)];
  // 9.16 (2-sep-2026): encabezado por Ingrediente Activo, no Nombre
  // Comercial — una receta no debería tener 2 productos con el mismo
  // Ingrediente Activo (si eso pasa, los encabezados salen duplicados a
  // propósito, para que se note, en vez de fusionarlos sin avisar).
  const encabezados = ["Válvula", "Hectáreas", ...orden.productos.map((p) => p.ingredienteActivo)];

  const filas = orden.valvulas.map((v) => [
    v.nombre,
    nf(v.hectareas),
    ...orden.productos.map((p) => {
      const c = p.porValvula.find((pv) => pv.seccionId === v.seccionId)!.cantidad;
      return `${nf(c.valor)} ${c.unidad}`;
    }),
  ]);
  filas.push([
    "Total por riego",
    nf(e.hectareasTotales),
    ...orden.productos.map((p) => `${nf(p.totalPorRiego.valor)} ${p.totalPorRiego.unidad}`),
  ]);
  filas.push([
    "Total de la semana",
    "",
    ...orden.productos.map((p) => `${nf(p.totalSemana.valor)} ${p.totalSemana.unidad}`),
  ]);
  filas.push([
    `Total de campaña (hasta ${e.fechaFinCampania})`,
    "",
    ...orden.productos.map((p) => `${nf(p.totalCampania.valor)} ${p.totalCampania.unidad}`),
  ]);

  tabla(doc, y, anchos, encabezados, filas);

  return doc;
}
