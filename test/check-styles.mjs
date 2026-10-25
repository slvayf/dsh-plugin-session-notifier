/**
 * Static consistency check for the notifier panel.
 *
 *  - every literal `className` used in the component exists in the injected stylesheet;
 *  - every `h()` first argument is a DOM tag string or a locally defined component;
 *  - every rule with a non-zero `border-radius` also declares `corner-shape:round`,
 *    because the shipped theme puts `corner-shape:superellipse(1.5)` on `*` and the
 *    native controls opt back into circular corners explicitly.
 *
 * Run: node test/check-styles.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, '../client.js'), 'utf8');

const cssBlock = source.split('const CSS = [')[1].split('].join')[0];
const defined = new Set([...cssBlock.matchAll(/\.(sen-[a-zA-Z0-9-]+)/g)].map((match) => match[1]));

const classNameValues = [...source.matchAll(/className: ([^,\n}]+)/g)].map((match) => match[1].trim());
const literals = [];
const dynamic = [];
for (const value of classNameValues) {
  // A concatenated expression (`'sen-kind sen-kind-' + entry.kind`) is dynamic.
  if (value.includes('+')) {
    dynamic.push(value);
    continue;
  }
  if (value.startsWith("'")) {
    for (const token of value.slice(1, -1).split(/\s+/)) if (token !== '') literals.push(token);
  } else {
    dynamic.push(value);
  }
}

const missing = literals.filter((name) => !defined.has(name));

// Class names that appear inside a dynamic expression: a full class, or a prefix
// base such as `sen-kind-` that the runtime completes (`sen-kind-done`, …).
const dynamicTokens = new Set();
for (const value of dynamic) {
  for (const token of value.match(/sen-[a-zA-Z0-9-]+/g) ?? []) dynamicTokens.add(token);
}
const dynamicMissing = [...dynamicTokens].filter((name) => {
  if (defined.has(name)) return false;
  return ![...defined].some((candidate) => candidate.startsWith(name));
});

// The other direction: a declared class that no render path can reach is dead weight.
const usedTokens = new Set([...literals, ...dynamicTokens]);
const unused = [...defined].filter((name) => {
  if (usedTokens.has(name)) return false;
  return ![...dynamicTokens].some((token) => name.startsWith(token));
});

const components = new Set([...source.matchAll(/function ([A-Z][A-Za-z0-9]*)\(/g)].map((match) => match[1]));
const firstArgs = [...new Set([...source.matchAll(/\bh\(\s*\n?\s*([^,\n]+)/g)].map((match) => match[1].trim()))];
const badArgs = firstArgs.filter((arg) => {
  if (arg.startsWith("'") || arg.startsWith('"')) return false;
  return !components.has(arg);
});

// Rounded controls must opt out of the theme's global squircle.
const rules = [...cssBlock.matchAll(/'([^']*)'/g)].map((match) => match[1]);
const rounded = rules.filter((rule) => /border-radius:\s*(?!0(?![.\d]))/.test(rule));
const squircleLeaks = rounded.filter((rule) => !rule.includes('corner-shape:round'));

console.log('rounded rules:', rounded.length, '| missing corner-shape:round:', squircleLeaks.length ? squircleLeaks : 'none');
console.log('css classes defined:', defined.size);
console.log('literal classNames:', literals.length, '| missing:', missing.length ? missing : 'none');
console.log('dynamic class expressions:', dynamic);
console.log('dynamic classes missing:', dynamicMissing.length ? dynamicMissing : 'none');
console.log('unused css classes:', unused.length ? unused : 'none');
console.log('components:', [...components].join(', '));
console.log('h() first args:', firstArgs.join(' | '));
console.log('unresolved h() first args:', badArgs.length ? badArgs : 'none');

if (missing.length || dynamicMissing.length || unused.length || badArgs.length || squircleLeaks.length) {
  process.exitCode = 1;
  console.log('\nFAILED');
} else {
  console.log('\nOK');
}
