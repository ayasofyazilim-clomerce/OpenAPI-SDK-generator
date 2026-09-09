import { test } from "node:test";
import assert from "node:assert/strict";
import { filterApiListByOutput } from "../generator.mjs";

// generator.mjs imports @hey-api/openapi-ts at module top level; dependencies
// are installed in this repo, so importing it here works fine.

const API_LIST = [
  { output: "Refund", input: "refund", port: "1" },
  { output: "Tag", input: "tag", port: "2" },
];

test("include returns only the named entries", () => {
  const result = filterApiListByOutput({
    api_list: API_LIST,
    outputs: ["Refund"],
    type: "include",
  });

  assert.deepEqual(result, [API_LIST[0]]);
});

test("exclude returns everything except the named entries", () => {
  const result = filterApiListByOutput({
    api_list: API_LIST,
    outputs: ["Refund"],
    type: "exclude",
  });

  assert.deepEqual(result, [API_LIST[1]]);
});
