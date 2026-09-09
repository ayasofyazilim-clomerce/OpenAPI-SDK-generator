# @ayasofyazilim-clomerce/sdk-generator

Generates TypeScript API clients from the ABP gateway's OpenAPI documents, and
keeps a single shared `core/` runtime per generation root instead of one copy
per service.

## Install

Published to GitHub Packages, so the consuming repo needs the scope mapped in
its `.npmrc`:

```
@ayasofyazilim-clomerce:registry=https://npm.pkg.github.com
```

Authentication belongs in your own `~/.npmrc`, never in the repo:

```
//npm.pkg.github.com/:_authToken=<PAT with read:packages>
```

```bash
pnpm add -D @ayasofyazilim-clomerce/sdk-generator
```

## Use

This package is a library. Each consuming repo keeps its own small `index.mjs`
CLI next to its `API_LIST.json`, because that list is repo-specific:

```js
import SDKGenerator from "@ayasofyazilim-clomerce/sdk-generator";
import API_LIST from "./API_LIST.json" with { type: "json" };

await SDKGenerator.generateApi({
  api_list: API_LIST,
  base_url: "https://dev-api.example.com",
  webgateway_port: "",
});
```

`generateApi` writes each service to `<Output>Service/` relative to the current
working directory, then moves the first service's `core/` to `./core` and
repoints every service's `./core/...` imports at `../core/...`. Run it from the
directory that should own the shared `core/`.

## Release

Push a tag; the `publish` workflow builds and publishes to GitHub Packages:

```bash
npm version minor
git push --follow-tags
```

## Why `@hey-api/openapi-ts` is pinned to 0.60.1

The generated client uses hey-api's `legacy/fetch` client, which emits the
`core/` runtime this package post-processes.

| Version | Legacy client |
| --- | --- |
| 0.60.1 | present — pinned here |
| 0.86.0 | present — the last version that ships it |
| 0.87.0 | **removed** |

Anything from 0.87.0 onward cannot generate this client shape at all. Do not
widen the pin to a caret range.

`@apidevtools/swagger-parser` is likewise pinned, to `13.0.0`: the gateway
serves OpenAPI 3.0.4, and versions before 13 reject anything past 3.0.3.

The legacy client's `getResponseBody` discards the body of any 2xx response
whose `Content-Type` is outside its four branches — including
`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, so `.xlsx`
downloads arrive as the literal string `undefined`. That bug is identical in
every version from 0.60.1 to 0.86.0 and was never fixed upstream, so
`patchResponseBody()` in `core-postprocess.mjs` fixes it on the generated
output. It throws if hey-api's template shifts under it — if generation starts
failing there, re-check the patch rather than deleting it.
