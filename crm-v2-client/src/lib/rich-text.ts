/**
 * Rich-text storage helpers for activity bodies.
 *
 * Activity descriptions used to be plain text and most of the 5.5k rows in the
 * database still are. The composer now writes a small, fixed subset of HTML, so
 * every read path has to cope with both shapes: `looksLikeRichText` decides
 * which, `sanitizeRichText` makes untrusted markup safe to inject, and
 * `richTextToPlain` flattens either shape for previews, clamping and search.
 *
 * Nothing here trusts its input. The composer is the only writer today, but the
 * same column is reachable through the API, so sanitisation happens on read as
 * well as on write.
 */

/**
 * Tags the composer can produce. Anything outside this set is unwrapped — the
 * text survives, the element does not.
 */
const ALLOWED_TAGS = new Set([
  "B",
  "STRONG",
  "I",
  "EM",
  "U",
  "A",
  "UL",
  "OL",
  "LI",
  "P",
  "BR",
  "SPAN",
  "DIV",
]);

/** Tags whose *text* is as unwelcome as the tag itself. */
const DROP_ENTIRELY = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED"]);

/** `javascript:` and `data:` URLs are the whole reason this list is a list. */
const SAFE_URL = /^(https?:|mailto:|tel:)/i;

/** Class name used for an @mention chip. The only class value we let through. */
export const MENTION_CLASS = "crm-mention";

/** Tags that imply a line break when flattening markup back to plain text. */
const BLOCK_TAGS = new Set(["P", "DIV", "LI", "UL", "OL", "BR"]);

function unwrap(el: Element) {
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  parent.removeChild(el);
}

function scrub(node: Element) {
  // Snapshot: the loop body mutates the child list.
  for (const child of Array.from(node.children)) {
    const tag = child.tagName.toUpperCase();

    if (DROP_ENTIRELY.has(tag)) {
      child.remove();
      continue;
    }

    if (!ALLOWED_TAGS.has(tag)) {
      // Scrub before unwrapping — once the children are hoisted into `node`
      // this loop's snapshot will never visit them.
      scrub(child);
      unwrap(child);
      continue;
    }

    for (const attr of Array.from(child.attributes)) {
      const name = attr.name.toLowerCase();
      const keep =
        (tag === "A" &&
          name === "href" &&
          SAFE_URL.test(attr.value.trim())) ||
        (tag === "SPAN" && name === "class" && attr.value === MENTION_CLASS);
      if (!keep) child.removeAttribute(attr.name);
    }

    if (tag === "A") {
      // An anchor stripped of its href is just styled text; drop the element so
      // it stops looking clickable.
      if (!child.getAttribute("href")) {
        scrub(child);
        unwrap(child);
        continue;
      }
      child.setAttribute("target", "_blank");
      child.setAttribute("rel", "noopener noreferrer");
    }

    scrub(child);
  }
}

/**
 * Strips everything outside the composer's allowlist and returns markup that is
 * safe to hand to `dangerouslySetInnerHTML`.
 */
export function sanitizeRichText(html: string): string {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(
    `<div id="crm-rt-root">${html}</div>`,
    "text/html",
  );
  const root = doc.getElementById("crm-rt-root");
  if (!root) return "";
  scrub(root);
  return root.innerHTML;
}

/**
 * True when a stored description carries composer markup. Legacy rows are plain
 * text and must keep rendering as plain text — a stray `<` in someone's note
 * should not flip the whole body into HTML.
 */
export function looksLikeRichText(value?: string | null): boolean {
  if (!value) return false;
  return /<(b|strong|i|em|u|a|ul|ol|li|p|br|span|div)\b[^>]*>/i.test(value);
}

/**
 * Flattens either shape to plain text. Used for line-clamped previews, the
 * `title` attribute and anywhere a string (not a node) is required.
 */
export function richTextToPlain(value?: string | null): string {
  if (!value) return "";
  if (!looksLikeRichText(value)) return value;

  const doc = new DOMParser().parseFromString(
    `<div id="crm-rt-root">${value}</div>`,
    "text/html",
  );
  const root = doc.getElementById("crm-rt-root");
  if (!root) return "";

  let out = "";
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? "";
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    const isBlock = BLOCK_TAGS.has(el.tagName.toUpperCase());
    if (isBlock && out && !out.endsWith("\n")) out += "\n";
    // A list item reads as a bullet once the markup is gone.
    if (el.tagName === "LI") out += "• ";
    for (const child of Array.from(el.childNodes)) walk(child);
    if (isBlock && out && !out.endsWith("\n")) out += "\n";
  };
  for (const child of Array.from(root.childNodes)) walk(child);

  return out.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * True when the editor holds nothing a reader would see. contenteditable leaves
 * `<br>`, empty paragraphs and stray whitespace behind after a select-all
 * delete, all of which would otherwise save as a non-empty body.
 */
export function isRichTextEmpty(value?: string | null): boolean {
  // U+200B escaped rather than literal: a raw zero-width space in source is
  // invisible to the next reader and trips no-irregular-whitespace.
  return richTextToPlain(value).replace(/\u200B/g, "").trim().length === 0;
}
