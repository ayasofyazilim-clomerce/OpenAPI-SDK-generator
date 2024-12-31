#! /usr/bin/env node
import { createClient } from "@hey-api/openapi-ts";
import SwaggerParser from "@apidevtools/swagger-parser";
import fs from "fs";
const BASE_URL = "http://192.168.1.105:";
const WEBGATEWAY_PORT = 44336;


var initial_api_list = [
  {
    input: "swagger-json/AuthServer",
    output: "Account",
    dereference: true,
  },
  {
    input: "swagger-json/Administration",
    output: "Administration",
    dereference: true,
  },
  {
    input: "swagger-json/Identity",
    output: "Identity",
    dereference: true,
  },
  {
    input: "swagger-json/Saas",
    output: "Saas",
    dereference: true,
  },
  {
    input: "swagger-json/Setting",
    output: "Setting",
    dereference: true,
  },
];

function clean_URL(url) {
  return url.replace(/\/\//g, "/").replace(/:\//g, "://");
}

function getCircularReplacer() {
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

async function generateApi(api_list) {
  for (const api of api_list) {
    console.log(`✨ Processing ${api.output}...`);
    const port = api?.port ? api.port : WEBGATEWAY_PORT;
    const apiURL = clean_URL(
      `${BASE_URL + port}/${api.input}` + "/swagger/v1/swagger.json",
    );
    const swaggerText = await SwaggerParser.dereference(apiURL);
    let temp_swagger = apiURL;
    if (api.dereference) {
      console.log(typeof swaggerText);
      console.log(`🎁 Dereferencing ${api.output} is from ${apiURL} done.`);
      temp_swagger = `temp_${api.output}_swagger.json`;
      fs.writeFileSync(
        temp_swagger,
        JSON.stringify(swaggerText, getCircularReplacer()),
      );

      await createClient({
        input: temp_swagger,
        output: api.output + "Service",
        name: api.output + "ServiceClient",
        client: "fetch",
        types: false,
        services: false,
      });
      //types
      await createClient({
        input: apiURL,
        output: api.output + "Service",
        name: api.output + "ServiceClient",
        client: "fetch",
        schemas: false,
        types: {
          // dates: "types+transform" TODO implement this
          // name: "PascalCase" TODO implement this
          tree: true,
        },
      });
      fs.unlinkSync(temp_swagger);
      fs.writeFileSync(
        `${api.output}Service/index.ts`,
        `\nexport * from './schemas.gen';`,
        { flag: "a" },
      );
    } else {
      await createClient({
        input: temp_swagger,
        output: api.output + "Service",
        name: api.output + "ServiceClient",
        client: "fetch",
      });
    }
    console.log(`✅ Generating ${api.output} is done.`);
  }
}

const args = process.argv.filter((val) => val.startsWith("--"));
const isAll = args.filter((val) => val === "--all").length > 0;
const hasFilter = args.filter((val) => val.startsWith("--filter")).length > 0;
const knownArgs = ["--all", "--filter"];
const unknownArgs = args.filter(
  (val) =>
    !knownArgs.includes(val) && !knownArgs.includes(val.split("=").at(0)),
);
async function init() {
  if (unknownArgs.length > 0) {
    return console.error(`❌ Unknown arguments: ${unknownArgs.join(", ")}`);
  }
  if (isAll && hasFilter) {
    return console.error(`❌ Cannot use --all and --filter at the same time.`);
  }
  if (hasFilter) {
    const filter = args
      .filter((val) => val.startsWith("--filter"))[0]
      .split("=")[1];
    const filterArgs = filter.split(",");
    initial_api_list = initial_api_list.filter((val) =>
      filterArgs.includes(val.output),
    );
    if (initial_api_list.length === 0) {
      return console.error(`❌ Unknown filter: ${filter}`);
    }
    console.log(`📃 Generating with filters: ${filter}`);
  }
  await generateApi(initial_api_list);
}
init();
