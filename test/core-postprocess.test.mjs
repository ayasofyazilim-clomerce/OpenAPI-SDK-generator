import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CORE_DIR, centralizeCore, rewriteCoreImports, patchResponseBody } from "../core-postprocess.mjs";

// Builds a throwaway generation root holding one service that still has its
// own freshly generated `core/`, the way hey-api leaves it.
function makeRoot(serviceNames) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sdkgen-"));
  for (const name of serviceNames) {
    const dir = path.join(root, name);
    fs.mkdirSync(path.join(dir, CORE_DIR), { recursive: true });
    fs.writeFileSync(path.join(dir, CORE_DIR, "request.ts"), "// core runtime\n");
    fs.writeFileSync(
      path.join(dir, `${name}Client.ts`),
      [
        "import type { BaseHttpRequest } from './core/BaseHttpRequest';",
        "import { OpenAPI } from \"./core/OpenAPI\";",
        "export * from './sdk.gen';",
      ].join("\n"),
    );
  }
  return root;
}

test("first service donates its core to the shared folder", () => {
  const root = makeRoot(["AService"]);
  const centralized = centralizeCore(path.join(root, "AService"), false, root);

  assert.equal(centralized, true);
  assert.ok(fs.existsSync(path.join(root, CORE_DIR, "request.ts")));
  assert.equal(fs.existsSync(path.join(root, "AService", CORE_DIR)), false);
});

test("later services drop their duplicate core", () => {
  const root = makeRoot(["AService", "BService"]);
  centralizeCore(path.join(root, "AService"), false, root);
  const centralized = centralizeCore(path.join(root, "BService"), true, root);

  assert.equal(centralized, true);
  assert.equal(fs.existsSync(path.join(root, "BService", CORE_DIR)), false);
  assert.ok(fs.existsSync(path.join(root, CORE_DIR, "request.ts")));
});

