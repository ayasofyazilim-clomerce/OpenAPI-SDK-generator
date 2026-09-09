import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CORE_DIR, centralizeCore, rewriteCoreImports } from "../core-postprocess.mjs";

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
