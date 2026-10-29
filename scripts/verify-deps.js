#!/usr/bin/env node
/**
 * Fails fast when node_modules doesn't match package.json / package-lock.json —
 * typically after `git pull` without `npm install`. Without this, Metro reports
 * confusing errors like `Unable to resolve "react-native-web/dist/index"`.
 * Runs automatically before `npm start`, `npm run web`, `npm run ios` and `npm run android`.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const wanted = { ...pkg.dependencies, ...pkg.devDependencies };

const missing = Object.keys(wanted).filter(
  (name) => !fs.existsSync(path.join(root, 'node_modules', name, 'package.json')),
);

// npm records the last install in node_modules/.package-lock.json. If the project's
// lockfile changed after that (e.g. a pull brought new dependencies), the install is stale.
const lock = path.join(root, 'package-lock.json');
const installed = path.join(root, 'node_modules', '.package-lock.json');
const stale =
  fs.existsSync(lock) &&
  fs.existsSync(installed) &&
  fs.statSync(lock).mtimeMs > fs.statSync(installed).mtimeMs + 1000;

if (missing.length > 0 || stale) {
  const red = (s) => `\x1b[31m${s}\x1b[0m`;
  console.error(red('\n✖ Dependencies are out of date.'));
  if (missing.length > 0)
    console.error(`  Not installed: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? ', …' : ''}`);
  else console.error('  package-lock.json changed since your last install.');
  console.error('\n  Fix:  npm install\n');
  process.exit(1);
}
