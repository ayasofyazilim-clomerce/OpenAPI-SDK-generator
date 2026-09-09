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

// hey-api's legacy `getResponseBody` returns undefined for any 2xx whose
// Content-Type falls outside its four branches: json, a six-entry binary
// allow-list, multipart, and text/*. An .xlsx download
// (application/vnd.openxmlformats-officedocument.spreadsheetml.sheet) matches
// none of them, so a perfectly good body is discarded and the caller ends up
// saving the string "undefined" with an .xlsx extension.
//
// The bug is identical in every legacy version (0.60.1 through 0.86.0) and the
// legacy client was deleted in 0.87.0, so there is no upstream fix to wait for.
// It can only be corrected here, on the generated output.
//
// `response.text()` appears exactly once in request.ts and is the last branch
// of the chain, which makes it a safe anchor to append after.
const TEXT_BRANCH_END =
  /(return\s+await\s+response\.text\(\)\s*;)(\r?\n)([ \t]*)\}/;

const ALREADY_PATCHED = /else\s+if\s*\(\s*response\.ok\s*\)/;

export function patchResponseBody(root = ".") {
  const file = path.join(root, CORE_DIR, "request.ts");
  const source = fs.readFileSync(file, "utf8");

  if (ALREADY_PATCHED.test(source)) return false;

  if (!TEXT_BRANCH_END.test(source)) {
    throw new Error(
      `sdk-generator: could not find the text/ branch of getResponseBody in ${file}. ` +
        "The hey-api legacy template has changed, so the binary-response patch " +
        "was NOT applied. Binary downloads (.xlsx and friends) will silently " +
        "corrupt until this is re-checked - see README.md.",
    );
  }

  const patched = source.replace(
    TEXT_BRANCH_END,
    (_match, ret, newline, indent) => {
      const unit = indent.includes("\t") ? "\t" : "  ";
      return [
        ret,
        `${newline}${indent}} else if (response.ok) {`,
        `${newline}${indent}${unit}return await response.blob();`,
        `${newline}${indent}}`,
      ].join("");
    },
  );

  fs.writeFileSync(file, patched);
  return true;
}
