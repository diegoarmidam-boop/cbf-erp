import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.routes.js";
import { solicitudesRouter } from "./core/solicitudes.routes.js";
import { nominaRouter } from "./modules/nomina/index.js";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use("/auth", authRouter);
  app.use("/solicitudes", solicitudesRouter);
  app.use("/nomina", nominaRouter);

  const manejarError: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: "Ocurrió un error inesperado en el servidor." });
  };
  app.use(manejarError);

  return app;
}
