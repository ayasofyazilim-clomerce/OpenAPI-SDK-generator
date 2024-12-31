import { generateApi, initial_api_list } from "./generator.mjs";

const args = process.argv.filter((val) => val.startsWith("--"));
const isAll = args.filter((val) => val === "--all").length > 0;
const hasFilter = args.filter((val) => val.startsWith("--filter")).length > 0;
const knownArgs = ["--all", "--filter"];
const unknownArgs = args.filter(
  (val) =>
    !knownArgs.includes(val) && !knownArgs.includes(val.split("=").at(0) ?? ""),
);
async function init() {
  let initial_api = [];
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
    let initial_api = initial_api_list.filter((val) =>
      filterArgs.includes(val.output),
    );
    if (initial_api.length === 0) {
      return console.error(`❌ Unknown filter: ${filter}`);
    }
    console.log(`📃 Generating with filters: ${filter}`);
  }
  await generateApi(initial_api);
}
init();
