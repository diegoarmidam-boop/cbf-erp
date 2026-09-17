import { useEffect, useState } from "react";
import { api, ApiError, getToken } from "../../lib/api";
import type {
  FilaComparativoGeneral,
  GrupoPendienteProgramacion,
  HistoricoProveedor,
  LineaOrigenNecesidad,
  OrdenCompra,
  PendienteIngredienteActivo,
  ResumenProveedorActivo,
  VistaPreviaProveedor,
} from "../../lib/types";
import { formatearDinero, formatearNumero } from "../../lib/numero";
import { formatearFecha, formatearInstante } from "../../lib/fecha";

type ModoEntrada = "" | "proveedor" | "programacion" | "producto" | "comparativo";

interface Asignacion {
  cotizacionId: string;
  cantidad: number;
  // De qué Proveedor/tarjeta vino esta asignación (4.3, V35) — para poder
  // avisar "Ya cubierto con [Proveedor]" cuando la MISMA necesidad aparece
  // cotizada por más de un Proveedor y ya se eligió uno.
  proveedorId: string;
  proveedorNombre: string;
}

/**
 * Pestaña "Órdenes de Compra" (3-sep-2026, Prioridad 1) — el único lugar
 * donde de verdad se arma y genera una orden de compra real. 3 formas de
 * entrada (Por Proveedor / Por Solicitud [= por Programación completa,
 * decisión de Diego 3-sep-2026, renombrada de "Por Orden" en la fusión de
 * terminología V35] / Por Producto), agrupación automática por Proveedor
 * resultante con vista previa, y tope estricto de Cantidad disponible del
 * Proveedor (sin repartir automático).
 *
 * "Por Proveedor" (4.1, V35, 17-sep-2026): ya no es un selector — se
 * muestran tarjetas apiladas, una por Proveedor con cotizaciones activas,
 * y las asignaciones se conservan al expandir/cerrar distintas tarjetas
 * (antes `cargarPorProveedor` las borraba cada vez que cambiabas de
 * Proveedor) — eso es justo lo que permite avisar en tiempo real si el
 * mismo Ingrediente Activo ya quedó cubierto con otro Proveedor en la
 * misma sesión (4.3, el bug real de la compra doble de Diego).
 */
