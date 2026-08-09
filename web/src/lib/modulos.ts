export interface ModuloInfo {
  slug: string;
  nombre: string;
  bgVar: string;
  fgVar: string;
  icono: string;
  // Slugs de permiso adicionales que también dan acceso a esta entrada del
  // menú — ej. "do_not_hire" vive aparte de "rh" en la matriz de permisos
  // (un Supervisor puede ver la lista negra sin ver todo RH), pero ambos
  // navegan a la misma sección "Recursos Humanos".
  permisosAlternos?: string[];
}

// Solo los módulos con pantalla ya construida aparecen en el menú, aunque
// el rol tenga permiso de "ver" en más — se amplía conforme se construye
// cada módulo (regla del bloque 4: la ausencia es la señal, nunca un
// candado o pantalla de "próximamente").
export const MODULOS_CONSTRUIDOS: ModuloInfo[] = [
  { slug: "nomina", nombre: "Nómina", bgVar: "--mod-nomina-bg", fgVar: "--mod-nomina-fg", icono: "💰" },
  {
    slug: "rh",
    nombre: "Recursos Humanos",
    bgVar: "--mod-rh-bg",
    fgVar: "--mod-rh-fg",
    icono: "🧑‍🌾",
    permisosAlternos: ["do_not_hire"],
  },
  { slug: "unidades_produccion", nombre: "Unidades de Producción", bgVar: "--mod-unidades-produccion-bg", fgVar: "--mod-unidades-produccion-fg", icono: "🌱" },
  {
    slug: "almacen",
    nombre: "Almacén",
    bgVar: "--mod-almacen-bg",
    fgVar: "--mod-almacen-fg",
    icono: "📦",
    permisosAlternos: ["almacen_regulado"],
  },
  { slug: "compras", nombre: "Compras", bgVar: "--mod-compras-bg", fgVar: "--mod-compras-fg", icono: "🧾" },
  { slug: "equipos", nombre: "Equipos y Maquinaria", bgVar: "--mod-equipos-bg", fgVar: "--mod-equipos-fg", icono: "🚜" },
];

export function moduloInfo(slug: string): ModuloInfo {
  return MODULOS_CONSTRUIDOS.find((m) => m.slug === slug) ?? { slug, nombre: slug, bgVar: "--bg", fgVar: "--ink-soft", icono: "•" };
}

export function moduloVisible(modulo: ModuloInfo, modulosVisibles: string[]): boolean {
  return modulosVisibles.includes(modulo.slug) || (modulo.permisosAlternos ?? []).some((p) => modulosVisibles.includes(p));
}
