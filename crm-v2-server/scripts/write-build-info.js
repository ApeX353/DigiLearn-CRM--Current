/**
 * Stamp the build with the commit it came from.
 *
 * Runs automatically before `npm run build` (prebuild). Writes
 * build-info.json next to the package root; getBuildInfo() reads it when
 * no CI/PaaS env var is present, so `GET /api/v2/version` can always
 * answer "which commit is this?" even in a container with no .git.
 *
 * Never fails the build: if the commit cannot be determined the file
 * records "unknown" and the deploy continues.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const envFirst = (keys) => {
  for (const k of keys) {
    const v = process.env[k];
    if (v && v.trim()) return v.trim();
  }
  return undefined;
};

const git = (cmd) => {
  try {
    return execSync(cmd, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      cwd: path.join(__dirname, '..'),
    }).trim();
  } catch {
    return undefined;
  }
};

const commit =
  envFirst([
    'GIT_COMMIT',
    'GIT_COMMIT_SHA',
    'SOURCE_COMMIT',
    'SOURCE_VERSION',
    'COMMIT_SHA',
    'RENDER_GIT_COMMIT',
    'VERCEL_GIT_COMMIT_SHA',
    'GITHUB_SHA',
    'HEROKU_SLUG_COMMIT',
  ]) ||
  git('git rev-parse HEAD') ||
  'unknown';

const branch =
  envFirst([
    'GIT_BRANCH',
    'SOURCE_BRANCH',
    'RENDER_GIT_BRANCH',
    'VERCEL_GIT_COMMIT_REF',
    'GITHUB_REF_NAME',
  ]) ||
  git('git rev-parse --abbrev-ref HEAD') ||
  'unknown';

const info = {
  commit,
  branch,
  builtAt: new Date().toISOString(),
};

const out = path.join(__dirname, '..', 'build-info.json');

// We hand-deploy from the workstation, and `caprover deploy` ships a git
// archive — so the container build has no .git and no CI commit variable.
// This script runs again in there as a prebuild hook, and would happily
// overwrite the real stamp with "unknown", making the version endpoint
// useless exactly where it matters. So: a resolved stamp always beats an
// unresolved one. The workstation writes the truth, the container keeps it.
if (commit === 'unknown' && fs.existsSync(out)) {
  try {
    const prev = JSON.parse(fs.readFileSync(out, 'utf8'));
    if (prev.commit && prev.commit !== 'unknown') {
      console.log(`build-info: keeping ${prev.commit.slice(0, 7)} from the deploy archive`);
      process.exit(0);
    }
  } catch {
    // unreadable stamp — fall through and write a fresh one
  }
}

fs.writeFileSync(out, JSON.stringify(info, null, 2) + '\n');

// The client bundle is stamped by a Vite plugin that cannot reach git
// inside the container either, so it reads this same file. Writing both
// here keeps it to one command before a deploy.
const clientOut = path.join(
  __dirname,
  '..',
  '..',
  'crm-v2-client',
  'build-info.json',
);
try {
  if (fs.existsSync(path.dirname(clientOut))) {
    fs.writeFileSync(clientOut, JSON.stringify(info, null, 2) + '\n');
  }
} catch {
  // the client package may not be present in a server-only checkout
}
console.log(
  `build-info: ${info.commit.slice(0, 7)} on ${info.branch} at ${info.builtAt}`,
);
