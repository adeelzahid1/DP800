#!/usr/bin/env node
/**
 * Link checker for the DP-800 study portal content.
 *
 * Collects the real references in public/content — every `sources` entry plus
 * markdown links ([text](url)) inside text — requests each URL once and reports:
 *   - broken:     final response is 4xx/5xx, or the request failed/timed out
 *   - redirected: the URL works but moves somewhere else (update the content
 *                 to the final URL so it doesn't break later)
 *   - ok
 * Redirects that only add a query string (e.g. Learn's ?view=) or change a
 * trailing slash or letter case count as ok.
 *
 * Example URLs inside code samples and explanations (localhost, contoso,
 * {placeholders}) are deliberately not checked.
 *
 * Usage: node scripts/check-links.mjs [--concurrency 4] [--timeout 20000]
 *                                     [--json report.json] [--strict] [--only text]
 *   --strict  also fail (exit 1) on redirects
 *   --only    check only URLs containing this text
 * Exit code 1 when any link is broken (or redirected, with --strict).
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = join(ROOT, 'public', 'content');
const MAX_HOPS = 8;
const USER_AGENT = 'dp800-content-link-checker/1.0 (+static study portal; link validation)';

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const CONCURRENCY = Math.max(1, Number(arg('--concurrency', 4)));
const TIMEOUT_MS = Math.max(1000, Number(arg('--timeout', 20000)));
const JSON_OUT = arg('--json', null);
const ONLY = arg('--only', null);
const STRICT = process.argv.includes('--strict');

// ----- collect ---------------------------------------------------------------

function jsonFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...jsonFiles(p));
    else if (name.endsWith('.json')) out.push(p);
  }
  return out;
}

const MD_LINK_RE = /\]\((https?:\/\/[^)\s]+)\)/g;

/** url -> Set of "file#where" locations */
const found = new Map();

function addUrl(url, where) {
  const clean = url.replace(/[.,;:!?]+$/, '');
  if (ONLY && !clean.includes(ONLY)) return;
  if (!found.has(clean)) found.set(clean, new Set());
  found.get(clean).add(where);
}

function walk(node, file, where, key = '') {
  const loc = `${file}${where ? ' ' + where : ''}`;
  if (typeof node === 'string') {
    if (key === 'sources' && /^https?:\/\//.test(node)) addUrl(node, loc);
    else for (const m of node.matchAll(MD_LINK_RE)) addUrl(m[1], loc);
  } else if (Array.isArray(node)) {
    node.forEach((child) => walk(child, file, where, key));
  } else if (node && typeof node === 'object') {
    // Name questions by id so the report points at the right item.
    const here = typeof node.id === 'string' && typeof node.type === 'string' ? node.id : where;
    for (const [k, value] of Object.entries(node)) walk(value, file, here, k);
  }
}

for (const path of jsonFiles(CONTENT)) {
  const rel = relative(ROOT, path).replaceAll('\\', '/');
  try {
    walk(JSON.parse(readFileSync(path, 'utf8')), rel, '');
  } catch (e) {
    console.error(`Skipping ${rel}: ${e.message}`);
  }
}

// ----- check -----------------------------------------------------------------

function normalize(url) {
  const u = new URL(url);
  u.search = '';
  u.hash = '';
  return u.toString().replace(/\/$/, '').toLowerCase();
}

async function request(url, method) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      method,
      redirect: 'manual',
      signal: controller.signal,
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml,*/*;q=0.8' },
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Follow redirects by hand so the chain can be reported. */
async function check(url) {
  const chain = [];
  let current = url;
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    let res = await request(current, 'HEAD');
    // Some servers reject or mishandle HEAD; confirm with GET before calling it broken.
    if (res.status >= 400) {
      res.body?.cancel();
      res = await request(current, 'GET');
    }
    res.body?.cancel();
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      const next = new URL(res.headers.get('location'), current).toString();
      chain.push({ status: res.status, to: next });
      current = next;
      continue;
    }
    return { status: res.status, final: current, chain };
  }
  return { status: 0, final: current, chain, error: `more than ${MAX_HOPS} redirects` };
}

async function checkWithRetry(url) {
  try {
    const r = await check(url);
    if (r.status >= 500 || r.status === 429) {
      await new Promise((ok) => setTimeout(ok, 2000));
      return await check(url);
    }
    return r;
  } catch (e) {
    try {
      await new Promise((ok) => setTimeout(ok, 1000));
      return await check(url);
    } catch (e2) {
      return { status: 0, final: url, chain: [], error: e2.name === 'AbortError' ? 'timeout' : String(e2.message ?? e2) };
    }
  }
}

function classify(url, r) {
  if (r.error || r.status === 0 || r.status >= 400) return 'broken';
  if (r.chain.length === 0) return 'ok';
  return normalize(r.final) === normalize(url) ? 'ok' : 'redirected';
}

const urls = [...found.keys()].sort();
console.log(`Checking ${urls.length} unique URLs (concurrency ${CONCURRENCY})…`);

const results = [];
let next = 0;
let done = 0;
async function worker() {
  while (next < urls.length) {
    const url = urls[next++];
    const r = await checkWithRetry(url);
    results.push({ url, ...r, result: classify(url, r), usedIn: [...found.get(url)].sort() });
    done++;
    if (process.stdout.isTTY) process.stdout.write(`\r${done}/${urls.length}`);
  }
}
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, urls.length) }, worker));
if (process.stdout.isTTY) process.stdout.write('\n');

// ----- report ----------------------------------------------------------------

results.sort((a, b) => a.url.localeCompare(b.url));
const broken = results.filter((r) => r.result === 'broken');
const redirected = results.filter((r) => r.result === 'redirected');

function where(r) {
  const list = r.usedIn.slice(0, 5).join('\n      ');
  return r.usedIn.length > 5 ? `${list}\n      … and ${r.usedIn.length - 5} more` : list;
}

if (redirected.length) {
  console.log(`\n--- ${redirected.length} redirected ---`);
  for (const r of redirected) console.log(`REDIRECT ${r.url}\n  -> ${r.final}\n  used in:\n      ${where(r)}`);
}
if (broken.length) {
  console.log(`\n--- ${broken.length} broken ---`);
  for (const r of broken) console.log(`BROKEN   ${r.url}  (${r.error ?? 'HTTP ' + r.status})\n  used in:\n      ${where(r)}`);
}

const okCount = results.length - broken.length - redirected.length;
console.log(`\n${okCount} ok · ${redirected.length} redirected · ${broken.length} broken`);

if (JSON_OUT) {
  writeFileSync(JSON_OUT, JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2) + '\n');
  console.log(`Report written to ${JSON_OUT}`);
}

if (broken.length > 0 || (STRICT && redirected.length > 0)) process.exit(1);
