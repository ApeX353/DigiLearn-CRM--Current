import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * What commit is actually running here?
 *
 * Until now there was no way to answer that from outside the box, so
 * "did my change deploy?" could only be settled by fingerprinting
 * string literals in the minified bundle. That is how a deploy built
 * from a stale branch went unnoticed for weeks: the `staging` branch is
 * 49 commits behind `main` and 68 commits ahead on a different line, so
 * features present on main were simply absent from the deploy — which
 * looked, from the outside, like commits undoing each other.
 *
 * Resolution order, first hit wins:
 *   1. an explicit env var (every CI/PaaS sets one of these)
 *   2. build-info.json, written at build time by scripts/write-build-info.js
 *   3. git, if the deploy kept its .git directory
 *   4. "unknown" — never throws; a version endpoint must not be able to
 *      take the API down.
 */
export interface BuildInfo {
  commit: string;
  shortCommit: string;
  branch: string;
  builtAt: string;
  source: 'env' | 'build-info.json' | 'git' | 'unknown';
}

const ENV_COMMIT_KEYS = [
  'GIT_COMMIT',
  'GIT_COMMIT_SHA',
  'SOURCE_COMMIT',
  'SOURCE_VERSION',
  'COMMIT_SHA',
  'RENDER_GIT_COMMIT',
  'VERCEL_GIT_COMMIT_SHA',
  'GITHUB_SHA',
  'HEROKU_SLUG_COMMIT',
];
const ENV_BRANCH_KEYS = [
  'GIT_BRANCH',
  'SOURCE_BRANCH',
  'RENDER_GIT_BRANCH',
  'VERCEL_GIT_COMMIT_REF',
  'GITHUB_REF_NAME',
];

function firstEnv(keys: string[]): string | undefined {
  for (const k of keys) {
    const v = process.env[k];
    if (v && v.trim()) return v.trim();
  }
  return undefined;
}

let cached: BuildInfo | null = null;

export function getBuildInfo(): BuildInfo {
  if (cached) return cached;

  const envCommit = firstEnv(ENV_COMMIT_KEYS);
  if (envCommit) {
    cached = {
      commit: envCommit,
      shortCommit: envCommit.slice(0, 7),
      branch: firstEnv(ENV_BRANCH_KEYS) ?? 'unknown',
      builtAt: process.env.BUILD_TIME ?? 'unknown',
      source: 'env',
    };
    return cached;
  }

  // dist/main.js sits one level under the package root; src/common two.
  for (const dir of [__dirname, join(__dirname, '..'), join(__dirname, '..', '..')]) {
    const file = join(dir, 'build-info.json');
    try {
      if (existsSync(file)) {
        const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<BuildInfo>;
        if (parsed.commit) {
          cached = {
            commit: parsed.commit,
            shortCommit: parsed.commit.slice(0, 7),
            branch: parsed.branch ?? 'unknown',
            builtAt: parsed.builtAt ?? 'unknown',
            source: 'build-info.json',
          };
          return cached;
        }
      }
    } catch {
      // A malformed file must not break the endpoint — fall through.
    }
  }

  try {
    const commit = execSync('git rev-parse HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    cached = {
      commit,
      shortCommit: commit.slice(0, 7),
      branch,
      builtAt: 'unknown',
      source: 'git',
    };
    return cached;
  } catch {
    cached = {
      commit: 'unknown',
      shortCommit: 'unknown',
      branch: 'unknown',
      builtAt: 'unknown',
      source: 'unknown',
    };
    return cached;
  }
}
