import { PrismaClient } from "@prisma/client";
import { getContext } from "./context.js";

// Modelos que dejan rastro de auditoría automático. Se excluyen tablas de
// unión pura (ej. AplicacionCuadro) que no tienen valor propio como
// "registro" y las tablas de configuración/permiso que ya llevan su propio
// candado de autorización.
const MODELOS_AUDITADOS = new Set([
  "Usuario",
  "Huerta",
  "Cuadro",
  "CuadroVersion",
  "Ciclo",
  "CicloVariedad",
  "SeccionRiego",
  "Puesto",
  "Personal",
  "PersonalDocumento",
  "DoNotHire",
  "Actividad",
  "ConfigNomina",
  "GrupoPago",
  "GrupoMiembro",
  "RegistroNomina",
  "DiaCerrado",
  "Prestamo",
  "PrestamoDescuento",
  "BonoConfig",
  "BonoOtorgado",
  "CompromisoEspecial",
  "FaltaInjustificada",
  "Equipo",
  "CombustibleCarga",
  "MantenimientoConcepto",
  "MantenimientoEvento",
  "EquipoUsoDiario",
  "Producto",
  "ProductoLote",
  "AlmacenCentralMovimiento",
  "AlmacenLocal",
  "AlmacenLocalMovimiento",
  "Proveedor",
  "OrdenCompra",
  "OrdenCompraRecepcion",
  "Aplicacion",
  "AplicacionRealizada",
  "FertilizacionGranular",
  "FertilizacionGranularRealizada",
  "FertirriegoProgramacion",
  "AnalisisLaboratorio",
  "RiegoRegistroDiario",
  "EmpresaConfig",
  "Comparacion",
  "ComparacionCotizacion",
]);
// ModuloConfig NO entra aquí: su llave primaria es `modulo` (string), no
// `id` — este extension solo sabe leer `resultado.id`/`valorAnterior.id`
// (mismo motivo por el que ConfigNomina tampoco está en esta lista), así
// que quedaría auditado en silencio (sin error, pero sin fila real en
// AuditoriaLog). Su bitácora se escribe explícito en
// core/moduloComunicacion.ts en vez de depender de este mecanismo genérico.

const ACCIONES_ESCRITURA = new Set(["create", "update", "delete", "upsert"]);

const basePrisma = new PrismaClient();

const extendedPrisma = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!MODELOS_AUDITADOS.has(model) || !ACCIONES_ESCRITURA.has(operation)) {
          return query(args);
        }

        const ctx = getContext();
        // Sin contexto de usuario (ej. seed script) — se ejecuta sin auditar,
        // no se bloquea la escritura por eso.
        if (!ctx) return query(args);

        let valorAnterior: unknown = null;
        if (operation === "update" || operation === "delete" || operation === "upsert") {
          const delegate = (basePrisma as any)[model.charAt(0).toLowerCase() + model.slice(1)];
          const where = (args as { where?: unknown }).where;
          if (delegate && where) {
            valorAnterior = await delegate.findUnique({ where }).catch(() => null);
          }
        }

        const resultado = await query(args);

        const accion = operation === "delete" ? "eliminar" : operation === "create" ? "crear" : "editar";
        const registroId = (resultado as { id?: string } | null)?.id ?? (valorAnterior as { id?: string } | null)?.id;
        if (registroId) {
          await basePrisma.auditoriaLog.create({
            data: {
              tabla: model,
              registroId,
              accion,
              valorAnterior: valorAnterior ? JSON.parse(JSON.stringify(valorAnterior)) : undefined,
              valorNuevo: operation !== "delete" ? JSON.parse(JSON.stringify(resultado)) : undefined,
              usuarioId: ctx.usuarioId,
            },
          });
        }

        return resultado;
      },
    },
  },
});

export const prisma = extendedPrisma;
export type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
