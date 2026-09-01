import { hoyISO } from "@cbf/shared";
import { prisma } from "./db.js";
import { tienePermiso } from "./permissions.js";
import { solicitudesPendientes } from "./solicitudes.js";
import { listarOrdenes } from "../modules/compras/ordenes.js";
import { listarCxP } from "../modules/compras/cxp.js";
import { listarAplicaciones, listarCancelacionesPendientesConfirmar } from "../modules/aplicaciones/aplicaciones.js";
import { listarCancelacionesPendientesConfirmarGranular, listarGranular } from "../modules/fertilizantes/granular.js";
import { candadosDeHuerta } from "../modules/almacen/almacen-local.js";
import { listarAjustesPendientesConfirmar } from "../modules/almacen/movimientos.js";
import { diasPendientesDeCierre } from "../modules/nomina/cierre.js";
import { estadoRiegoTodasUPs } from "../modules/riego/riego.js";
import type { Rol } from "@prisma/client";

// Firma digital de recepción de cancelaciones (9.7): el documento dice
// "Encargado de Bodega" específicamente — no todo el que tiene permiso de
// "almacen" (ej. Supervisor de Huerta, por su Almacén Local). Mismo criterio
// que ROLES_CONFIRMAR_BODEGA en aplicaciones.routes.ts, confirmado 10-ago-2026.
const ROLES_CONFIRMAR_BODEGA: Rol[] = ["director_general", "encargado_sistemas", "encargado_bodega", "bodeguista"];

// Mismo mapeo que solicitudes.routes.ts — qué módulo gobierna el permiso de autorizar cada tipo.
const MODULO_POR_TIPO_SOLICITUD: Record<string, string> = {
  actividad_alta: "nomina",
  actividad_tarifa: "nomina",
  personal_alta: "rh",
  producto_alta: "almacen",
  producto_regulado_alta: "almacen_regulado",
  orden_compra_manual: "compras",
};

export interface Notificacion {
  id: string;
  tipo: string;
  titulo: string;
  detalle: string;
  urgente: boolean;
  fecha: string;
  enlace: string;
}

/**
 * Notificaciones (bloque 6, antes "Solicitudes"): vista central y filtrada
 * por rol de todo lo pendiente de atención en el sistema — no solo
 * propone/autoriza, también alertas operativas (CxP, vencimientos de 15
 * días, descuadres de Almacén Local, cierres de Nómina pendientes).
 */
