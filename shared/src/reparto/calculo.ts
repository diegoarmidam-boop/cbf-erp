/**
 * Reparto de un avance (V1 P2, 25-sep-2026, Bloque 3) a Grupos y, dentro de
 * cada Grupo, a sus Cuadros o pares Cuadro+Variedad — usado por Aplicaciones,
 * Granular (con Grupos) y Actividades (un solo Grupo implícito). El avance
 * ya no indica Cuadro/variedad/grupo — se registran solo las hectáreas
 * totales del reporte, y el sistema reparte en proporción a lo programado.
 * Se calcula UNA vez, el día del reporte — nunca se recalculan reportes
 * anteriores si algo cambia después.
 *
 * Fórmula (verificada contra el ejemplo de Diego, Prioridad 2):
 * - proporción del grupo = hectáreas programadas del grupo / hectáreas
 *   totales programadas de la programación.
 * - hectáreas atribuidas al grupo = hectáreas del avance × esa proporción.
 * - dentro del grupo, cada miembro (Cuadro, o Cuadro+Variedad) se lleva su
 *   propia proporción de las hectáreas programadas DEL GRUPO.
 */

export interface MiembroPrograma<K> {
  clave: K; // cuadroId (por Cuadro) o `${cuadroId}|${variedad}` (por Variedad)
  hectareasProgramadas: number;
}

export interface GrupoPrograma<K> {
  grupoId: string;
  hectareasProgramadas: number; // = suma de sus miembros.hectareasProgramadas
  miembros: MiembroPrograma<K>[];
}

export interface PorcionGrupo {
  grupoId: string;
  hectareasProgramadas: number;
  hectareasAtribuidas: number;
}

export interface PorcionMiembro<K> {
  grupoId: string;
  clave: K;
  hectareasAtribuidas: number;
}

export interface RepartoAvance<K> {
  porGrupo: PorcionGrupo[];
  porMiembro: PorcionMiembro<K>[];
}

/** Reparte `hectareasReportadas` a Grupos y, dentro de cada uno, a sus miembros — todo en proporción a lo programado. */
export function calcularRepartoAvance<K>(grupos: GrupoPrograma<K>[], hectareasReportadas: number): RepartoAvance<K> {
  const hectareasTotalesProgramadas = grupos.reduce((s, g) => s + g.hectareasProgramadas, 0);

  const porGrupo: PorcionGrupo[] = [];
  const porMiembro: PorcionMiembro<K>[] = [];

  for (const grupo of grupos) {
    const proporcionGrupo = hectareasTotalesProgramadas > 0 ? grupo.hectareasProgramadas / hectareasTotalesProgramadas : 0;
    const hectareasAtribuidas = hectareasReportadas * proporcionGrupo;
    porGrupo.push({ grupoId: grupo.grupoId, hectareasProgramadas: grupo.hectareasProgramadas, hectareasAtribuidas });

    for (const miembro of grupo.miembros) {
      const proporcionMiembro = grupo.hectareasProgramadas > 0 ? miembro.hectareasProgramadas / grupo.hectareasProgramadas : 0;
      porMiembro.push({ grupoId: grupo.grupoId, clave: miembro.clave, hectareasAtribuidas: hectareasAtribuidas * proporcionMiembro });
    }
  }

  return { porGrupo, porMiembro };
}

/** Cuánto de una magnitud total del Grupo (ej. producto según su dosis) toca a ESTE reporte, según sus hectáreas atribuidas. */
export function proporcionDelGrupo(hectareasAtribuidasGrupo: number, hectareasProgramadasGrupo: number, totalDelGrupo: number): number {
  return hectareasProgramadasGrupo > 0 ? (hectareasAtribuidasGrupo / hectareasProgramadasGrupo) * totalDelGrupo : 0;
}

/** Reparte un monto total (ej. mano de obra del reporte) entre miembros ya repartidos, en proporción a sus hectáreas atribuidas. */
export function repartirMontoPorHectareas<K>(porMiembro: PorcionMiembro<K>[], hectareasReportadas: number, monto: number): { clave: K; monto: number }[] {
  if (hectareasReportadas <= 0) return porMiembro.map((m) => ({ clave: m.clave, monto: 0 }));
  return porMiembro.map((m) => ({ clave: m.clave, monto: (m.hectareasAtribuidas / hectareasReportadas) * monto }));
}