test("core specifiers are repointed one level up", () => {
  const root = makeRoot(["AService"]);
  centralizeCore(path.join(root, "AService"), false, root);

  const src = fs.readFileSync(path.join(root, "AService", "AServiceClient.ts"), "utf8");
  assert.match(src, /from '\.\.\/core\/BaseHttpRequest'/);
  assert.match(src, /from "\.\.\/core\/OpenAPI"/);
  assert.doesNotMatch(src, /'\.\/core\//);
  assert.doesNotMatch(src, /"\.\/core\//);
});

test("unrelated specifiers are left alone", () => {
  const root = makeRoot(["AService"]);
  centralizeCore(path.join(root, "AService"), false, root);

  const src = fs.readFileSync(path.join(root, "AService", "AServiceClient.ts"), "utf8");
  assert.match(src, /from '\.\/sdk\.gen'/);
});

test("rewriting twice is a no-op", () => {
  const root = makeRoot(["AService"]);
  centralizeCore(path.join(root, "AService"), false, root);
  const once = fs.readFileSync(path.join(root, "AService", "AServiceClient.ts"), "utf8");

  rewriteCoreImports(path.join(root, "AService"));
  const twice = fs.readFileSync(path.join(root, "AService", "AServiceClient.ts"), "utf8");

  assert.equal(twice, once);
});

// The anchor region of hey-api 0.60.1 legacy output, abbreviated - real output
// has a six-entry binaryTypes array and an extra `|| contentType.includes('+json')`
// clause, both trimmed here since the patch doesn't care about them. What must
// stay faithful is the tab indentation and single quotes, since prettier runs
// later in the consumer and this is what the patch actually sees first.
const RAW_REQUEST_TS = [
  "export const getResponseBody = async (response: Response): Promise<unknown> => {",
  "\tif (response.status !== 204) {",
  "\t\ttry {",
  "\t\t\tconst contentType = response.headers.get('Content-Type');",
  "\t\t\tif (contentType) {",
  "\t\t\t\tconst binaryTypes = ['application/octet-stream', 'application/pdf'];",
  "\t\t\t\tif (contentType.includes('application/json')) {",
  "\t\t\t\t\treturn await response.json();",
  "\t\t\t\t} else if (binaryTypes.some(type => contentType.includes(type))) {",
  "\t\t\t\t\treturn await response.blob();",
  "\t\t\t\t} else if (contentType.includes('multipart/form-data')) {",
  "\t\t\t\t\treturn await response.formData();",
  "\t\t\t\t} else if (contentType.includes('text/')) {",
  "\t\t\t\t\treturn await response.text();",
  "\t\t\t\t}",
  "\t\t\t}",
  "\t\t} catch (error) {",
  "\t\t\tconsole.error(error);",
  "\t\t}",
  "\t}",
  "\treturn undefined;",
  "};",
  "",
].join("\n");

// The same function after a consumer's prettier pass: spaces, double quotes.
const PRETTIER_REQUEST_TS = RAW_REQUEST_TS.replace(/\t/g, "  ").replace(/'/g, '"');

function rootWithCore(contents) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sdkgen-patch-"));
  fs.mkdirSync(path.join(root, CORE_DIR), { recursive: true });
  fs.writeFileSync(path.join(root, CORE_DIR, "request.ts"), contents);
  return root;
}

test("adds a blob fallback after the text branch", () => {
  const root = rootWithCore(RAW_REQUEST_TS);
  assert.equal(patchResponseBody(root), true);

  const src = fs.readFileSync(path.join(root, CORE_DIR, "request.ts"), "utf8");
  assert.match(src, /\} else if \(response\.ok\) \{/);
  // The new branch follows the text branch, and the pre-existing binary
  // branch is still the first blob return.
  assert.ok(src.indexOf("response.text()") < src.indexOf("response.ok"));
  assert.equal(src.match(/response\.blob\(\)/g).length, 2);
});

test("patches the prettier-formatted variant too", () => {
  const root = rootWithCore(PRETTIER_REQUEST_TS);
  assert.equal(patchResponseBody(root), true);

  const src = fs.readFileSync(path.join(root, CORE_DIR, "request.ts"), "utf8");
  assert.match(src, /\} else if \(response\.ok\) \{/);
});

test("patching twice leaves the file unchanged", () => {
  const root = rootWithCore(RAW_REQUEST_TS);
  patchResponseBody(root);
  const once = fs.readFileSync(path.join(root, CORE_DIR, "request.ts"), "utf8");

  assert.equal(patchResponseBody(root), false);
  const twice = fs.readFileSync(path.join(root, CORE_DIR, "request.ts"), "utf8");
  assert.equal(twice, once);
});

test("throws when the anchor is gone, naming the file", () => {
  const root = rootWithCore("export const getResponseBody = async () => undefined;\n");

  assert.throws(() => patchResponseBody(root), /hey-api legacy template has changed/);
});

test("throws a clear error when core/request.ts does not exist", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sdkgen-patch-"));
  // No core/ directory was ever created under this root.

  assert.throws(() => patchResponseBody(root), /does not exist/);
});

test("throws when the text() anchor is not unique", () => {
  const duplicated = RAW_REQUEST_TS + "\n\t\treturn await response.text();\n";
  const root = rootWithCore(duplicated);

  assert.throws(() => patchResponseBody(root), /found 2/);
});

// Every consumer's second and later generation re-runs over pre-existing
// output: hey-api recreates each service directory - and its own unpatched
// core/ - from scratch, then centralizeCore/patchResponseBody run again over
// what is now a stale, already-patched shared core.
test("a consumer's second generation re-run patches the shared core exactly once", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sdkgen-rerun-"));
  const serviceDir = path.join(root, "AService");

  function writeFreshServiceCore() {
    fs.mkdirSync(path.join(serviceDir, CORE_DIR), { recursive: true });
    fs.writeFileSync(path.join(serviceDir, CORE_DIR, "request.ts"), RAW_REQUEST_TS);
  }

  // First generation: the service donates its freshly generated core.
  writeFreshServiceCore();
  assert.equal(centralizeCore(serviceDir, false, root), true);
  assert.equal(patchResponseBody(root), true);

  // Second generation: hey-api wipes and recreates the service directory,
  // so its core/request.ts comes back unpatched, same as the first time.
  writeFreshServiceCore();
  assert.equal(centralizeCore(serviceDir, false, root), true);
  assert.equal(patchResponseBody(root), true);

  const src = fs.readFileSync(path.join(root, CORE_DIR, "request.ts"), "utf8");
  assert.equal((src.match(/\} else if \(response\.ok\) \{/g) ?? []).length, 1);
  assert.equal(src.match(/response\.blob\(\)/g).length, 2);
});
