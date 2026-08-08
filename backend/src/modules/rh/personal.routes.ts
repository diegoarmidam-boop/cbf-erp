import { Router } from "express";
import { prisma } from "../../core/db.js";
import { requireAuth, requirePermission } from "../../middleware/auth.js";

// NOTA DE ALCANCE: solo listado — la ficha completa de Recursos Humanos
// (alta/baja con motivo, do-not-hire, documentos) es el módulo 2 del orden
// de construcción. Esto solo existe para que Nómina pueda elegir personas
// al capturar.
export const personalRouter = Router();
personalRouter.use(requireAuth);

personalRouter.get("/", requirePermission("nomina", "capturar"), async (req, res) => {
  const tipo = req.query.tipo === "fijo" || req.query.tipo === "destajo" ? req.query.tipo : undefined;
  res.json(
    await prisma.personal.findMany({
      where: { activo: true, tipo },
      orderBy: { nombreCompleto: "asc" },
      select: { id: true, nombreCompleto: true, tipo: true, huertaId: true, sueldo: true, puestoId: true },
    })
  );
});
