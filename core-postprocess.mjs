import fs from "node:fs";
import path from "node:path";

// Name of the single, shared core runtime folder kept at the generation root.
export const CORE_DIR = "core";

// hey-api emits an identical `core/` runtime inside every generated service.
// Rather than keep N duplicate copies, keep one at `<root>/core` and repoint
// every service's `./core/...` specifiers at it.
//
// The first service in a run donates its freshly generated core, so the shared
// copy always matches the version that just ran; later services drop theirs.
export function centralizeCore(serviceDir, alreadyCentralized, root = ".") {
  const sharedCore = path.join(root, CORE_DIR);
  const serviceCore = path.join(serviceDir, CORE_DIR);

  if (fs.existsSync(serviceCore)) {
    if (alreadyCentralized) {
      fs.rmSync(serviceCore, { recursive: true, force: true });
    } else {
      fs.rmSync(sharedCore, { recursive: true, force: true });
      fs.renameSync(serviceCore, sharedCore);
      alreadyCentralized = true;
    }
  }

  rewriteCoreImports(serviceDir);
  return alreadyCentralized;
}

// Rewrite `./core/...` specifiers to `../core/...`. The lookahead keeps the
// match scoped to module specifiers, and makes the rewrite idempotent:
// `'../core/...'` no longer matches.
export function rewriteCoreImports(serviceDir) {
  for (const entry of fs.readdirSync(serviceDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
    const filePath = path.join(serviceDir, entry.name);
    const source = fs.readFileSync(filePath, "utf8");
    const updated = source.replace(/(['"])\.\/core(?=['"/])/g, "$1../core");
    if (updated !== source) fs.writeFileSync(filePath, updated);
  }
}
