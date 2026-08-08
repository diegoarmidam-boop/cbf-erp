import type { Rol } from "@prisma/client";

export interface PermisoSeed {
  rol: Rol;
  modulo: string;
  ver?: boolean;
  capturar?: boolean;
  editar?: boolean;
  autoriza?: boolean;
}

// Matriz rol × módulo, transcrita directamente de la tabla "Personas/puestos
// involucrados y sus permisos" de cada ficha (sección 9 del documento vivo).
// Director General, Encargado de Sistemas (acceso universal) y Auditor
// (ver global) NO llevan fila aquí — el motor de permisos los resuelve por
// código antes de consultar esta tabla (ver core/permissions.ts).
//
// El alcance "solo su Huerta"/"su rancho" que aparece en varias filas del
// documento no se modela en esta tabla booleana — se filtra a nivel de
// consulta con huertaIdDeAlcance() en cada ruta, no aquí.
export const PERMISOS_SEED: PermisoSeed[] = [
  // ---- Unidades de Producción (9.1) ----
  { rol: "gerente_tecnico_produccion", modulo: "unidades_produccion", ver: true, capturar: true, editar: true },
  { rol: "gerente_administrativo", modulo: "unidades_produccion", ver: true, editar: true },
  { rol: "supervisor_huerta", modulo: "unidades_produccion", ver: true },
  { rol: "contador", modulo: "unidades_produccion", ver: true },
  { rol: "asistente_tecnico_produccion", modulo: "unidades_produccion", ver: true },

  // ---- Recursos Humanos (9.12) ----
  { rol: "recursos_humanos", modulo: "rh", ver: true, capturar: true, editar: true, autoriza: true },
  { rol: "gerente_administrativo", modulo: "rh", ver: true, editar: true },

  // ---- Nómina (9.11) ----
  { rol: "recursos_humanos", modulo: "nomina", ver: true, capturar: true, editar: true, autoriza: true },
  { rol: "encargado_nominas", modulo: "nomina", ver: true, capturar: true, editar: true },
  { rol: "gerente_administrativo", modulo: "nomina", ver: true, editar: true },
  { rol: "contador", modulo: "nomina", ver: true, capturar: true },
  { rol: "gerente_tecnico_produccion", modulo: "nomina", ver: true },
  { rol: "asistente_administrativo", modulo: "nomina", ver: true, capturar: true },
  { rol: "supervisor_huerta", modulo: "nomina", capturar: true },

  // ---- Almacén (9.15, incluye Almacén Local) ----
  { rol: "encargado_bodega", modulo: "almacen", ver: true, capturar: true, editar: true, autoriza: true },
  { rol: "bodeguista", modulo: "almacen", ver: true, capturar: true },
  { rol: "supervisor_huerta", modulo: "almacen", ver: true, capturar: true },
  { rol: "gerente_tecnico_produccion", modulo: "almacen", ver: true, autoriza: true },
  { rol: "gerente_administrativo", modulo: "almacen", ver: true, editar: true },

  // ---- Compras (9.14, incluye Proveedores) ----
  { rol: "encargado_compras", modulo: "compras", ver: true, capturar: true, editar: true, autoriza: true },
  { rol: "gerente_administrativo", modulo: "compras", ver: true, autoriza: true },
  { rol: "gerente_tecnico_produccion", modulo: "compras", autoriza: true },
  { rol: "contador", modulo: "compras", ver: true },
  { rol: "encargado_bodega", modulo: "compras", ver: true, capturar: true },
  { rol: "asistente_administrativo", modulo: "compras", ver: true, capturar: true },

  // ---- Equipos y Maquinaria (9.13) ----
  { rol: "gerente_mantenimiento", modulo: "equipos", ver: true, capturar: true, editar: true },
  { rol: "mecanico", modulo: "equipos", ver: true, capturar: true },
  { rol: "gerente_tecnico_produccion", modulo: "equipos", ver: true, capturar: true },
  { rol: "supervisor_cosecha", modulo: "equipos", ver: true, capturar: true },
  { rol: "supervisor_huerta", modulo: "equipos", ver: true, capturar: true },

  // ---- Aplicaciones — agroquímicos (9.7) ----
  { rol: "gerente_tecnico_produccion", modulo: "aplicaciones", ver: true, capturar: true, autoriza: true },
  { rol: "asistente_tecnico_produccion", modulo: "aplicaciones", ver: true, capturar: true },
  { rol: "supervisor_huerta", modulo: "aplicaciones", ver: true, capturar: true },
  { rol: "ayudante_supervisor", modulo: "aplicaciones", ver: true, capturar: true },

  // ---- Fertilizantes — Granular y Fertirriego (9.5) ----
  { rol: "gerente_tecnico_produccion", modulo: "fertilizantes", ver: true, capturar: true, autoriza: true },
  { rol: "asistente_tecnico_produccion", modulo: "fertilizantes", ver: true, capturar: true },
  { rol: "supervisor_huerta", modulo: "fertilizantes", ver: true, capturar: true },

  // ---- Riego — ejecución diaria (9.6) ----
  { rol: "regador", modulo: "riego", ver: true, capturar: true },
  { rol: "supervisor_huerta", modulo: "riego", ver: true },
  { rol: "gerente_tecnico_produccion", modulo: "riego", ver: true },
];
