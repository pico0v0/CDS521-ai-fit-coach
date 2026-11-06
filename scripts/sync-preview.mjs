// Regenerate the file://-safe preview from the authoritative ES modules.
// Uses only Node.js built-ins: no bundler, install, server, or npm dependency.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const previewPath = resolve(root, 'preview.html');
let html = readFileSync(previewPath, 'utf8');
const begin = '// BEGIN GENERATED SOURCES — npm run preview:sync\n';
const end = '// END GENERATED SOURCES\n';
const startAt = html.indexOf(begin);
const endAt = html.indexOf(end, startAt + begin.length);
if (startAt < 0 || endAt < 0) {
  throw new Error('preview.html source markers not found');
}
const modules = [
  ['simulator.js', ['simulatePose', 'simulatedAngle']],
  ['exercise.js', ['checkPostureFault','extractJointAngle','EXERCISE_GUIDES','toPixelPoint']],
  ['draw.js', ['drawPose']],
];
const blocks = modules.map(([file, symbols]) => {
  const source = readFileSync(resolve(root, 'src', file), 'utf8')
    .replace(/\bexport\s+(?=(?:const|function|class)\b)/g, '');
  if (source.toLowerCase().includes('</script')) {
    throw new Error(`Cannot safely embed ${file} in HTML script`);
  }
  return `const { ${symbols.join(', ')} } = (() => {\n// Embedded src/${file} (generated; edit src/${file}, not this block)\n${source}\nreturn { ${symbols.join(', ')} };\n})();\n`;
}).join('\n');
const updated = html.slice(0, startAt + begin.length) + blocks + html.slice(endAt);
if (process.argv.includes('--check')) {
  if (updated !== html) {
    console.error('preview.html is out of sync. Run: npm run preview:sync');
    process.exitCode = 1;
  } else {
    console.log('preview.html matches all source ES modules');
  }
} else {
  writeFileSync(previewPath, updated);
  console.log('Refreshed standalone preview.html (works via file://)');
}
