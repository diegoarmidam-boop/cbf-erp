/**
 * Bug real corregido (8-sep-2026): el Service Worker de la PWA (registerType
 * "autoUpdate") se instala y toma control de inmediato (skipWaiting +
 * clientsClaim en sw.js) — pero eso pasa DESPUÉS de que la página ya cargó
 * con el bundle viejo, así que la pestaña/app abierta se queda mostrando
 * código desactualizado hasta que alguien la recargue a mano. El registro
 * automático (registerSW.js, inyectado en index.html) no incluye esta
 * recarga — solo existe si se usa el módulo virtual "virtual:pwa-register",
 * que aquí no se usa. Sin esto, un cambio de código nuevo (ej. Cantidad en
 * Solicitud manual, 8-sep-2026) puede no verse hasta cerrar y reabrir la
 * app varias veces.
 *
 * "controllerchange" se dispara exactamente cuando el Service Worker nuevo
 * toma control — ahí se recarga una sola vez para que la página siempre
 * coincida con el código que el servidor ya tiene.
 */
if ("serviceWorker" in navigator) {
  let yaRecargando = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (yaRecargando) return;
    yaRecargando = true;
    window.location.reload();
  });
}
