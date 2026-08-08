import { Router } from "express";
import { z } from "zod";
import { prisma } from "../core/db.js";
import { issueToken, verifyPassword } from "../core/auth.js";
import { modulosVisibles } from "../core/permissions.js";

export const authRouter = Router();

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

// Autenticación simple usuario/contraseña — sin flujo de recuperación
// automática, el Directivo resetea contraseñas a mano (bloque 10).
authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Usuario y contraseña son requeridos." });
    return;
  }
  const { username, password } = parsed.data;

  const usuario = await prisma.usuario.findUnique({ where: { username } });
  if (!usuario || !usuario.activo) {
    res.status(401).json({ error: "Usuario o contraseña incorrectos." });
    return;
  }

  const ok = await verifyPassword(password, usuario.passwordHash);
  if (!ok) {
    res.status(401).json({ error: "Usuario o contraseña incorrectos." });
    return;
  }

  const token = issueToken({ usuarioId: usuario.id, rol: usuario.rol, huertaId: usuario.huertaId });
  const modulos = await modulosVisibles(usuario.rol);

  res.json({
    token,
    usuario: {
      id: usuario.id,
      nombre: usuario.nombre,
      rol: usuario.rol,
      huertaId: usuario.huertaId,
    },
    modulosVisibles: modulos,
  });
});
