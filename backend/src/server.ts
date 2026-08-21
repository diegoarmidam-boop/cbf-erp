import "dotenv/config";
import { createApp } from "./app.js";

// Manejador de errores a nivel de proceso (bloque 2, 20-ago-2026): Express 5
// ya atrapa solo los rechazos de promesas de cualquier ruta async y los
// manda a manejarError en app.ts — pero eso NO cubre código que corre fuera
// del ciclo de una petición (ej. un callback de setTimeout, o un error
// sincrono que se escapa de un try/catch por descuido). Sin esto, cualquiera
// de esos casos tumba el proceso completo de Node y deja sin servicio a
// TODOS los usuarios, no solo a quien topó con el bug — exactamente lo que
// este bloque busca evitar. Se registra el error y el proceso sigue vivo;
// es deliberado no hacer process.exit() aqui, aunque Node lo recomiende
// para el caso general, porque el objetivo explicito es que un modulo a
// medio corregir no tumbe a los demas.
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException] El proceso no se cae, pero revisa esto:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection] El proceso no se cae, pero revisa esto:", reason);
});

const port = Number(process.env.PORT ?? 4000);
const app = createApp();

app.listen(port, () => {
  console.log(`CBF ERP backend escuchando en http://localhost:${port}`);
});
