import {
  clean_URL,
  filterApiListByOutput,
  generateApi,
  getCircularReplacer,
} from "./generator.mjs";

// Keep BOTH the default export and the named exports: consumers differ - one
// repo imports the default, three import named bindings. Dropping either
// shape silently breaks whichever repos rely on it.
export default {
  clean_URL,
  filterApiListByOutput,
  generateApi,
  getCircularReplacer,
};

export { clean_URL, filterApiListByOutput, generateApi, getCircularReplacer };
