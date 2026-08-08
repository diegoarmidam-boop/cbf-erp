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
  { nombre: "Riego Tirar Cinta" },
  { nombre: "Fumigación" },
  { nombre: "Limpieza" },
  { nombre: "Virosis" },
];
