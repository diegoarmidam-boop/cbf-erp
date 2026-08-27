// Actividades vigentes confirmadas (9.2 / 9.11 del documento vivo). Las
// ~24 candidatas del histórico del Excel quedan fuera a propósito — el
// usuario las depurará antes de autorizar que se agreguen.
//
// Las 12 son, hoy, actividades de campo pagadas por hora que comparten la
// tarifa general configurable (esquema "Individual por hora" del catálogo
// de Nómina) — ninguna de las confirmadas usa los esquemas de caja/remolque
// /empacadores todavía; esos se dan de alta manualmente cuando se necesiten.
export const ACTIVIDADES_SEED: Array<{ nombre: string }> = [
  { nombre: "Bodega" },
  { nombre: "Ahoyado" },
  { nombre: "Mantenimiento" },
  { nombre: "Siembra" },
  { nombre: "Supervisor" },
  { nombre: "Vivero" },
  { nombre: "Chapeo" },
  { nombre: "Riego" },
  // Renombrada de "Riego Tirar Cinta" el 10-ago-2026, al mudarse al módulo de Actividades (9.4) — ya no lleva el prefijo "Riego" al vivir ahí.
  { nombre: "Tirar Cinta" },
  { nombre: "Fumigación" },
  { nombre: "Limpieza" },
  { nombre: "Virosis" },
  // Agregada al construir Fertilizantes (9.5, Módulo 8) — ninguna de las 12
  // originales representaba "aplicar fertilizante granular"; decisión
  // explícita del usuario, mismo esquema que las demás (Individual por hora).
  { nombre: "Fertilización" },
  // 26-ago-2026: de las ~24 candidatas descartadas el 8-ago, el usuario
  // confirmó que estas 4 sí son actividades reales de campo y deben
  // agregarse — más 2 actividades nuevas simples ("Supervisor" ya estaba
  // en el catálogo desde antes, no se duplica). Mismo esquema que las
  // demás (Individual por hora, tarifa general, solo gente).
  { nombre: "Herbicida" },
  { nombre: "Hora Extra" },
  { nombre: "Descarga y Acomodo de Planta" },
  { nombre: "Deshilado" },
  // Nombre específico (no "Mantenimiento" genérico) para no confundirse
  // con el módulo de Equipos y Maquinaria, que ya tiene su propio concepto
  // de mantenimiento de equipos.
  { nombre: "Mantenimiento Cintilla/Riego" },
  { nombre: "Albañil" },
];
