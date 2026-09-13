// Copies the IBM Plex faces the app uses from the Fontsource packages into public/fonts, so the
// files are versioned with the package and the app still self hosts them for offline use.
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const sans = dirname(require.resolve('@fontsource-variable/ibm-plex-sans/package.json'));
const mono = dirname(require.resolve('@fontsource/ibm-plex-mono/package.json'));
const out = join(dirname(new URL(import.meta.url).pathname), '..', 'public', 'fonts');
mkdirSync(out, { recursive: true });
const files = [
  [join(sans, 'files', 'ibm-plex-sans-latin-wght-normal.woff2'), 'IBMPlexSans-latin.woff2'],
  [join(sans, 'files', 'ibm-plex-sans-latin-ext-wght-normal.woff2'), 'IBMPlexSans-latin-ext.woff2'],
  [join(mono, 'files', 'ibm-plex-mono-latin-400-normal.woff2'), 'IBMPlexMono-400-latin.woff2'],
  [join(mono, 'files', 'ibm-plex-mono-latin-500-normal.woff2'), 'IBMPlexMono-500-latin.woff2'],
  [join(sans, 'LICENSE'), 'OFL.txt'],
];
for (const [from, to] of files) copyFileSync(from, join(out, to));
console.log(`copied ${files.length} files to public/fonts`);
