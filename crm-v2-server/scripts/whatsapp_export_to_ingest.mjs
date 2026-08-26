#!/usr/bin/env node
/**
 * #5 — WhatsApp ingestion connector (export-file path).
 *
 * DECISION (2026-05-29): ship the export-file path now (no WhatsApp
 * Business API dependency); a webhook can replace this later. This
 * reads a normalized WhatsApp export and POSTs it to the CRM's
 * /automation/ingest/whatsapp endpoint (built in the automation module),
 * which records each message as a `whatsapp` activity (idempotent).
 *
 * PRIVACY: only messages already mapped to a CRM lead are ingested;
 * rows without leadId are skipped server-side. Do not export message
 * bodies anywhere else. Run this on a trusted machine with a
 * service-account token.
 *
 * Usage:
 *   node whatsapp_export_to_ingest.mjs --file export.json \
 *        --api http://crm-v2-api.caprover-root.clearhue.online/api/v2 \
 *        --token "$CRM_TOKEN"
 *
 * Expected export.json: an array of objects, each with (aliases tolerated):
 *   externalId|id, leadId, phone|from, body|text|message, direction, timestamp|time
 */
import { readFileSync } from 'node:fs';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const file = arg('file');
const api = arg('api', process.env.CRM_API);
const token = arg('token', process.env.CRM_TOKEN);
if (!file || !api || !token) {
  console.error('Required: --file <export.json> --api <baseUrl> --token <bearer> (api/token may come from CRM_API/CRM_TOKEN).');
  process.exit(2);
}

const raw = JSON.parse(readFileSync(file, 'utf8'));
const rows = Array.isArray(raw) ? raw : raw.messages ?? [];

const normalize = (m) => ({
  externalId: String(m.externalId ?? m.id ?? ''),
  leadId: m.leadId ?? m.lead_id ?? null,
  phone: String(m.phone ?? m.from ?? ''),
  body: String(m.body ?? m.text ?? m.message ?? ''),
  direction: (m.direction ?? 'inbound').toLowerCase() === 'outbound' ? 'outbound' : 'inbound',
  timestamp: new Date(m.timestamp ?? m.time ?? Date.now()).toISOString(),
});

const messages = rows.map(normalize).filter((m) => m.externalId && m.body);
console.log(`Prepared ${messages.length} message(s) from ${file}`);

const res = await fetch(`${api.replace(/\/$/, '')}/automation/ingest/whatsapp`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ messages }),
});

if (!res.ok) {
  console.error(`Ingest failed: HTTP ${res.status} ${await res.text()}`);
  process.exit(1);
}
console.log('Ingest result:', JSON.stringify(await res.json(), null, 2));
