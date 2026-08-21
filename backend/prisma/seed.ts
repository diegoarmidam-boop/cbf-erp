import "dotenv/config";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/core/auth.js";
import { PERSONAL_SEED } from "./seed-data/personal.js";
import { ACTIVIDADES_SEED } from "./seed-data/actividades.js";
import { PERMISOS_SEED } from "./seed-data/permisos.js";
import { MODULOS_CON_SWITCH } from "../src/core/moduloComunicacion.js";

// Seed sin capa de auditoría (usa el PrismaClient base, no el extendido de
// src/core/db.ts) — no hay un usuario "capturando" todavía, es carga inicial.
const prisma = new PrismaClient();

function normalizarNombre(nombre: string): string {
  return nombre
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("es-MX")
    .split(" ")
    .map((palabra) => palabra.charAt(0).toLocaleUpperCase("es-MX") + palabra.slice(1))
    .join(" ");
}

async function seedPersonal() {
  let creados = 0;
  for (const nombreOriginal of PERSONAL_SEED) {
    const nombreCompleto = normalizarNombre(nombreOriginal);
    const existente = await prisma.personal.findFirst({ where: { nombreCompleto } });
    if (existente) continue;
    // Default: todos como destajo/eventual — es la clasificación real de la
    // gran mayoría de este listado (cuadrillas de campo). Los pocos que en
    // realidad son personal fijo (supervisores, regadores, etc.) deben
    // corregirse desde la pantalla de RH una vez identificados; el seed no
    // puede inventar esa distinción porque el Apéndice A solo trae nombres.
    await prisma.personal.create({
      data: { nombreCompleto, tipo: "destajo" },
    });
    creados++;
  }
  console.log(`Personal: ${creados} personas nuevas creadas (de ${PERSONAL_SEED.length} en el Apéndice A).`);
}

async function seedActividades() {
  for (const act of ACTIVIDADES_SEED) {
    await prisma.actividad.upsert({
      where: { nombre: act.nombre },
      update: {},
      create: {
        nombre: act.nombre,
        unidad: "hora",
        tarifa: 0, // ignorada: usarTarifaGeneral=true (ver ConfigNomina.tarifa_general_hora)
        usarTarifaGeneral: true,
        esquemaPago: "individual_hora",
        requiereCuadro: false,
        etapaRestringida: null,
      },
    });
  }
  console.log(`Actividades: ${ACTIVIDADES_SEED.length} confirmadas cargadas.`);
}

async function seedConfigNomina() {
  // Defaults documentados explícitamente (bloque 9.11): corte jueves,
  // periodo de gracia de 3 días. `tarifa_general_hora` NO se seedea — el
  // documento no da un monto, y usarlo en 0 rompería el cálculo real; debe
  // configurarlo el Gerente Administrativo desde Nómina > Catálogos antes
  // de que cualquier actividad "individual_hora" se pueda pagar.
  await prisma.configNomina.upsert({
    where: { clave: "dia_corte_semanal" },
    update: {},
    create: { clave: "dia_corte_semanal", valor: "jueves" },
  });
  await prisma.configNomina.upsert({
    where: { clave: "dias_gracia_cierre" },
    update: {},
    create: { clave: "dias_gracia_cierre", valor: "3" },
  });
  console.log("ConfigNomina: defaults de corte semanal y periodo de gracia cargados.");
}

// Switch de comunicación por módulo (20-ago-2026): todos arrancan
// encendidos — es herramienta de desarrollo para apagar deliberadamente,
// nunca un estado por default.
async function seedModuloConfig() {
  for (const modulo of MODULOS_CON_SWITCH) {
    await prisma.moduloConfig.upsert({
      where: { modulo },
      update: {},
      create: { modulo, comunicacionActiva: true },
    });
  }
  console.log(`ModuloConfig: ${MODULOS_CON_SWITCH.length} módulos cargados, todos con comunicación activa.`);
}

async function seedPermisos() {
  for (const p of PERMISOS_SEED) {
    await prisma.permisoModulo.upsert({
      where: { rol_modulo: { rol: p.rol, modulo: p.modulo } },
      update: { ver: !!p.ver, capturar: !!p.capturar, editar: !!p.editar, autoriza: !!p.autoriza },
      create: {
        rol: p.rol,
        modulo: p.modulo,
        ver: !!p.ver,
        capturar: !!p.capturar,
        editar: !!p.editar,
        autoriza: !!p.autoriza,
      },
    });
  }
  console.log(`PermisoModulo: ${PERMISOS_SEED.length} filas cargadas (matriz rol × módulo).`);
}

async function seedUsuarioBootstrap() {
  const existente = await prisma.usuario.findUnique({ where: { username: "director" } });
  if (existente) {
    console.log("Usuario bootstrap 'director' ya existe — no se toca.");
    return;
  }
  const passwordTemporal = randomBytes(9).toString("base64url");
  await prisma.usuario.create({
    data: {
      nombre: "Director General",
      username: "director",
      passwordHash: await hashPassword(passwordTemporal),
      rol: "director_general",
    },
  });
  console.log("\n=== Cuenta inicial creada — cámbiala en cuanto entres ===");
  console.log(`  usuario:     director`);
  console.log(`  contraseña:  ${passwordTemporal}`);
  console.log("==========================================================\n");
}

async function main() {
  await seedPersonal();
  await seedActividades();
  await seedConfigNomina();
  await seedModuloConfig();
  await seedPermisos();
  await seedUsuarioBootstrap();
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
