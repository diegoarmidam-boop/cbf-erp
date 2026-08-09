import type { Rol } from "@prisma/client";
import { prisma } from "./db.js";

export type Accion = "ver" | "capturar" | "editar" | "autoriza";

// Roles con acceso universal de arquitectura (bloque 4): sin importar la
// matriz, siempre pueden ver+capturar+editar+autoriza cualquier módulo.
const ROLES_ACCESO_UNIVERSAL: Rol[] = ["director_general", "encargado_sistemas"];

// El Auditor siempre tiene "ver" global en todo módulo, sin excepción, y
// nunca ningún otro permiso (bloque 4 y 9.17).
const ROL_AUDITOR: Rol = "auditor";

let matrizCache: Map<string, { ver: boolean; capturar: boolean; editar: boolean; autoriza: boolean }> | null = null;

function claveMatriz(rol: string, modulo: string): string {
  return `${rol}::${modulo}`;
}

export async function cargarMatrizPermisos(): Promise<void> {
  const filas = await prisma.permisoModulo.findMany();
  matrizCache = new Map(
    filas.map((f) => [
      claveMatriz(f.rol, f.modulo),
      { ver: f.ver, capturar: f.capturar, editar: f.editar, autoriza: f.autoriza },
    ])
  );
}

export function invalidarMatrizPermisos(): void {
  matrizCache = null;
}

export async function tienePermiso(rol: Rol, modulo: string, accion: Accion): Promise<boolean> {
  if (ROLES_ACCESO_UNIVERSAL.includes(rol)) return true;
  if (rol === ROL_AUDITOR) return accion === "ver";

  if (!matrizCache) await cargarMatrizPermisos();
  const fila = matrizCache!.get(claveMatriz(rol, modulo));
  if (!fila) return false;
  return fila[accion];
}

// Módulos visibles para un rol — cualquier permiso (ver, capturar, editar
// o autoriza) basta para que el módulo aparezca en sidebar/bottom-nav/
// "Más" (regla del bloque 4/5). Un Supervisor con solo "capturar" en
// Nómina sí debe ver la entrada de menú, aunque no tenga "ver" — si no,
// nunca podría llegar a la pantalla de Captura del día desde el menú.
export async function modulosVisibles(rol: Rol): Promise<string[]> {
  if (!matrizCache) await cargarMatrizPermisos();
  if (ROLES_ACCESO_UNIVERSAL.includes(rol) || rol === ROL_AUDITOR) {
    const modulos = new Set(Array.from(matrizCache!.keys()).map((k) => k.split("::")[1]!));
    return Array.from(modulos);
  }
  return Array.from(matrizCache!.entries())
    .filter(([clave, permisos]) => clave.startsWith(`${rol}::`) && (permisos.ver || permisos.capturar || permisos.editar || permisos.autoriza))
    .map(([clave]) => clave.split("::")[1]!);
}
