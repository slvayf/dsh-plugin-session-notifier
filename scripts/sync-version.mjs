/**
 * Keep the version the panel displays in step with package.json.
 *
 * npm runs the `version` lifecycle script after the bump and before the release
 * commit, so a release can never ship a panel that reports another number.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const file = resolve(root, 'client.js');
const source = readFileSync(file, 'utf8');
const pattern = /const PLUGIN_VERSION = '[^']*';/;
if (!pattern.test(source)) {
  console.error('[version] client.js has no PLUGIN_VERSION constant to update');
  process.exit(1);
}
const next = source.replace(pattern, `const PLUGIN_VERSION = '${version}';`);

if (next === source) {
  console.log(`[version] client.js already reports ${version}`);
} else {
  writeFileSync(file, next);
  console.log(`[version] client.js now reports ${version}`);
}
