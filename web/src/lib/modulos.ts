export interface ModuloInfo {
  slug: string;
  nombre: string;
  bgVar: string;
  fgVar: string;
  icono: string;
}

// Solo los módulos con pantalla ya construida aparecen en el menú, aunque
// el rol tenga permiso de "ver" en más — se amplía conforme se construye
// cada módulo (regla del bloque 4: la ausencia es la señal, nunca un
// candado o pantalla de "próximamente").
export const MODULOS_CONSTRUIDOS: ModuloInfo[] = [
  { slug: "nomina", nombre: "Nómina", bgVar: "--mod-nomina-bg", fgVar: "--mod-nomina-fg", icono: "💰" },
  { slug: "unidades_produccion", nombre: "Unidades de Producción", bgVar: "--mod-unidades-produccion-bg", fgVar: "--mod-unidades-produccion-fg", icono: "🌱" },
];

export function moduloInfo(slug: string): ModuloInfo {
  return MODULOS_CONSTRUIDOS.find((m) => m.slug === slug) ?? { slug, nombre: slug, bgVar: "--bg", fgVar: "--ink-soft", icono: "•" };
}
