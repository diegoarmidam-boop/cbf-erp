import { Router } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { requireAuth } from "../../middleware/auth.js";

// Foto de evidencia genérica (V1 P3, 26-sep-2026, 9.13): relleno de
// combustible de tractor/motobomba, Traslado entre ranchos. Un solo
// endpoint de subida que solo devuelve la URL — el registro real (la carga,
// el Traslado, la línea de avance) se crea después con esa URL, en el mismo
// POST que ya manda todos los demás campos (evita meter multipart dentro de
// un payload anidado de varias líneas).
const UPLOAD_DIR = path.resolve("uploads", "equipos");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`),
});
const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 } });

export const evidenciaRouter = Router();
evidenciaRouter.use(requireAuth);

evidenciaRouter.post("/", upload.single("archivo"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "Falta el archivo." });
    return;
  }
  res.status(201).json({ url: `/uploads/equipos/${req.file.filename}` });
});
