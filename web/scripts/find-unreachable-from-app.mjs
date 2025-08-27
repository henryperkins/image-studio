#!/usr/bin/env node
/**
 * Find files in web/src that are not reachable from web/src/ui/App.tsx.
 * - Resolves Vite aliases for `@/*` and tsconfig `paths` as defined in this repo
 * - Follows static `import ... from '...'`, `export ... from '...'`, and `import('...')`
 * - Considers only local files under web/src with extensions: .ts, .tsx, .js, .jsx
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC_DIR = path.resolve(ROOT, 'src');
const ENTRY = path.resolve(SRC_DIR, 'ui', 'App.tsx');

const EXTS = ['.ts', '.tsx', '.js', '.jsx'];

/** @type {Set<string>} */
const visited = new Set();
/** @type {Map<string, Set<string>>} */
const graph = new Map();

/** Resolve an import specifier to a file under web/src if possible. */
function resolveImport(importer, spec) {
  // Ignore CSS and assets
  if (/[.](css|scss|sass|less|svg|png|jpg|jpeg|gif|webp|mp4|mp3|wav)$/i.test(spec)) return null;

  // Alias '@/' -> SRC_DIR
  if (spec.startsWith('@/')) {
    const base = path.resolve(SRC_DIR, spec.slice(2));
    return resolveAsFileOrDir(base);
  }

  // Relative paths
  if (spec.startsWith('./') || spec.startsWith('../')) {
    const base = path.resolve(path.dirname(importer), spec);
    // If the spec already includes an extension, return it if exists
    const ext = path.extname(base);
    if (ext) {
      if (fs.existsSync(base) && isSrcFile(base)) return base;
      return null;
    }
    return resolveAsFileOrDir(base);
  }

  // Path alias to shared lib – treat as external for this analysis
  if (spec.startsWith('@image-studio/')) return null;

  // Bare module (node_modules) – external
  return null;
}

function resolveAsFileOrDir(baseNoExt) {
  // Try as file with known extensions
  for (const ext of EXTS) {
    const f = baseNoExt + ext;
    if (fs.existsSync(f) && isSrcFile(f)) return f;
  }
  // Try as directory with index file
  if (fs.existsSync(baseNoExt) && fs.statSync(baseNoExt).isDirectory()) {
    for (const ext of EXTS) {
      const idx = path.join(baseNoExt, 'index' + ext);
      if (fs.existsSync(idx) && isSrcFile(idx)) return idx;
    }
  }
  return null;
}

function isSrcFile(p) {
  return p.startsWith(SRC_DIR + path.sep) && EXTS.includes(path.extname(p));
}

/** Extract static import specifiers from a file. */
function extractImports(file) {
  const src = fs.readFileSync(file, 'utf8');
  const specs = new Set();
  const importRe = /\bimport\s+(?:[^'"()]*?from\s*)?['"]([^'"]+)['"];?/g;
  const exportRe = /\bexport\s+[^;]*?from\s+['"]([^'"]+)['"];?/g;
  const dynRe = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m;
  while ((m = importRe.exec(src))) specs.add(m[1]);
  while ((m = exportRe.exec(src))) specs.add(m[1]);
  while ((m = dynRe.exec(src))) specs.add(m[1]);
  return [...specs];
}

function walk(file) {
  if (visited.has(file)) return;
  visited.add(file);
  const deps = new Set();
  graph.set(file, deps);
  let specs = [];
  try {
    specs = extractImports(file);
  } catch (e) {
    console.error('Failed reading', file, e.message);
    return;
  }
  for (const spec of specs) {
    const resolved = resolveImport(file, spec);
    if (resolved) {
      deps.add(resolved);
      walk(resolved);
    }
  }
}

function listAllSrcFiles() {
  /** @type {string[]} */
  const out = [];
  function rec(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) rec(p);
      else if (isSrcFile(p)) out.push(p);
    }
  }
  rec(SRC_DIR);
  return out;
}

// Build graph from entry
walk(ENTRY);

// Compute unreachable files
const all = new Set(listAllSrcFiles());
// Exclude tests by convention
for (const f of Array.from(all)) {
  if (/__tests__|[.]test[.]/.test(f)) all.delete(f);
}

const reachable = visited;
const unreachable = [...all].filter((f) => !reachable.has(f));

console.warn(JSON.stringify({
  entry: path.relative(ROOT, ENTRY),
  reachableCount: reachable.size,
  totalFiles: all.size,
  unreachableCount: unreachable.length,
  unreachable: unreachable.map((f) => path.relative(ROOT, f)).sort()
}, null, 2));

