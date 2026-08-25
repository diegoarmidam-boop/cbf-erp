import type { MezclaTanqueProducto } from "../lib/types";

interface ProductoNombre {
  productoId: string;
  nombreComercial: string;
  concentracionUnidad: "ml_l" | "g_l" | "kg_l";
}

// Formato práctico (bloque nuevo, 20-ago-2026): quien prepara el tanque no
// debe hacer ningún cálculo — nunca "0.0012 kg" cuando lo natural es "1.2
// g". Espejo en el frontend del mismo criterio que shared/aplicaciones/
// calculo.ts (formatearCantidadProducto) — se duplica aquí porque es
// puramente de presentación (no toca ningún cálculo de negocio) y evita
// tener que exponer @cbf/shared completo al bundle del navegador.
function formatearCantidad(unidadConcentracion: "ml_l" | "g_l" | "kg_l", cantidadBase: number): string {
  const esVolumen = unidadConcentracion === "ml_l";
  const unidadGrande = esVolumen ? "L" : "kg";
  const unidadChica = esVolumen ? "mL" : "g";
  if (cantidadBase < 1 && cantidadBase > 0) {
    return `${Math.round(cantidadBase * 1000 * 100) / 100} ${unidadChica}`;
  }
  return `${Math.round(cantidadBase * 100) / 100} ${unidadGrande}`;
}

/**
 * Mezcla por tanque/recipiente (bloque nuevo, 20-ago-2026): "Tanque X de N:
 * agregar [cantidad] de producto + completar con agua hasta [capacidad]" —
 * nunca porcentajes, siempre cantidades reales y prácticas. Reutilizable
 * entre Aplicaciones (9.7) y Fertirriego (9.6-bis).
 */
export default function MezclaPorTanque({
  mezcla,
  productos,
  capacidadTanque,
}: {
  mezcla: MezclaTanqueProducto[];
  productos: ProductoNombre[];
  capacidadTanque: number;
}) {
  if (mezcla.length === 0) return null;
  const { numeroTanques, tanquesCompletos, tanqueParcial } = mezcla[0]!;

  return (
    <div className="card" style={{ background: "var(--surface-soft, #fafafa)" }}>
      <div style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 8 }}>
        Mezcla por tanque — {numeroTanques.toFixed(2)} tanques de {capacidadTanque} L
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {tanquesCompletos > 0 && (
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>
              Tanque{tanquesCompletos > 1 ? "s" : ""} 1{tanquesCompletos > 1 ? ` a ${tanquesCompletos}` : ""} de{" "}
              {tanqueParcial ? tanquesCompletos + 1 : tanquesCompletos} — completo{tanquesCompletos > 1 ? "s" : ""}
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5 }}>
              {mezcla.map((m) => {
                const nombre = productos.find((p) => p.productoId === m.productoId)?.nombreComercial ?? m.productoId;
                const unidad = productos.find((p) => p.productoId === m.productoId)?.concentracionUnidad ?? "ml_l";
                return (
                  <li key={m.productoId}>
                    Agregar {formatearCantidad(unidad, m.cantidadProductoPorTanqueCompleto)} de {nombre} + completar con agua hasta{" "}
                    {capacidadTanque} L.
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {tanqueParcial && (
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>
              Tanque parcial ({(tanqueParcial.fraccion * 100).toFixed(0)}% del recipiente)
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5 }}>
              {mezcla.map((m) => {
                if (!m.tanqueParcial) return null;
                const nombre = productos.find((p) => p.productoId === m.productoId)?.nombreComercial ?? m.productoId;
                const unidad = productos.find((p) => p.productoId === m.productoId)?.concentracionUnidad ?? "ml_l";
                return (
                  <li key={m.productoId}>
                    Agregar {formatearCantidad(unidad, m.tanqueParcial.cantidadProducto)} de {nombre} + completar con agua hasta{" "}
                    {Math.round(m.tanqueParcial.volumenMezcla * 100) / 100} L.
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