export default function OrdenesDeCompra({ ordenCompraIdInicial }: { ordenCompraIdInicial?: string | null }) {
  const [modo, setModo] = useState<ModoEntrada>("");
  const [error, setError] = useState<string | null>(null);

  // "Por Proveedor" (4.1) — tarjetas, no selector: resumen de todos los
  // Proveedores con cotizaciones activas, expandibles una o varias a la
  // vez; las líneas de cada uno se cargan solas (lazy) al expandir.
  const [resumenProveedores, setResumenProveedores] = useState<ResumenProveedorActivo[]>([]);
  const [proveedoresExpandidos, setProveedoresExpandidos] = useState<Set<string>>(new Set());
  const [lineasPorProveedor, setLineasPorProveedor] = useState<Record<string, LineaOrigenNecesidad[]>>({});
  const [cargandoProveedorId, setCargandoProveedorId] = useState<string | null>(null);
  // Histórico (4.4) — aparte de la vista activa, se abre desde la misma tarjeta.
  const [historicoProveedorId, setHistoricoProveedorId] = useState<string | null>(null);
  const [historicoData, setHistoricoData] = useState<HistoricoProveedor | null>(null);
  const [cargandoHistorico, setCargandoHistorico] = useState(false);

  // "Por Solicitud" y "Por Producto" — sin cambio de mecánica, solo de nombre.
  const [lineas, setLineas] = useState<LineaOrigenNecesidad[]>([]);
  const [cargandoLineas, setCargandoLineas] = useState(false);
  const [gruposProgramacion, setGruposProgramacion] = useState<GrupoPendienteProgramacion[]>([]);
  const [gruposProducto, setGruposProducto] = useState<PendienteIngredienteActivo[]>([]);
  const [objetivoProgramacion, setObjetivoProgramacion] = useState<GrupoPendienteProgramacion | null>(null);
  const [objetivoProducto, setObjetivoProducto] = useState<PendienteIngredienteActivo | null>(null);

  // "Comparativo General" (6, V35, 17-sep-2026) — 4ª forma de entrada.
  const [comparativoGeneral, setComparativoGeneral] = useState<FilaComparativoGeneral[]>([]);
  const [cargandoComparativo, setCargandoComparativo] = useState(false);
  // Cambio manual de Proveedor por fila (6.2) — el sistema sugiere Mejor
  // Global por default; Diego puede cambiarlo a mano a cualquier otro
  // Proveedor cotizado, sin que el sistema calcule ninguna combinación
  // óptima automática.
  const [proveedorPorFila, setProveedorPorFila] = useState<Record<string, string>>({});
  const [armandoDesdeComparativo, setArmandoDesdeComparativo] = useState(false);

  // Asignación: por necesidad (ordenCompraId), qué cotización y cuánto —
  // GLOBAL, compartida entre las 3 formas de entrada; en "Por Proveedor" ya
  // no se limpia al expandir/cerrar tarjetas (ver comentario arriba).
  const [asignaciones, setAsignaciones] = useState<Record<string, Asignacion>>({});

  const [vistaPrevia, setVistaPrevia] = useState<VistaPreviaProveedor[] | null>(null);
  const [cargandoPreview, setCargandoPreview] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);
  // Prioridad 7.6 (4-sep-2026): el PDF se descarga directo aquí mismo, sin
  // tener que ir a buscarlo a "En Camino" reabriendo la cotización.
  const [ordenesGeneradas, setOrdenesGeneradas] = useState<OrdenCompra[]>([]);

  function cargarResumenProveedores() {
    api.get<ResumenProveedorActivo[]>("/compras/ordenes-generacion/resumen-proveedores").then(setResumenProveedores);
  }

  useEffect(() => {
    cargarResumenProveedores();
    api.get<GrupoPendienteProgramacion[]>("/compras/ordenes/pendientes-por-programacion").then(setGruposProgramacion);
    api.get<PendienteIngredienteActivo[]>("/compras/ordenes/pendientes-por-ingrediente-activo").then(setGruposProducto);
  }, []);

  // Ruta rápida (1.1) — llegando desde "Cotizar"/"Generar orden de compra"
  // en Pendientes: ?ordenCompraId= resuelve automáticamente a qué
  // programación (o solicitud manual) pertenece y entra directo en modo
  // "Por Solicitud", sin que el usuario tenga que volver a buscarla.
  useEffect(() => {
    if (!ordenCompraIdInicial || gruposProgramacion.length === 0) return;
    const grupo = gruposProgramacion.find((g) => g.lineas.some((l) => l.ordenId === ordenCompraIdInicial));
    if (grupo) {
      // Bug real (Prioridad 5, 4-sep-2026): esto solo ponía el estado de
      // "cuál programación" pero nunca disparaba la carga real de líneas
      // (`cargarPorProgramacion` sí la hace) — por eso la primera vez
      // decía "Sin necesidades pendientes cotizadas" (era cierto que
      // `lineas` seguía vacío, solo que nunca se había pedido). Cambiar de
      // pestaña y regresar "arreglaba" el síntoma porque reiniciaba el
      // estado y forzaba a elegir la tarjeta de nuevo, que sí llama a
      // cargarPorProgramacion.
      setModo("programacion");
      cargarPorProgramacion(grupo);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordenCompraIdInicial, gruposProgramacion]);

  function limpiarSeleccion() {
    setLineas([]);
    setAsignaciones({});
    setVistaPrevia(null);
    setMensajeExito(null);
    setError(null);
  }

  function cambiarModo(m: ModoEntrada) {
    setModo(m);
    setProveedoresExpandidos(new Set());
    setLineasPorProveedor({});
    setHistoricoProveedorId(null);
    setObjetivoProgramacion(null);
    setObjetivoProducto(null);
    limpiarSeleccion();
    if (m === "comparativo" && comparativoGeneral.length === 0) cargarComparativoGeneral();
  }

  function cargarComparativoGeneral() {
    setCargandoComparativo(true);
    api
      .get<FilaComparativoGeneral[]>("/compras/ordenes/comparativo-general")
      .then(setComparativoGeneral)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar."))
      .finally(() => setCargandoComparativo(false));
  }

  // Proveedor elegido para una fila (6.2) — Mejor Global por default,
  // editable a mano a cualquier otro Proveedor cotizado.
  function proveedorElegidoDe(fila: FilaComparativoGeneral): string {
    return proveedorPorFila[fila.ingredienteActivo] ?? fila.proveedores[0]?.proveedorId ?? "";
  }

  const totalGeneralComparativo = comparativoGeneral.reduce((s, f) => {
    const elegidoId = proveedorElegidoDe(f);
    const elegido = f.proveedores.find((p) => p.proveedorId === elegidoId);
    return s + (elegido?.totalConFlete ?? 0);
  }, 0);

  // Salto directo a Órdenes de Compra (6.3) — con la selección ya armada
  // (sugerida o ajustada a mano), arma las asignaciones reales consultando
  // "Por Producto" de cada Ingrediente Activo elegido (misma fuente que ya
  // usa esa forma de entrada) y salta directo a la vista previa — sin volver
  // a capturar nada. No reemplaza las otras 3 formas de entrada.
  async function irAGenerarDesdeComparativo() {
    setError(null);
    setArmandoDesdeComparativo(true);
    try {
      const nuevasAsignaciones: Record<string, Asignacion> = {};
      for (const fila of comparativoGeneral) {
        const proveedorId = proveedorElegidoDe(fila);
        if (!proveedorId) continue;
        const proveedorNombre = fila.proveedores.find((p) => p.proveedorId === proveedorId)?.proveedorNombre ?? "";
        const lineasFila = await api.get<LineaOrigenNecesidad[]>(`/compras/ordenes-generacion/por-producto/${encodeURIComponent(fila.ingredienteActivo)}`);
        for (const l of lineasFila) {
          const cot = l.cotizaciones.find((c) => c.proveedorId === proveedorId);
          if (!cot) continue; // este Proveedor no cotizó esta necesidad específica -- se deja pendiente, no se inventa
          const presentacion = cot.presentacionCantidad || 1;
          const unidades = Math.ceil(l.cantidadPendiente / presentacion);
          nuevasAsignaciones[l.ordenCompraId] = { cotizacionId: cot.cotizacionId, cantidad: unidades * presentacion, proveedorId, proveedorNombre };
        }
      }
      setAsignaciones(nuevasAsignaciones);
      if (Object.keys(nuevasAsignaciones).length > 0) {
        const preview = await api.post<VistaPreviaProveedor[]>("/compras/ordenes-generacion/vista-previa", {
          asignaciones: Object.entries(nuevasAsignaciones).map(([ordenCompraId, a]) => ({ ordenCompraId, cotizacionId: a.cotizacionId, cantidad: a.cantidad })),
        });
        setVistaPrevia(preview);
      } else {
        setError("Ninguna de las Solicitudes pendientes tiene cotización de los Proveedores elegidos.");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo armar la selección.");
    } finally {
      setArmandoDesdeComparativo(false);
    }
  }

  // "Por Proveedor" (4.1) — expandir/cerrar una tarjeta NO limpia las
  // asignaciones de las demás (a diferencia del selector viejo, que las
  // borraba al cambiar de Proveedor) — es justo lo que permite detectar
  // que el mismo Ingrediente Activo ya se eligió con otro Proveedor.
  function alternarProveedorExpandido(proveedorId: string) {
    setProveedoresExpandidos((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(proveedorId)) {
        siguiente.delete(proveedorId);
      } else {
        siguiente.add(proveedorId);
        if (!lineasPorProveedor[proveedorId]) {
          setCargandoProveedorId(proveedorId);
          api
            .get<LineaOrigenNecesidad[]>(`/compras/ordenes-generacion/por-proveedor/${proveedorId}`)
            .then((data) => setLineasPorProveedor((p) => ({ ...p, [proveedorId]: data })))
            .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar."))
            .finally(() => setCargandoProveedorId(null));
        }
      }
      return siguiente;
    });
  }

  function abrirHistorico(proveedorId: string) {
    setHistoricoProveedorId(proveedorId);
    setHistoricoData(null);
    setCargandoHistorico(true);
    api
      .get<HistoricoProveedor>(`/compras/proveedores/${proveedorId}/historico`)
      .then(setHistoricoData)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar el histórico."))
      .finally(() => setCargandoHistorico(false));
  }

  function cargarPorProgramacion(grupo: GrupoPendienteProgramacion) {
    setObjetivoProgramacion(grupo);
    limpiarSeleccion();
    setCargandoLineas(true);
    const params =
      grupo.tipo === "manual" ? `ordenCompraIdManual=${grupo.lineas[0]?.ordenId}` : `referenciaAplicacionId=${grupo.referenciaId}`;
    api
      .get<LineaOrigenNecesidad[]>(`/compras/ordenes-generacion/por-programacion?${params}`)
      .then(setLineas)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar."))
      .finally(() => setCargandoLineas(false));
  }

  function cargarPorProducto(grupo: PendienteIngredienteActivo) {
    setObjetivoProducto(grupo);
    limpiarSeleccion();
    setCargandoLineas(true);
    api
      .get<LineaOrigenNecesidad[]>(`/compras/ordenes-generacion/por-producto/${encodeURIComponent(grupo.ingredienteActivo)}`)
      .then(setLineas)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar."))
      .finally(() => setCargandoLineas(false));
  }

  function asignar(necesidad: LineaOrigenNecesidad, cotizacionId: string) {
    setVistaPrevia(null);
    setMensajeExito(null);
    if (!cotizacionId) {
      setAsignaciones((prev) => {
        const siguiente = { ...prev };
        delete siguiente[necesidad.ordenCompraId];
        return siguiente;
      });
      return;
    }
    // Precarga redondeada a presentación completa (Prioridad 1, 4-sep-2026)
    // — antes precargaba el pendiente crudo (bug real: Folio 23, 0.2 L en
    // vez del bulto completo de 25 L). Mismo redondeo que ya usa el
    // Comparador (Math.ceil a presentaciones completas), aquí sobre lo que
    // de verdad se está asignando ahora (cantidadPendiente puede ya
    // reflejar compras parciales previas). Sigue siendo editable a mano.
    const cotizacion = necesidad.cotizaciones.find((c) => c.cotizacionId === cotizacionId);
    const presentacion = cotizacion?.presentacionCantidad || 1;
    const unidades = Math.ceil(necesidad.cantidadPendiente / presentacion);
    const cantidad = unidades * presentacion;
    setAsignaciones((prev) => ({
      ...prev,
      [necesidad.ordenCompraId]: { cotizacionId, cantidad, proveedorId: cotizacion?.proveedorId ?? "", proveedorNombre: cotizacion?.proveedorNombre ?? "" },
    }));
  }

  function cambiarCantidad(ordenCompraId: string, cantidad: number) {
    setVistaPrevia(null);
    setMensajeExito(null);
    setAsignaciones((prev) => (prev[ordenCompraId] ? { ...prev, [ordenCompraId]: { ...prev[ordenCompraId]!, cantidad } } : prev));
  }

  const asignacionesArray = Object.entries(asignaciones).map(([ordenCompraId, a]) => ({
    ordenCompraId,
    cotizacionId: a.cotizacionId,
    cantidad: a.cantidad,
  }));

  async function verVistaPrevia() {
    setError(null);
    setCargandoPreview(true);
    try {
      const preview = await api.post<VistaPreviaProveedor[]>("/compras/ordenes-generacion/vista-previa", { asignaciones: asignacionesArray });
      setVistaPrevia(preview);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo calcular la vista previa.");
      setVistaPrevia(null);
    } finally {
      setCargandoPreview(false);
    }
  }

  function descargarPdf(id: string, numero: number | null) {
    const token = getToken();
    fetch(`${api.apiUrl}/compras/ordenes/${id}/orden-compra.pdf`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `orden-compra-${numero ?? id}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      });
  }

  async function generar() {
    setError(null);
    setGenerando(true);
    try {
      const ordenes = await api.post<OrdenCompra[]>("/compras/ordenes-generacion/generar", { asignaciones: asignacionesArray });
      setOrdenesGeneradas(ordenes);
      setMensajeExito(
        `Orden generada: ${vistaPrevia?.length ?? 0} orden${vistaPrevia && vistaPrevia.length !== 1 ? "es" : ""} de compra (una por Proveedor) — descarga el PDF abajo.`
      );
      setAsignaciones({});
      setVistaPrevia(null);
      // Recarga la selección actual — lo ya cubierto desaparece (4.2).
      if (modo === "proveedor") {
        cargarResumenProveedores();
        for (const proveedorId of proveedoresExpandidos) {
          api.get<LineaOrigenNecesidad[]>(`/compras/ordenes-generacion/por-proveedor/${proveedorId}`).then((data) => setLineasPorProveedor((p) => ({ ...p, [proveedorId]: data })));
        }
      } else if (modo === "programacion" && objetivoProgramacion) cargarPorProgramacion(objetivoProgramacion);
      else if (modo === "producto" && objetivoProducto) cargarPorProducto(objetivoProducto);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo generar.");
    } finally {
      setGenerando(false);
    }
  }

  // Alerta de duplicado (4.3) — la MISMA necesidad ya asignada a otro
  // Proveedor (siempre posible en "Por Proveedor", donde una necesidad
  // puede aparecer cotizada por varios), O el mismo Ingrediente Activo ya
  // cubierto por una necesidad DISTINTA en otro Proveedor dentro de esta
  // misma sesión sin confirmar — mismo criterio pedido para "Por Producto".
  function duplicadoDe(l: LineaOrigenNecesidad, proveedorIdTarjeta?: string): string | null {
    const propia = asignaciones[l.ordenCompraId];
    if (propia && proveedorIdTarjeta && propia.proveedorId !== proveedorIdTarjeta) return propia.proveedorNombre;
    if (!l.ingredienteActivo) return null;
    for (const [ordenCompraId, a] of Object.entries(asignaciones)) {
      if (ordenCompraId === l.ordenCompraId) continue;
      const otra = [...lineas, ...Object.values(lineasPorProveedor).flat()].find((x) => x.ordenCompraId === ordenCompraId);
      if (otra && otra.ingredienteActivo === l.ingredienteActivo && (!proveedorIdTarjeta || a.proveedorId !== proveedorIdTarjeta)) {
        return a.proveedorNombre;
      }
    }
    return null;
  }

  function renderLinea(l: LineaOrigenNecesidad, proveedorIdTarjeta?: string) {
    const asignacion = asignaciones[l.ordenCompraId];
    const yaCubiertoCon = duplicadoDe(l, proveedorIdTarjeta);
    return (
      <div key={l.ordenCompraId} className="card">
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>{l.nombreComercial}</div>
            <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              {l.origenLabel} · {l.fecha && formatearFecha(l.fecha)} · Pendiente: {formatearNumero(l.cantidadPendiente)} {l.unidad}
            </div>
          </div>
          {yaCubiertoCon && (
            <span className="tag tag-danger" style={{ alignSelf: "flex-start" }}>
              Ya cubierto con {yaCubiertoCon}
            </span>
          )}
        </div>
        {l.cotizaciones.length === 0 ? (
          <p style={{ fontSize: 12, color: "var(--ink-soft)" }}>Sin cotizaciones capturadas todavía para este producto.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>Proveedor</th>
                  <th>Marca</th>
                  <th>Presentación</th>
                  <th>Precio/unidad</th>
                  <th>Disponible</th>
                  <th>Ya usado</th>
                </tr>
              </thead>
              <tbody>
                {l.cotizaciones.map((c) => (
                  <tr key={c.cotizacionId} style={asignacion?.cotizacionId === c.cotizacionId ? { background: "var(--pink-soft, #fdeef1)" } : undefined}>
                    <td>
                      <input
                        type="radio"
                        name={`cot-${l.ordenCompraId}`}
                        checked={asignacion?.cotizacionId === c.cotizacionId}
                        onChange={() => asignar(l, c.cotizacionId)}
                      />
                    </td>
                    <td>
                      {c.proveedorNombre}
                      {c.esPreferido && <span className="tag tag-success" style={{ marginLeft: 6 }}>Preferido</span>}
                      {c.esSustituto && <span className="tag tag-neutral" style={{ marginLeft: 6 }}>Sustituto</span>}
                      {c.esMejorGlobal && (
                        <span className="tag tag-success" style={{ marginLeft: 6 }}>
                          Mejor Global
                        </span>
                      )}
                      {c.esMejorLocal && !c.esMejorGlobal && (
                        <span className="tag tag-success" style={{ marginLeft: 6 }}>
                          Mejor Local
                        </span>
                      )}
                      {c.esMejorGlobal && (
                        <div style={{ fontSize: 10.5, color: "var(--pink)", fontWeight: 600 }}>(mejor precio)</div>
                      )}
                    </td>
                    <td>{c.nombreComercial}</td>
                    <td>{formatearNumero(c.presentacionCantidad)} {l.unidad}</td>
                    <td>{formatearDinero(c.precioUnitarioMXN)}</td>
                    <td>{c.cantidadDisponibleTotal ? <span className="tag tag-neutral">Toda</span> : formatearNumero(c.cantidadDisponible ?? 0)}</td>
                    <td>{formatearNumero(c.cantidadYaUsada)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {asignacion && (
          <label className="field" style={{ maxWidth: 200, marginTop: 8 }}>
            Cantidad a comprarle a este Proveedor ({l.unidad})
            <input
              type="number"
              min={0.001}
              step="0.001"
              value={asignacion.cantidad}
              onChange={(e) => cambiarCantidad(l.ordenCompraId, Number(e.target.value))}
            />
          </label>
        )}
      </div>
    );
  }

  return (
    <div>
      <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 14 }}>
        El único lugar donde de verdad se arma y genera una orden de compra real, a partir de necesidades ya cotizadas. Asigna
        Proveedor producto por producto — si varias líneas terminan en el mismo Proveedor, se agrupan solas en una sola orden/PDF.
      </p>

      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        <button className={modo === "proveedor" ? "btn-primary" : "btn-secondary"} onClick={() => cambiarModo("proveedor")}>
          Por Proveedor
        </button>
        <button className={modo === "programacion" ? "btn-primary" : "btn-secondary"} onClick={() => cambiarModo("programacion")}>
          Por Solicitud
        </button>
        <button className={modo === "producto" ? "btn-primary" : "btn-secondary"} onClick={() => cambiarModo("producto")}>
          Por Producto
        </button>
        <button className={modo === "comparativo" ? "btn-primary" : "btn-secondary"} onClick={() => cambiarModo("comparativo")}>
          Comparativo General
        </button>
      </div>

      {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>{error}</div>}
      {mensajeExito && (
        <div className="card" style={{ marginBottom: 12, borderColor: "var(--success, #2e7d32)" }}>
          <div className="tag tag-success" style={{ display: "block", padding: "8px 12px", marginBottom: ordenesGeneradas.length > 0 ? 10 : 0 }}>
            {mensajeExito}
          </div>
          {ordenesGeneradas.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[...new Map(ordenesGeneradas.map((o) => [o.numero ?? o.id, o])).values()].map((o) => (
                <button key={o.id} className="btn-secondary" onClick={() => descargarPdf(o.id, o.numero)}>
                  Descargar PDF {o.numero != null ? `— Folio ${o.numero}` : ""}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {modo === "proveedor" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
          <p style={{ fontSize: 12, color: "var(--ink-soft)" }}>
            Una tarjeta por Proveedor con al menos una cotización activa — sin buscarlo ni elegirlo de una lista. Haz clic para
            expandir y asignar.
          </p>
          {resumenProveedores.map((p) => {
            const expandida = proveedoresExpandidos.has(p.proveedorId);
            const lineasProveedor = lineasPorProveedor[p.proveedorId] ?? [];
            return (
              <div key={p.proveedorId} className="card">
                <div
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, cursor: "pointer" }}
                  onClick={() => alternarProveedorExpandido(p.proveedorId)}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{p.proveedorNombre}</div>
                    <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                      {p.cotizacionesActivas} cotización{p.cotizacionesActivas !== 1 ? "es" : ""} activa{p.cotizacionesActivas !== 1 ? "s" : ""}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>Sin flete: {formatearDinero(p.totalSinFlete)}</div>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>Con flete: {formatearDinero(p.totalConFlete)}</div>
                  </div>
                </div>
                {expandida && (
                  <div style={{ marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                    <button
                      className="btn-secondary"
                      style={{ marginBottom: 10 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        abrirHistorico(p.proveedorId);
                      }}
                    >
                      Ver histórico con este Proveedor
                    </button>
                    {cargandoProveedorId === p.proveedorId ? (
                      <p>Cargando…</p>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {lineasProveedor.map((l) => renderLinea(l, p.proveedorId))}
                        {lineasProveedor.length === 0 && <p style={{ color: "var(--ink-soft)" }}>Sin líneas para este Proveedor.</p>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {resumenProveedores.length === 0 && <p style={{ color: "var(--ink-soft)" }}>Sin Proveedores con cotizaciones activas.</p>}
        </div>
      )}

      {historicoProveedorId && (
        <div className="card" style={{ marginBottom: 16, background: "var(--surface-soft, #fafafa)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>
              Histórico — {resumenProveedores.find((p) => p.proveedorId === historicoProveedorId)?.proveedorNombre}
            </div>
            <button className="btn-secondary" onClick={() => setHistoricoProveedorId(null)}>
              Cerrar
            </button>
          </div>
          {cargandoHistorico ? (
            <p>Cargando…</p>
          ) : (
            <>
              <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>Compras ya formalizadas</div>
              {historicoData && historicoData.compras.length > 0 ? (
                <table style={{ marginBottom: 14 }}>
                  <thead>
                    <tr>
                      <th>Folio</th>
                      <th>Producto</th>
                      <th>Cantidad</th>
                      <th>Precio/unidad</th>
                      <th>Fecha</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historicoData.compras.map((c) => (
                      <tr key={c.id}>
                        <td>{c.numero ?? "—"}</td>
                        <td>{c.nombreComercial}</td>
                        <td>{formatearNumero(c.cantidadSolicitada)} {c.unidad}</td>
                        <td>{c.precioUnitario != null ? formatearDinero(c.precioUnitario) : "—"}</td>
                        <td>{c.fecha ? formatearFecha(c.fecha) : "—"}</td>
                        <td>{c.estado}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 14 }}>Sin compras formalizadas todavía con este Proveedor.</p>
              )}
              <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>Historial de cotizaciones</div>
              {historicoData && historicoData.cotizaciones.length > 0 ? (
                <table>
                  <thead>
                    <tr>
                      <th>Ingrediente Activo</th>
                      <th>Producto Comercial</th>
                      <th>Precio</th>
                      <th>Presentación</th>
                      <th>Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historicoData.cotizaciones.map((c) => (
                      <tr key={c.id}>
                        <td>{c.ingredienteActivo ?? "—"}</td>
                        <td>{c.nombreComercial}</td>
                        <td>{formatearDinero(c.precioValor)} {c.moneda}</td>
                        <td>{formatearNumero(c.presentacionCantidad)} ({c.contenedor})</td>
                        <td>{formatearInstante(c.fecha)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{ fontSize: 12, color: "var(--ink-soft)" }}>Sin cotizaciones capturadas con este Proveedor.</p>
              )}
            </>
          )}
        </div>
      )}

      {modo === "programacion" && !objetivoProgramacion && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          <p style={{ fontSize: 12, color: "var(--ink-soft)" }}>Elige la programación (o solicitud manual) que quieres armar:</p>
          {gruposProgramacion.map((g) => (
            <button key={g.clave} className="card" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => cargarPorProgramacion(g)}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>
                {TIPO_LABEL[g.tipo] ?? g.tipo}
                {g.huertaNombre && ` — ${g.huertaNombre}`}
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                {g.lineas.length} producto{g.lineas.length !== 1 ? "s" : ""} · {formatearFecha(g.fecha)}
              </div>
            </button>
          ))}
          {gruposProgramacion.length === 0 && <p style={{ color: "var(--ink-soft)" }}>Sin programaciones pendientes.</p>}
        </div>
      )}
      {modo === "programacion" && objetivoProgramacion && (
        <div style={{ marginBottom: 16 }}>
          <button className="btn-secondary" onClick={() => { setObjetivoProgramacion(null); limpiarSeleccion(); }}>
            ← Elegir otra programación
          </button>
          <div style={{ fontWeight: 700, fontSize: 13, marginTop: 8 }}>
            {TIPO_LABEL[objetivoProgramacion.tipo] ?? objetivoProgramacion.tipo}
            {objetivoProgramacion.huertaNombre && ` — ${objetivoProgramacion.huertaNombre}`}
          </div>
        </div>
      )}

      {modo === "producto" && !objetivoProducto && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          <p style={{ fontSize: 12, color: "var(--ink-soft)" }}>Elige el producto/Ingrediente Activo:</p>
          {gruposProducto.map((g) => (
            <button key={g.ingredienteActivo} className="card" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => cargarPorProducto(g)}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{g.ingredienteActivo}</div>
              <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                {formatearNumero(g.cantidadPendiente)} {g.unidad} pendientes entre {g.ordenes.length} orden{g.ordenes.length !== 1 ? "es" : ""}
              </div>
            </button>
          ))}
          {gruposProducto.length === 0 && <p style={{ color: "var(--ink-soft)" }}>Sin productos pendientes.</p>}
        </div>
      )}
      {modo === "producto" && objetivoProducto && (
        <div style={{ marginBottom: 16 }}>
          <button className="btn-secondary" onClick={() => { setObjetivoProducto(null); limpiarSeleccion(); }}>
            ← Elegir otro producto
          </button>
          <div style={{ fontWeight: 700, fontSize: 13, marginTop: 8 }}>{objetivoProducto.ingredienteActivo}</div>
        </div>
      )}

      {modo === "comparativo" && (
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 10 }}>
            Todos los productos con cotizaciones abiertas en una sola tabla — mismo motor de cálculo del Comparador, solo junto.
            El sistema sugiere Mejor Global por fila; puedes cambiarlo a mano (ej. para consolidar varios productos con un mismo
            Proveedor y ahorrar flete combinando envío) — no se calcula ninguna combinación óptima automática.
          </p>
          {cargandoComparativo ? (
            <p>Cargando…</p>
          ) : comparativoGeneral.length === 0 ? (
            <p style={{ color: "var(--ink-soft)" }}>Sin productos con cotizaciones abiertas.</p>
          ) : (
            <>
              <div style={{ overflowX: "auto" }}>
                <table>
                  <thead>
                    <tr>
                      <th>Ingrediente Activo</th>
                      <th>Pendiente</th>
                      <th>Mejor Global</th>
                      <th>Mejor Local</th>
                      <th>Ahorro</th>
                      <th>Proveedor a usar</th>
                      <th>Total con flete</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparativoGeneral.map((f) => {
                      const mejorGlobal = f.proveedores[0];
                      const mejorLocal = f.proveedores.find((p) => p.proveedorId === f.mejorLocalId);
                      const elegidoId = proveedorElegidoDe(f);
                      const elegido = f.proveedores.find((p) => p.proveedorId === elegidoId);
                      return (
                        <tr key={f.ingredienteActivo}>
                          <td>{f.ingredienteActivo}</td>
                          <td>{formatearNumero(f.cantidadPendiente)} {f.unidad}</td>
                          <td>{mejorGlobal ? `${mejorGlobal.proveedorNombre} — ${formatearDinero(mejorGlobal.totalConFlete)}` : "—"}</td>
                          <td>{mejorLocal ? `${mejorLocal.proveedorNombre} — ${formatearDinero(mejorLocal.totalConFlete)}` : "—"}</td>
                          <td>
                            {f.ahorroForaneo ? `${formatearDinero(f.ahorroForaneo.monto)} (${f.ahorroForaneo.porcentaje.toFixed(1)}%)` : "—"}
                          </td>
                          <td>
                            <select
                              value={elegidoId}
                              onChange={(e) => setProveedorPorFila((prev) => ({ ...prev, [f.ingredienteActivo]: e.target.value }))}
                            >
                              {f.proveedores.map((p) => (
                                <option key={p.proveedorId} value={p.proveedorId}>
                                  {p.proveedorNombre}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td style={{ fontWeight: 700 }}>{elegido ? formatearDinero(elegido.totalConFlete) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={6} style={{ textAlign: "right", fontWeight: 700 }}>
                        Total general (según Proveedor elegido por fila):
                      </td>
                      <td style={{ fontWeight: 700 }}>{formatearDinero(totalGeneralComparativo)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <button className="btn-primary" style={{ marginTop: 12 }} onClick={irAGenerarDesdeComparativo} disabled={armandoDesdeComparativo}>
                {armandoDesdeComparativo ? "Armando…" : "Ir a generar Órdenes de Compra con esta selección"}
              </button>
            </>
          )}
        </div>
      )}

      {(modo === "programacion" || modo === "producto") && (
        <>
          {cargandoLineas && <p>Cargando…</p>}

          {!cargandoLineas && lineas.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>{lineas.map((l) => renderLinea(l))}</div>
          )}

          {!cargandoLineas && lineas.length === 0 && !error && (objetivoProgramacion || objetivoProducto) && (
            <p style={{ color: "var(--ink-soft)" }}>Sin necesidades pendientes cotizadas en esta selección.</p>
          )}
        </>
      )}

      {asignacionesArray.length > 0 && !vistaPrevia && (
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <button className="btn-secondary" onClick={verVistaPrevia} disabled={cargandoPreview}>
            {cargandoPreview ? "Calculando…" : `Ver vista previa (${asignacionesArray.length} línea${asignacionesArray.length !== 1 ? "s" : ""} asignada${asignacionesArray.length !== 1 ? "s" : ""})`}
          </button>
        </div>
      )}

      {vistaPrevia && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>
            Esto va a generar {vistaPrevia.length} orden{vistaPrevia.length !== 1 ? "es" : ""} de compra:
          </div>
          {vistaPrevia.map((g) => (
            <div key={g.proveedorId} style={{ marginBottom: 10 }}>
              <div style={{ fontWeight: 600, fontSize: 12.5 }}>{g.proveedorNombre}</div>
              <ul style={{ margin: "4px 0", paddingLeft: 18, fontSize: 12 }}>
                {g.lineas.map((l) => (
                  <li key={l.productoId}>
                    {l.nombreComercial} — {formatearNumero(l.cantidad)} {l.unidad} · {formatearDinero(l.importe)}
                  </li>
                ))}
              </ul>
              <div style={{ fontSize: 12, fontWeight: 700 }}>Total: {formatearDinero(g.total)}</div>
            </div>
          ))}
          <button className="btn-primary" onClick={generar} disabled={generando}>
            {generando ? "Generando…" : "Generar"}
          </button>
        </div>
      )}
    </div>
  );
}

const TIPO_LABEL: Record<string, string> = {
  aplicacion: "Aplicación",
  granular: "Fertilización Granular",
  fertirriego: "Fertirriego",
  manual: "Solicitud manual",
  desconocido: "Programación",
};
