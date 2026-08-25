import "./core/validacionEspanol.js";
import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { authRouter } from "./routes/auth.routes.js";
import { solicitudesRouter } from "./core/solicitudes.routes.js";
import { notificacionesRouter } from "./core/notificaciones.routes.js";
import { nominaRouter } from "./modules/nomina/index.js";
import { unidadesProduccionRouter } from "./modules/unidades-produccion/index.js";
import { personalRouter } from "./modules/rh/personal.routes.js";
import { documentosRouter } from "./modules/rh/documentos.routes.js";
import { rhRouter } from "./modules/rh/index.js";
import { actividadesRouter } from "./modules/actividades/index.js";
import { almacenRouter } from "./modules/almacen/index.js";
import { comprasRouter } from "./modules/compras/index.js";
import { equiposModuleRouter } from "./modules/equipos/index.js";
import { aplicacionesRouter } from "./modules/aplicaciones/index.js";
import { fertilizantesModuleRouter } from "./modules/fertilizantes/index.js";
import { riegoRouter } from "./modules/riego/index.js";
import { configuracionRouter } from "./modules/configuracion/configuracion.routes.js";
import { recetarioRouter, tiposAplicacionRouter } from "./modules/recetario/recetario.routes.js";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use("/uploads", express.static(path.resolve("uploads")));

  app.get("/health", (_req, res) => res.json({ ok: true }));

  // Todas las rutas de la API viven bajo /api. Sin este prefijo, paths como
  // /aplicaciones o /actividades chocan textualmente con las páginas del
  // frontend (React Router) del mismo nombre: una navegación directa o un
  // refresh del navegador manda una petición HTTP real que Express
  // resolvía como ruta de API en vez de servir la página (11-ago-2026).
  const apiRouter = express.Router();
  apiRouter.use("/auth", authRouter);
  apiRouter.use("/solicitudes", solicitudesRouter);
  apiRouter.use("/notificaciones", notificacionesRouter);
  apiRouter.use("/nomina", nominaRouter);
  apiRouter.use("/actividades", actividadesRouter);
  apiRouter.use(unidadesProduccionRouter);
  apiRouter.use("/personal", personalRouter);
  apiRouter.use("/personal/:personalId/documentos", documentosRouter);
  apiRouter.use("/rh", rhRouter);
  apiRouter.use("/almacen", almacenRouter);
  apiRouter.use("/compras", comprasRouter);
  apiRouter.use("/equipos", equiposModuleRouter);
  apiRouter.use("/aplicaciones", aplicacionesRouter);
  apiRouter.use("/fertilizantes", fertilizantesModuleRouter);
  apiRouter.use("/riego", riegoRouter);
  apiRouter.use("/configuracion", configuracionRouter);
  apiRouter.use("/recetario", recetarioRouter);
  apiRouter.use("/tipos-aplicacion", tiposAplicacionRouter);
  // Cierre de la API (16-ago-2026): sin esto, una ruta de /api mal escrita o
  // renombrada (ej. un frontend viejo llamando un endpoint que ya se movió)
  // caía en el catch-all del SPA de abajo y devolvía el index.html completo
  // con status 200 — el frontend lo tomaba como respuesta "exitosa" (sin
  // ser JSON, cae a .blob()) y tronaba después al intentar usarlo como
  // arreglo, con pantalla en blanco y sin ningún error de red visible.
  apiRouter.use((_req, res) => {
    res.status(404).json({ error: "Ruta de API no encontrada." });
  });
  app.use("/api", apiRouter);

  // Sirve el frontend ya compilado (`npm run build --workspace=web`) desde
  // el mismo puerto que la API — así con un solo `tailscale funnel 4000`
  // queda accesible toda la app (bloque de hosting, 10-ago-2026). Si no
  // existe el build (ej. en desarrollo con `vite dev` en :5173), no hace nada.
  const webDist = path.resolve("..", "web", "dist");
  if (fs.existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get(/.*/, (_req, res) => {
      res.sendFile(path.join(webDist, "index.html"));
    });
  }

  const manejarError: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error(err);
    // P2002 = constraint UNIQUE violado (ej. dos Huertas con el mismo
    // nombre). Sin esto, Prisma tira un 500 genérico que se ve como si el
    // sistema se hubiera roto, en vez de avisar que el dato ya existe.
    if (typeof err === "object" && err !== null && "code" in err && err.code === "P2002") {
      const target = String((err as { meta?: { target?: unknown } }).meta?.target ?? "");
      const campo = target.includes("username") ? "usuario" : target.includes("folio") ? "folio" : target.includes("nombre") ? "nombre" : "valor";
      res.status(409).json({ error: `Ya existe un registro con ese mismo ${campo}.` });
      return;
    }
    res.status(500).json({ error: "Ocurrió un error inesperado en el servidor." });
  };
  app.use(manejarError);

  return app;
}
