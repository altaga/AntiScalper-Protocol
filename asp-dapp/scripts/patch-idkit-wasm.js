/**
 * Postinstall: Expo Web cannot resolve idkit WASM via import.meta.url.
 * Copies wasm to /public and rewrites the loader URL (see Knowledge/world-id.md).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const wasmSrc = path.join(root, 'node_modules', '@worldcoin', 'idkit-core', 'dist', 'idkit_wasm_bg.wasm');
const wasmDestDir = path.join(root, 'public');
const wasmDest = path.join(wasmDestDir, 'idkit_wasm_bg.wasm');
const indexJs = path.join(root, 'node_modules', '@worldcoin', 'idkit-core', 'dist', 'index.js');

if (!fs.existsSync(wasmSrc)) {
  console.warn('[patch-idkit-wasm] wasm source missing — skip');
  process.exit(0);
}

fs.mkdirSync(wasmDestDir, { recursive: true });
fs.copyFileSync(wasmSrc, wasmDest);

if (fs.existsSync(indexJs)) {
  let src = fs.readFileSync(indexJs, 'utf8');
  const next = src.replace(
    /new URL\(\s*"idkit_wasm_bg\.wasm"\s*,\s*import\.meta\.url\s*\)/g,
    'new URL("/idkit_wasm_bg.wasm", window.location.origin)'
  );
  if (next !== src) {
    fs.writeFileSync(indexJs, next);
    console.log('[patch-idkit-wasm] patched idkit-core dist loader');
  } else if (src.includes('/idkit_wasm_bg.wasm')) {
    console.log('[patch-idkit-wasm] already patched');
  } else {
    console.warn('[patch-idkit-wasm] pattern not found — check idkit-core version');
  }
}

console.log('[patch-idkit-wasm] public/idkit_wasm_bg.wasm ready');
