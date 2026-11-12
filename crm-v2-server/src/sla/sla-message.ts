/**
 * Render the "Alert Message" an admin typed on the Lead SLA Config tab.
 *
 * Until 11 Sep 2026 that field was stored and never read — every breach
 * and escalation alert used hard-coded wording. A configured message wins;
 * `{lead}`, `{status}`, `{hours}` and `{duration}` are filled in when
 * present, and if the template never names the lead it is appended so the
 * alert still says which record it is about.
 */
export function slaAlertText(
  template: string | null | undefined,
  vars: { lead: string; status: string; hours?: number | string; duration?: string },
  fallback: string,
): string {
  const t = template?.trim();
  if (!t) return fallback;
  const filled = t
    .replace(/\{lead\}/gi, vars.lead)
    .replace(/\{status\}/gi, vars.status)
    .replace(/\{hours\}/gi, String(vars.hours ?? ''))
    .replace(/\{duration\}/gi, vars.duration ?? '');
  return /\{lead\}/i.test(t) || filled.includes(vars.lead)
    ? filled
    : `${filled} — Lead "${vars.lead}"`;
}
