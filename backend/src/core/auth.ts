import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Rol } from "@prisma/client";

const JWT_SECRET: string = (() => {
  const value = process.env.JWT_SECRET;
  if (!value) throw new Error("Falta JWT_SECRET en el entorno — revisa backend/.env");
  return value;
})();

export interface TokenPayload {
  usuarioId: string;
  rol: Rol;
  huertaId: string | null;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function issueToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "12h" });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
}
