# CBF ERP

ERP a la medida para Chula Brand Farms (papaya, Campeche). Ver [docs/spec-snapshot.md](docs/spec-snapshot.md) para la especificación completa de negocio (documento vivo — el `.docx` original es la fuente autoritativa).

## Stack

- Base de datos: MySQL
- Backend/API: Node.js + TypeScript + Express + Prisma
- Web (oficina/gerencia): React + Vite + TypeScript
- Móvil (campo, offline-first): React Native — fase posterior
- Hosting: DigitalOcean

## Estructura del monorepo

```
backend/   API REST, lógica de negocio, esquema Prisma/MySQL
web/       App web (React) para roles de oficina/gerencia
shared/    Tipos y fórmulas de cálculo compartidas entre backend y clientes
mobile/    App de campo offline-first (React Native) — se construye después de estabilizar la API
docs/      Especificación de negocio y notas de arquitectura
```

## Orden de construcción V1

Nómina → Recursos Humanos → Unidades de Producción → Almacén → Compras → Equipos y Maquinaria → Aplicaciones → Fertilizantes → Riego.

Fuera de alcance de V1: Cosecha, Empaque, Embarques, Contabilidad, Auditoría (UI), Panel Ejecutivo.

## Desarrollo

```bash
npm install
cp backend/.env.example backend/.env   # configurar credenciales de MySQL local
cp web/.env.example web/.env           # VITE_API_URL, por defecto http://localhost:4000
npm run build:shared                    # compila @cbf/shared antes de usarlo (dev:backend y seed ya lo hacen solos)
npm run prisma:migrate
npm run seed                            # imprime la contraseña inicial del usuario "director" — cámbiala
npm run dev:backend
npm run dev:web
```

Con eso, la web queda en `http://localhost:5173` y el API en `http://localhost:4000`.
