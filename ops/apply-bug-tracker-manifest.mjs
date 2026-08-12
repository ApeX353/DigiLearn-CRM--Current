import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const manifestPath = fileURLToPath(
  new URL('./tracker-partials-2026-08-12.json', import.meta.url),
);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const apply = process.argv.includes('--apply');
const token = process.env.CRM_ACCESS_TOKEN?.trim();
const baseUrl = (process.env.CRM_API_URL || 'https://api.digilearncrm.work/api/v2')
  .replace(/\/$/, '');

if (!token) {
  console.error(
    'CRM_ACCESS_TOKEN is required. The script never reads repository credential files. Run without --apply for a live authenticated dry-run.',
  );
  process.exit(2);
}

const headers = {
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
};

let changed = 0;
for (const ticket of manifest.tickets) {
  const response = await fetch(`${baseUrl}/bug-reports/${ticket.id}`, {
    headers,
  });
  if (!response.ok) {
    throw new Error(`${ticket.code}: GET failed with HTTP ${response.status}`);
  }
  const current = (await response.json()).data;
  if (current.id !== ticket.id || !current.title.startsWith(ticket.expectedTitlePrefix)) {
    throw new Error(
      `${ticket.code}: identity guard failed; expected ${ticket.id} / ${ticket.expectedTitlePrefix}, got ${current.id} / ${current.title}`,
    );
  }

  const currentByDtoKey = {
    title: current.title,
    description: current.description,
    status: current.status,
    workType: current.work_type,
    severity: current.severity,
    priority: current.priority,
    component: current.component,
    labels: current.labels,
  };
  const patch = Object.fromEntries(
    Object.entries(ticket.patch).filter(
      ([key, value]) => JSON.stringify(currentByDtoKey[key]) !== JSON.stringify(value),
    ),
  );

  if (Object.keys(patch).length === 0) {
    console.log(`${ticket.code}: already current`);
    continue;
  }
  console.log(`${ticket.code}: ${apply ? 'APPLY' : 'DRY RUN'} ${Object.keys(patch).join(', ')}`);
  if (!apply) continue;

  const update = await fetch(`${baseUrl}/bug-reports/${ticket.id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(patch),
  });
  if (!update.ok) {
    const body = await update.text();
    throw new Error(
      `${ticket.code}: PATCH failed with HTTP ${update.status}: ${body.slice(0, 500)}`,
    );
  }
  changed += 1;
}

console.log(
  apply
    ? `Applied ${changed} guarded ticket correction(s).`
    : 'Dry run complete. Re-run with --apply only after reviewing the diff above.',
);
