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
cp web/.env.example web/.env           # VITE_API_URL, por defecto http://localhost:4000/api
npm run build:shared                    # compila @cbf/shared antes de usarlo (dev:backend y seed ya lo hacen solos)
npm run prisma:migrate
npm run seed                            # imprime la contraseña inicial del usuario "director" — cámbiala
npm run dev:backend
npm run dev:web
```

Con eso, la web queda en `http://localhost:5173` y el API en `http://localhost:4000`.

## Producción (siempre encendido)

- El backend corre solo al iniciar Windows (`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\CBF-ERP-Backend.bat`, que llama a `ops/run-backend.bat`) y se reinicia solo si el proceso se cae.
- Respaldo diario automático de la base de datos a las 3:00 a.m. (tarea programada de Windows "CBF-ERP-Backup-Diario"), guardado en `C:\Users\Admin\CBF-ERP-Backups\` — fuera del repositorio, y se borran los de más de 30 días. El script vive en `ops/backup-db.bat` (no está en git porque lleva la contraseña de la base de datos).
- Tras editar backend: `npm run build --workspace=backend` y reiniciar el proceso de Node (`dist/server.js`).
- Tras editar la web: desde `web/`, `VITE_API_URL="/api" npx vite build` — el backend sirve `web/dist` directamente, no hace falta reiniciarlo.
