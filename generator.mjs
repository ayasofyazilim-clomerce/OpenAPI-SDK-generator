#! /usr/bin/env node
import { createClient, defaultPlugins } from "@hey-api/openapi-ts";
import SwaggerParser from "@apidevtools/swagger-parser";
import fs from "fs";
import { centralizeCore, patchResponseBody } from "./core-postprocess.mjs";

export function clean_URL(url) {
  return url.replace(/\/\//g, "/").replace(/:\//g, "://");
}

export function getCircularReplacer() {
  const ancestors = [];
  return function (key, value) {
    if (typeof value !== "object" || value === null) {
      return value;
    }
    // `this` is the object that value is contained in,
    // i.e., its direct parent.
    while (ancestors.length > 0 && ancestors.at(-1) !== this) {
      ancestors.pop();
    }
    if (ancestors.includes(value)) {
      return "[Circular]";
    }
    ancestors.push(value);
    return value;
  };
}

export async function generateApi({
  api_list,
  base_url,
  webgateway_port,
  clientOptions
}) {
  let coreCentralized = false;
  for (const api of api_list) {
    console.log(`✨ Processing ${api.output}...`);
    const port = api?.port ? api.port : webgateway_port;
    const apiURL = clean_URL(
      `${base_url + port}/${api.input}` + "/swagger/v1/swagger.json",
    );
    const swaggerText = await SwaggerParser.dereference(apiURL);
    let temp_swagger = apiURL;
    console.log(`🎁 Dereferencing ${api.output} is from ${apiURL} done.`);
    temp_swagger = `temp_${api.output}_swagger.json`;
    fs.writeFileSync(
      temp_swagger,
      JSON.stringify(swaggerText, getCircularReplacer()),
    );

    const defaultClientOptions = {
      plugins: [
        ...defaultPlugins,
        {
          name: '@hey-api/schemas',
          nameBuilder: (name) => `$${name}`
        },
        { name: "@hey-api/typescript" }
      ],
      name: api.output + "ServiceClient",
      client: {
        name: "legacy/fetch",
        bundle: true
      },
      experimentalParser: true,
    }

    //schemas
    await createClient({
      ...defaultClientOptions,
      input: temp_swagger,
      output: api.output + "Service",
      ...clientOptions,
      exportCore: true
    });
    //types
    await createClient({
      ...defaultClientOptions,
      input: apiURL,
      output: api.output + "Service_Temp",
      ...clientOptions,
      exportCore: false
    });
    fs.unlinkSync(temp_swagger);
    fs.copyFileSync(`${api.output}Service_Temp/types.gen.ts`, `${api.output}Service/types.gen.ts`)
    fs.rmSync(`${api.output}Service_Temp`, { recursive: true, force: true });
    fs.writeFileSync(
      `${api.output}Service/index.ts`,
      `\nexport * from './schemas.gen.ts';\nexport * from './types.gen.ts';`,
      { flag: "a" },
    );

    // Keep one shared core folder and repoint this service's imports at it.
    coreCentralized = centralizeCore(`${api.output}Service`, coreCentralized);

    console.log(`✅ Generating ${api.output} is done.`);
  }

  // Applied once, to the single shared core, after every service has donated
  // or dropped its copy. Throws if hey-api's template moved - a loud failure
  // here is the whole point, since the symptom otherwise is a corrupt download.
  if (coreCentralized) {
    patchResponseBody();
  }
}

export function filterApiListByOutput({ api_list, outputs, type = "include" }) {
  if (type === "include") {
    return api_list.filter(item => outputs.includes(item))
  }
  return api_list.filter(item => !outputs.includes(item))
}
