import { useState } from "react";
import { Link } from "react-router-dom";
import { useCatalogoAbierto } from "../lib/useCatalogoAbierto";
import { useCategorias } from "../lib/useCategorias";
import { useZonas } from "../lib/useZonas";
import CatalogoSimpleManager from "../components/CatalogoSimpleManager";
import ZonasPanel from "../components/ZonasPanel";
import { ApiError } from "../lib/api";
import type { CategoriaProducto } from "../lib/types";

/**
 * Configuración → Catálogos (Prioridad 6, 4-sep-2026): un solo lugar para
 * ver y administrar todos los catálogos abiertos del sistema, en vez de
 * entrar módulo por módulo. Agregar un valor nuevo ("+") se queda
 * funcionando donde ya vivía, en el módulo de uso — aquí solo se edita o
 * se desactiva/reactiva un valor ya existente (exclusivo de Director
 * General/Encargado de Sistemas, reforzado también en el backend).
 * Grupos de Pago (9.11) es más rico que los demás (miembros, sin campo
 * "activo", borrado directo) y ya tiene su propia pantalla completa en
 * Nómina — aquí solo hay un acceso directo, no se duplica su UI.
 */
export default function CatalogosTab() {
  const tiposAplicacion = useCatalogoAbierto("/tipos-aplicacion", true);
  const zonas = useZonas(true);
  const categorias = useCategorias(true);
  const ingredientesActivos = useCatalogoAbierto("/almacen/ingredientes-activos", true);
  const contenedores = useCatalogoAbierto("/almacen/contenedores", true);
  const marcas = useCatalogoAbierto("/almacen/marcas", true);
  const centrosCosto = useCatalogoAbierto("/compras/centros-costo", true);

  return (
    <div>
      <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 18, maxWidth: 640 }}>
        Editar o desactivar/reactivar un valor ya existente de cualquier catálogo abierto del sistema. Agregar uno nuevo se sigue
        haciendo con el botón "+" donde ya vive, dentro del módulo que lo usa (Programar, Comparador, Alta de Producto, etc.).
      </p>

      <CatalogoSimpleManager
        titulo="Tipo de Aplicación (9.7)"
        items={tiposAplicacion.items}
        cargando={tiposAplicacion.cargando}
        editar={tiposAplicacion.editar}
        actualizarActivo={tiposAplicacion.actualizarActivo}
      />

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Zonas y su flete (9.14)</div>
        <ZonasPanel
          zonas={zonas.zonas}
          cargando={zonas.cargando}
          crear={zonas.crear}
          editar={zonas.editar}
          actualizarActivo={zonas.actualizarActivo}
        />
      </div>

      <CategoriasManager categorias={categorias} />

      <CatalogoSimpleManager
        titulo="Ingrediente Activo (9.15)"
        items={ingredientesActivos.items}
        cargando={ingredientesActivos.cargando}
        editar={ingredientesActivos.editar}
        actualizarActivo={ingredientesActivos.actualizarActivo}
      />

      <CatalogoSimpleManager
        titulo="Contenedor (9.15)"
        items={contenedores.items}
        cargando={contenedores.cargando}
        editar={contenedores.editar}
        actualizarActivo={contenedores.actualizarActivo}
      />

      <CatalogoSimpleManager
        titulo="Marca (9.15)"
        items={marcas.items}
        cargando={marcas.cargando}
        editar={marcas.editar}
        actualizarActivo={marcas.actualizarActivo}
      />

      <CatalogoSimpleManager
        titulo="Centros de Costo (Bloque 3)"
        items={centrosCosto.items}
        cargando={centrosCosto.cargando}
        editar={centrosCosto.editar}
        actualizarActivo={centrosCosto.actualizarActivo}
      />

      <div className="card" style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Grupos de Pago / cuadrillas (9.11)</div>
          <div style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>Se administran completos en Nómina — nombre, integrantes, etc.</div>
        </div>
        <Link to="/nomina/grupos" className="btn-secondary">
          Ir a Grupos de Pago →
        </Link>
      </div>
    </div>
  );
}

/** Categoría (Prioridad 3) trae un campo extra ("¿Requiere Ingrediente Activo?") que los demás catálogos simples no tienen. */
function CategoriasManager({
  categorias,
}: {
  categorias: {
    categorias: CategoriaProducto[];
    cargando: boolean;
    editar: (id: string, nombre: string) => Promise<unknown>;
    actualizarActivo: (id: string, activo: boolean) => Promise<unknown>;
    actualizarRequiereIngredienteActivo: (id: string, requiereIngredienteActivo: boolean) => Promise<unknown>;
  };
}) {
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nombreEdit, setNombreEdit] = useState("");
  const [error, setError] = useState<string | null>(null);

  function iniciarEdicion(c: CategoriaProducto) {
    setEditandoId(c.id);
    setNombreEdit(c.nombre);
    setError(null);
  }

  async function guardar(id: string) {
    if (!nombreEdit.trim()) return;
    setError(null);
    try {
      await categorias.editar(id, nombreEdit.trim());
      setEditandoId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar.");
    }
  }

  async function alternarActivo(c: CategoriaProducto) {
    setError(null);
    try {
      await categorias.actualizarActivo(c.id, !c.activo);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cambiar.");
    }
  }

  async function alternarRequiere(c: CategoriaProducto) {
    setError(null);
    try {
      await categorias.actualizarRequiereIngredienteActivo(c.id, !c.requiereIngredienteActivo);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cambiar.");
    }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Categoría de Almacén (9.15)</div>
      {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginBottom: 10 }}>{error}</div>}
      {categorias.cargando ? (
        <p>Cargando…</p>
      ) : categorias.categorias.length === 0 ? (
        <p style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>Sin categorías todavía.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>¿Requiere Ingrediente Activo?</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {categorias.categorias.map((c) => (
              <tr key={c.id}>
                <td>
                  {editandoId === c.id ? (
                    <input value={nombreEdit} onChange={(e) => setNombreEdit(e.target.value)} autoFocus style={{ width: 180 }} />
                  ) : (
                    c.nombre
                  )}
                </td>
                <td>
                  <button className="btn-secondary" onClick={() => alternarRequiere(c)}>
                    {c.requiereIngredienteActivo ? "Sí" : "No"}
                  </button>
                </td>
                <td>
                  <span className={`tag ${c.activo ? "tag-success" : "tag-danger"}`}>{c.activo ? "Activo" : "Inactivo"}</span>
                </td>
                <td style={{ display: "flex", gap: 6 }}>
                  {editandoId === c.id ? (
                    <>
                      <button className="btn-secondary" onClick={() => guardar(c.id)}>
                        Guardar
                      </button>
                      <button className="btn-secondary" onClick={() => setEditandoId(null)}>
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="btn-secondary" onClick={() => iniciarEdicion(c)}>
                        Editar
                      </button>
                      <button className="btn-secondary" onClick={() => alternarActivo(c)}>
                        {c.activo ? "Desactivar" : "Reactivar"}
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
