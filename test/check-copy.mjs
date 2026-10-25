/**
 * Copy checks for the notifier panel.
 *
 *  - the Chinese and English dictionaries define exactly the same keys;
 *  - every key is reachable from code (a literal `t('…')` or a `'prefix.' + value` family);
 *  - every literal `t('…')` key exists;
 *  - no copy carries a semicolon, matching the project's punctuation rule;
 *  - the package-level locale resources (read by the plugin manager) stay in step.
 *
 * Run: node test/check-copy.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const source = readFileSync(resolve(root, 'client.js'), 'utf8');

const zhStart = source.indexOf('const zh = {');
const enStart = source.indexOf('const en = {');
const enEnd = source.indexOf('//#endregion', enStart);
if (zhStart < 0 || enStart < 0 || enEnd < 0) throw new Error('could not locate the dictionaries');

/** @returns `key → value` pairs from one dictionary literal. */
function parseDict(text) {
  const pairs = new Map();
  for (const match of text.matchAll(/^\s*'([^']+)':\s*'((?:[^'\\]|\\.)*)',?\s*$/gm)) {
    pairs.set(match[1], match[2].replace(/\\'/g, "'"));
  }
  return pairs;
}

const zh = parseDict(source.slice(zhStart, enStart));
const en = parseDict(source.slice(enStart, enEnd));

const problems = [];
if (zh.size === 0 || en.size === 0) problems.push('a dictionary parsed as empty');

for (const key of zh.keys()) if (!en.has(key)) problems.push(`missing in en: ${key}`);
for (const key of en.keys()) if (!zh.has(key)) problems.push(`missing in zh: ${key}`);

// Keys reach `t` three ways: a literal call, a `*Key` prop handed to Row/Section,
// or a `'prefix.' + value` family.
const literalKeys = new Set([...source.matchAll(/\bt\('([^']+)'(?=\s*[,)])/g)].map((match) => match[1]));
const propKeys = new Set([...source.matchAll(/(?:titleKey|descriptionKey|noteKey): '([^']+)'/g)].map((match) => match[1]));
const families = new Set([...source.matchAll(/\bt\('([a-z]+)\.' \+/g)].map((match) => `${match[1]}.`));

const coveredByFamily = (key) => [...families].some((prefix) => key.startsWith(prefix));
for (const key of zh.keys()) {
  if (!literalKeys.has(key) && !propKeys.has(key) && !coveredByFamily(key)) problems.push(`unreferenced copy: ${key}`);
}
for (const key of new Set([...literalKeys, ...propKeys])) {
  if (!zh.has(key)) problems.push(`unknown key used in code: ${key}`);
}

for (const [dict, pairs] of [['zh', zh], ['en', en]]) {
  for (const [key, value] of pairs) {
    if (value.trim() === '') problems.push(`empty ${dict} copy: ${key}`);
    if (value.includes(';') || value.includes('；')) problems.push(`semicolon in ${dict} copy: ${key}`);
  }
}

for (const [locale, dictionary] of [['zh', zh], ['en', en]]) {
  const document = JSON.parse(readFileSync(resolve(root, `locale/${locale}.json`), 'utf8'));
  const meta = document.meta ?? {};
  if (typeof meta.title !== 'string' || meta.title.trim() === '') problems.push(`locale/${locale}.json meta.title`);
  if (typeof meta.description !== 'string' || meta.description.trim() === '') problems.push(`locale/${locale}.json meta.description`);
  // The plugin manager shows these two lines; they must read exactly like the panel.
  if (meta.title !== dictionary.get('panel.title')) problems.push(`locale/${locale}.json title must equal panel.title`);
  if (meta.description !== dictionary.get('panel.desc')) problems.push(`locale/${locale}.json description must equal panel.desc`);
}

console.log('zh keys:', zh.size, '| en keys:', en.size);
console.log('literal keys:', literalKeys.size, '| prop keys:', propKeys.size, '| dynamic families:', [...families].join(' ') || 'none');
if (problems.length > 0) {
  console.log('\nproblems:');
  for (const problem of problems) console.log(' -', problem);
  process.exitCode = 1;
  console.log('\nFAILED');
} else {
  console.log('\nOK');
}
