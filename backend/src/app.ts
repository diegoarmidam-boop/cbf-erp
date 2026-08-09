import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import path from "node:path";
import { authRouter } from "./routes/auth.routes.js";
import { solicitudesRouter } from "./core/solicitudes.routes.js";
import { nominaRouter } from "./modules/nomina/index.js";
import { unidadesProduccionRouter } from "./modules/unidades-produccion/index.js";
import { personalRouter } from "./modules/rh/personal.routes.js";
import { documentosRouter } from "./modules/rh/documentos.routes.js";
import { rhRouter } from "./modules/rh/index.js";
import { almacenRouter } from "./modules/almacen/index.js";
import { comprasRouter } from "./modules/compras/index.js";
import { equiposModuleRouter } from "./modules/equipos/index.js";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use("/uploads", express.static(path.resolve("uploads")));

  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use("/auth", authRouter);
  app.use("/solicitudes", solicitudesRouter);
  app.use("/nomina", nominaRouter);
  app.use(unidadesProduccionRouter);
  app.use("/personal", personalRouter);
  app.use("/personal/:personalId/documentos", documentosRouter);
  app.use("/rh", rhRouter);
  app.use("/almacen", almacenRouter);
  app.use("/compras", comprasRouter);
  app.use("/equipos", equiposModuleRouter);

  const manejarError: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: "Ocurrió un error inesperado en el servidor." });
  };
  app.use(manejarError);

  return app;
}
