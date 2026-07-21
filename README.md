# DigiLearn CRM — Source (Client + Server)

Complete source for the DigiLearn CRM v2 — the current build with all fixes applied. **No database or data is included** (code only).

## Contents
- `crm-v2-server/` — NestJS + PostgreSQL API
- `crm-v2-client/` — React + Vite frontend

## Fixes included in this build
- **Session 401** — concurrent logins no longer revoke each other's fresh sessions (`enforceActiveSessionLimit`)
- **500 outage** — real `pg` pool keepAlive/timeout options (the old mysql2-style keys were silently ignored)
- **`validate` hardening** — transient DB errors return a retryable 503 (not 500); guarded session update
- **Admin RBAC** — derived `role` so admins/sales-managers can see all invoices/quotes
- **WhatsApp display** — activity detail now shows the full message (`whatsapp_message` → `whatsapp` mapping)

## What is NOT included (by design)
- `node_modules/` — run `npm install` (or `bun install`) in each folder
- `.env` — copy `.env.example` to `.env` in each folder and fill in your values
- `dist/` build output, logs, and any database/data

## Run locally
1. **Server:** `cd crm-v2-server` → `npm install` → copy `.env.example` to `.env` (set DATABASE_* and JWT_SECRET_TOKEN) → `npm run start:prod` (serves on port 3001)
2. **Client:** `cd crm-v2-client` → `npm install` → copy `.env.example` to `.env` (set `VITE_PUBLIC_API_URL=http://localhost:3001/api/v2`) → `npm run dev` (serves on 5173)

The server needs a PostgreSQL database named `digilearn_crm`. In production (`NODE_ENV=production`) it runs migrations and seeds automatically on first boot.