export async function obtenerNotificaciones(rol: Rol, huertaIdAlcance: string | null): Promise<Notificacion[]> {
  const notificaciones: Notificacion[] = [];

  // 1) Solicitudes propone/autoriza (mecanismo genérico ya existente).
  const solicitudes = await solicitudesPendientes();
  for (const s of solicitudes) {
    const modulo = MODULO_POR_TIPO_SOLICITUD[s.tipo];
    if (modulo && (await tienePermiso(rol, modulo, "autoriza"))) {
      notificaciones.push({
        id: `solicitud-${s.id}`,
        tipo: "solicitud",
        titulo: "Solicitud pendiente de autorizar",
        detalle: s.tipo,
        urgente: false,
        fecha: s.fechaPropuesta.toISOString(),
        enlace: "/notificaciones",
      });
    }
  }

  // 2) Órdenes de compra manuales pendientes de autorizar.
  if (await tienePermiso(rol, "compras", "autoriza")) {
    const ordenes = await listarOrdenes("pendiente_autorizar");
    for (const o of ordenes) {
      notificaciones.push({
        id: `orden-autorizar-${o.id}`,
        tipo: "orden_pendiente_autorizar",
        titulo: "Orden de compra pendiente de autorizar",
        detalle: `${o.producto.nombreComercial} — ${o.cantidadSolicitada} ${o.producto.unidad}`,
        urgente: false,
        fecha: o.fechaCreacion.toISOString(),
        enlace: `/compras/ordenes?id=${o.id}`,
      });
    }
  }

  // 3) Cuentas por Pagar próximas a vencer.
  if (await tienePermiso(rol, "compras", "ver")) {
    const cxp = await listarCxP();
    for (const c of cxp.filter((c) => c.alertaVisible)) {
      notificaciones.push({
        id: `cxp-${c.id}`,
        tipo: "cxp_proxima",
        titulo: "Cuenta por pagar próxima a vencer",
        detalle: `${c.proveedor.nombre} — ${c.producto.nombreComercial}, vence el viernes ${c.viernesDePago.toISOString().slice(0, 10)}`,
        urgente: true,
        fecha: c.fechaLimitePago.toISOString(),
        enlace: `/compras/cxp?id=${c.id}`,
      });
    }
  }

  // 4) Aplicaciones y Fertilización Granular vencidas (15 días).
  if (await tienePermiso(rol, "aplicaciones", "ver")) {
    const aplicaciones = await listarAplicaciones();
    for (const a of aplicaciones) {
      if (huertaIdAlcance && a.huertaId !== huertaIdAlcance) continue;
      if (a.alertaVencimiento) {
        notificaciones.push({
          id: `aplicacion-vencimiento-${a.id}`,
          tipo: "aplicacion_vencida",
          titulo: "Aplicación con 15+ días sin entregar",
          detalle: `${a.huerta.nombre} — ${a.productos.map((p) => p.producto.nombreComercial).join(" + ")}`,
          urgente: true,
          fecha: a.fechaCreacion.toISOString(),
          enlace: `/aplicaciones?huertaId=${a.huertaId}&id=${a.id}`,
        });
      }
      if (a.alertaPendienteAplicar) {
        notificaciones.push({
          id: `aplicacion-pendiente-${a.id}`,
          tipo: "aplicacion_pendiente",
          titulo: "Aplicación entregada con 15+ días sin terminar",
          detalle: `${a.huerta.nombre} — ${a.productos.map((p) => p.producto.nombreComercial).join(" + ")} (${(a.porcentajeAvance ?? 0).toFixed(0)}% avance)`,
          urgente: true,
          fecha: a.fechaCreacion.toISOString(),
          enlace: `/aplicaciones?huertaId=${a.huertaId}&id=${a.id}`,
        });
      }
    }
  }
  if (await tienePermiso(rol, "fertilizantes", "ver")) {
    const granular = await listarGranular();
    for (const f of granular) {
      if (huertaIdAlcance && f.huertaId !== huertaIdAlcance) continue;
      if (f.alertaVencimiento) {
        notificaciones.push({
          id: `granular-vencimiento-${f.id}`,
          tipo: "fertilizacion_vencida",
          titulo: "Fertilización con 15+ días sin entregar",
          detalle: `${f.huerta.nombre} — ${f.productos.map((p) => p.producto.nombreComercial).join(" + ")}`,
          urgente: true,
          fecha: f.fechaCreacion.toISOString(),
          enlace: `/fertilizantes/granular?huertaId=${f.huertaId}&id=${f.id}`,
        });
      }
      if (f.alertaPendienteAplicar) {
        notificaciones.push({
          id: `granular-pendiente-${f.id}`,
          tipo: "fertilizacion_pendiente",
          titulo: "Fertilización entregada con 15+ días sin terminar",
          detalle: `${f.huerta.nombre} — ${f.productos.map((p) => p.producto.nombreComercial).join(" + ")} (${(f.porcentajeAvance ?? 0).toFixed(0)}% avance)`,
          urgente: true,
          fecha: f.fechaCreacion.toISOString(),
          enlace: `/fertilizantes/granular?huertaId=${f.huertaId}&id=${f.id}`,
        });
      }
    }
  }

  // 5) Descuadres de Almacén Local (15 días).
  if (await tienePermiso(rol, "almacen", "ver")) {
    const huertas = await prisma.huerta.findMany({ where: { activo: true, ...(huertaIdAlcance ? { id: huertaIdAlcance } : {}) } });
    for (const huerta of huertas) {
      const candados = await candadosDeHuerta(huerta.id);
      for (const c of candados.filter((c) => c.alertaActiva)) {
        notificaciones.push({
          id: `descuadre-${huerta.id}-${c.productoId}`,
          tipo: "descuadre_almacen_local",
          titulo: "Descuadre de Almacén Local a 15+ días",
          detalle: `${huerta.nombre} — ${c.nombreComercial}: ${c.saldoSinJustificar.toFixed(2)} sin justificar`,
          urgente: true,
          fecha: new Date().toISOString(),
          enlace: `/almacen/local?huertaId=${huerta.id}&productoId=${c.productoId}`,
        });
      }
    }
  }

  // 6-bis) Cancelaciones/ajustes de dosis de Aplicaciones y Fertilizantes
  // (9.7/9.5, 15-ago-2026) esperando la firma digital de recepción del
  // Encargado de Bodega — Bodega no tiene permiso sobre esos módulos, así
  // que este es el único lugar donde le llega el aviso.
  if (ROLES_CONFIRMAR_BODEGA.includes(rol)) {
    const [cancelacionesAplicaciones, cancelacionesGranular, ajustes] = await Promise.all([
      listarCancelacionesPendientesConfirmar(),
      listarCancelacionesPendientesConfirmarGranular(),
      listarAjustesPendientesConfirmar(),
    ]);
    for (const p of [...cancelacionesAplicaciones, ...cancelacionesGranular, ...ajustes]) {
      const esCancelacion = p.tipo === "cancelacion";
      notificaciones.push({
        id: `${p.tipo}-bodega-${p.id}`,
        tipo: esCancelacion ? "cancelacion_pendiente_bodega" : "ajuste_dosis_pendiente_bodega",
        titulo: esCancelacion ? "Programación cancelada — confirmar recepción en Almacén" : "Ajuste de dosis — confirmar recepción en Almacén",
        detalle: `${p.huerta.nombre} — se regresan ${p.cantidadRegresada} ${p.producto.unidad} de ${p.producto.nombreComercial}`,
        urgente: false,
        fecha: (p.fecha ?? new Date().toISOString()),
        enlace: `/almacen/inventario?id=${p.id}`,
      });
    }
  }

  // 6) Días de Nómina pendientes de cerrar.
  if (await tienePermiso(rol, "nomina", "ver")) {
    const huertas = await prisma.huerta.findMany({ where: { activo: true, ...(huertaIdAlcance ? { id: huertaIdAlcance } : {}) } });
    for (const huerta of huertas) {
      const pendientes = await diasPendientesDeCierre(huerta.id);
      for (const p of pendientes.filter((p) => p.estado !== "al_corriente")) {
        notificaciones.push({
          id: `cierre-pendiente-${huerta.id}-${p.fecha}`,
          tipo: "cierre_pendiente",
          titulo: p.estado === "vencido" ? "Día de Nómina vencido sin cerrar" : "Día de Nómina vence hoy",
          detalle: `${huerta.nombre} — ${p.fecha}`,
          urgente: p.estado === "vencido",
          fecha: p.fecha,
          enlace: `/nomina/cierre?fecha=${p.fecha}&huertaId=${huerta.id}`,
        });
      }
    }
  }

  // 7) Fertirriego programado para hoy y todavía sin registrar en Riego
  // (1.8, 31-ago-2026) — recordatorio diario para quien captura Riego.
  // "Encargado de Riego"/"Encargado del Rancho" no existen como roles en
  // el sistema (auditado contra el enum Rol completo); se usa el permiso
  // real del módulo "riego" en su lugar — hoy lo tienen regador,
  // supervisor_huerta y gerente_tecnico_produccion (más los roles de
  // acceso universal). Si Diego quiere otro conjunto de roles, es un
  // cambio de una línea aquí, no una migración.
  if (await tienePermiso(rol, "riego", "ver")) {
    const hoy = hoyISO();
    const huertasConSecciones = await estadoRiegoTodasUPs(hoy, huertaIdAlcance ?? undefined);
    for (const { huerta, secciones } of huertasConSecciones) {
      for (const { seccion, registro, fertirriegoActivo } of secciones) {
        if (fertirriegoActivo && !registro) {
          notificaciones.push({
            id: `riego-pendiente-${seccion.id}-${hoy}`,
            tipo: "riego_pendiente",
            titulo: "Fertirriego programado hoy sin registrar",
            detalle: `${huerta.nombre} — ${seccion.nombre}: ${fertirriegoActivo.productos.map((p) => p.nombreComercial).join(" + ")}`,
            urgente: false,
            fecha: hoy,
            enlace: `/riego?fecha=${hoy}&huertaId=${huerta.id}`,
          });
        }
      }
    }
  }

  return notificaciones.sort((a, b) => Number(b.urgente) - Number(a.urgente) || a.fecha.localeCompare(b.fecha));
}
