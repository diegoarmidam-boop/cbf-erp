import { Router } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { z } from "zod";
import { prisma } from "../../core/db.js";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import { unoSolo } from "../../core/http.js";

// Almacenamiento local en disco para V1 — el path relativo queda guardado
// en `archivoUrl`. Cuando se despliegue a DigitalOcean, esto es lo único
// que habría que cambiar por un adaptador de Spaces (S3-compatible); el
// resto del módulo no le importa de dónde viene la URL.
const UPLOAD_DIR = path.resolve("uploads", "personal");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dir = path.join(UPLOAD_DIR, unoSolo(req.params.personalId));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 } });

export const documentosRouter = Router({ mergeParams: true });
documentosRouter.use(requireAuth);

documentosRouter.get("/", requirePermission("rh", "ver"), async (req, res) => {
  res.json(await prisma.personalDocumento.findMany({ where: { personalId: unoSolo(req.params.personalId) } }));
});

const metaSchema = z.object({
  tipoDocumento: z.enum(["identificacion", "contrato", "comprobante_domicilio", "otro"]),
  origen: z.enum(["foto_celular", "escaneo"]),
});

documentosRouter.post("/", requirePermission("rh", "capturar"), upload.single("archivo"), async (req, res) => {
  const parsed = metaSchema.safeParse(req.body);
  if (!parsed.success || !req.file) {
    res.status(400).json({ error: parsed.success ? "Falta el archivo." : parsed.error.message });
    return;
  }
  const personalId = unoSolo(req.params.personalId);
  const archivoUrl = `/uploads/personal/${personalId}/${req.file.filename}`;
  const doc = await prisma.personalDocumento.create({
    data: { personalId, tipoDocumento: parsed.data.tipoDocumento, origen: parsed.data.origen, archivoUrl },
  });
  res.status(201).json(doc);
});
