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

function encabezadoMarca(doc: PDFKit.PDFDocument, titulo: string) {
  try {
    doc.image(LOGO_PATH, MARGEN, 30, { width: 70 });
  } catch {
    // Si el logo no está disponible no debe tumbar la generación del PDF.
  }
  doc.fontSize(16).fillColor(VINO).font("Helvetica-Bold").text(titulo, MARGEN + 85, 38, { width: 400 });
  doc.moveTo(MARGEN, 90).lineTo(doc.page.width - MARGEN, 90).strokeColor(ROSA).lineWidth(2).stroke();
  doc.fillColor(NEGRO).font("Helvetica").lineWidth(1);
  return 105;
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

function tabla(doc: PDFKit.PDFDocument, y: number, anchos: number[], encabezados: string[], filas: string[][]): number {
  const anchoTotal = anchos.reduce((s, a) => s + a, 0);
  let cy = y;
  doc.rect(MARGEN, cy, anchoTotal, 20).fill(VINO);
  let cx = MARGEN;
  doc.fontSize(8.5).fillColor("#fff").font("Helvetica-Bold");
  encabezados.forEach((h, i) => {
    doc.text(h, cx + 4, cy + 6, { width: anchos[i]! - 8 });
    cx += anchos[i]!;
  });
  cy += 20;
  doc.font("Helvetica").fillColor(NEGRO);

  filas.forEach((fila, filaIdx) => {
    const alturaFila = 18;
    if (filaIdx % 2 === 1) doc.rect(MARGEN, cy, anchoTotal, alturaFila).fill(GRIS_CLARO);
    doc.fillColor(NEGRO);
    cx = MARGEN;
    fila.forEach((valor, i) => {
      doc.fontSize(8.5).text(valor, cx + 4, cy + 5, { width: anchos[i]! - 8 });
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
    { etiqueta: "Capacidad tanque/bomba", valor: `${e.capacidadTanque} L` },
    { etiqueta: "Tipo de aplicación", valor: e.tipoAplicacion ?? "Sin especificar" },
    { etiqueta: "Hectáreas a aplicar", valor: `${e.hectareasAAplicar} ha` },
    { etiqueta: "Gasto de agua", valor: `${e.gastoAguaLHa} L/ha` },
    { etiqueta: "Volumen total de agua", valor: `${e.volumenTotalAguaL} L` },
    { etiqueta: "Tanques a preparar", valor: String(e.tanquesAPreparar) },
    { etiqueta: "Plantas a tratar", valor: e.plantasATratar != null ? String(Math.round(e.plantasATratar)) : "No disponible" },
    { etiqueta: "Productos en la mezcla", valor: String(e.numeroProductos) },
    { etiqueta: "Equipo de aplicación", valor: e.equipoAplicacion },
    { etiqueta: "Hectáreas por tanque", valor: `${e.hectareasPorTanque} ha` },
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
      String(p.dosisValor),
      p.unidadDosis,
      `${p.cantidadTotalLote.valor} ${p.cantidadTotalLote.unidad}`,
      `${p.cantidadPorTanqueCompleto.valor} ${p.cantidadPorTanqueCompleto.unidad}`,
      `${p.cantidadUltimoTanque.valor} ${p.cantidadUltimoTanque.unidad}`,
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
      { etiqueta: "Válvulas del lote", valor: String(e.valvulasDelLote) },
      { etiqueta: "Receta", valor: e.receta ?? "Programación libre" },
      { etiqueta: "Frecuencia", valor: e.frecuencia },
      { etiqueta: "Riegos en la semana", valor: String(e.riegosEnLaSemana) },
      { etiqueta: "Hectáreas totales", valor: `${e.hectareasTotales} ha` },
    ],
    4
  );
  y += 10;

  const anchoValvula = 90;
  const anchoHectareas = 70;
  const anchoProducto = (doc.page.width - MARGEN * 2 - anchoValvula - anchoHectareas) / Math.max(1, orden.productos.length);
  const anchos = [anchoValvula, anchoHectareas, ...orden.productos.map(() => anchoProducto)];
  const encabezados = ["Válvula", "Hectáreas", ...orden.productos.map((p) => p.nombreComercial)];

  const filas = orden.valvulas.map((v) => [
    v.nombre,
    String(v.hectareas),
    ...orden.productos.map((p) => {
      const c = p.porValvula.find((pv) => pv.seccionId === v.seccionId)!.cantidad;
      return `${c.valor} ${c.unidad}`;
    }),
  ]);
  filas.push([
    "Total por riego",
    String(e.hectareasTotales),
    ...orden.productos.map((p) => `${p.totalPorRiego.valor} ${p.totalPorRiego.unidad}`),
  ]);
  filas.push([
    "Total de la semana",
    "",
    ...orden.productos.map((p) => `${p.totalSemana.valor} ${p.totalSemana.unidad}`),
  ]);

  tabla(doc, y, anchos, encabezados, filas);

  return doc;
}
