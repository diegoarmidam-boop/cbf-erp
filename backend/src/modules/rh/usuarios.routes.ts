import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { Rol } from "@prisma/client";
import { prisma } from "../../core/db.js";
import { requireAuth } from "../../middleware/auth.js";
import { unoSolo } from "../../core/http.js";
import { hashPassword } from "../../core/auth.js";
import { invalidarMatrizPermisos } from "../../core/permissions.js";

// "Pantalla dedicada (dentro de Recursos Humanos, SOLO Directivo)" — el
// documento es explícito en que ni siquiera el rol de Recursos Humanos
// administra accesos, así que esto no pasa por la matriz de permisos
// normal: se exige director_general/encargado_sistemas directo.
function requireDirectivo(req: Request, res: Response, next: NextFunction): void {
  if (req.usuario?.rol !== "director_general" && req.usuario?.rol !== "encargado_sistemas") {
    res.status(403).json({ error: "Solo Dirección General/Sistemas administra accesos y usuarios." });
    return;
  }
  next();
}

export const usuariosRouter = Router();
usuariosRouter.use(requireAuth, requireDirectivo);

usuariosRouter.get("/", async (_req, res) => {
  res.json(
    await prisma.usuario.findMany({
      select: { id: true, nombre: true, username: true, rol: true, huertaId: true, activo: true, personalId: true },
      orderBy: { nombre: "asc" },
    })
  );
});

const crearUsuarioSchema = z.object({
  nombre: z.string().min(1),
  username: z.string().min(3),
  password: z.string().min(6),
  rol: z.nativeEnum(Rol),
  personalId: z.string().optional(),
  huertaId: z.string().optional(),
});

usuariosRouter.post("/", async (req, res) => {
  const parsed = crearUsuarioSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { password, ...datos } = parsed.data;
  const usuario = await prisma.usuario.create({
    data: { ...datos, passwordHash: await hashPassword(password), creadoPorId: req.usuario!.usuarioId },
  });
  res.status(201).json({ id: usuario.id, nombre: usuario.nombre, username: usuario.username, rol: usuario.rol });
});

const actualizarSchema = z.object({
  rol: z.nativeEnum(Rol).optional(),
  huertaId: z.string().nullable().optional(),
  activo: z.boolean().optional(),
});

usuariosRouter.patch("/:id", async (req, res) => {
  const parsed = actualizarSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const usuario = await prisma.usuario.update({ where: { id: unoSolo(req.params.id) }, data: parsed.data });
  invalidarMatrizPermisos(); // por si el cambio de rol requiere recargar el caché en el siguiente request
  res.json({ id: usuario.id, rol: usuario.rol, activo: usuario.activo });
});

// El Directivo resetea la contraseña si se olvida — sin flujo de
// recuperación automática (bloque 10).
const resetPasswordSchema = z.object({ password: z.string().min(6) });

usuariosRouter.post("/:id/resetear-password", async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  await prisma.usuario.update({
    where: { id: unoSolo(req.params.id) },
    data: { passwordHash: await hashPassword(parsed.data.password) },
  });
  res.status(204).end();
});
