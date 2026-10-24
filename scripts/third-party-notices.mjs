import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Use the installed, locked dependency set. No package code is executed.
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const packages = Object.entries(lock.packages)
  .filter(([path, entry]) => path && !entry.dev)
  .map(([path, entry]) => ({
    path,
    name: path.split("node_modules/").at(-1),
    version: entry.version,
    license: entry.license ?? "Review required",
  }));
let output = `# Third-party notices\n\nGenerated from the runtime dependencies in \`package-lock.json\`. Run \`npm ci\` then \`npm run notices\` after dependency changes. Development tools and container base images retain their own licenses. These notices do not license Bitaxe Fleet itself.\n\n`;
output += "| Package | Version | Declared license |\n| --- | --- | --- |\n";
for (const entry of packages) {
  output += `| ${entry.name} | ${entry.version} | ${entry.license} |\n`;
}
output +=
  "\n## License and notice texts\n\nThe following texts are reproduced from the installed runtime packages. Dependencies remain subject to their respective terms.\n";
for (const entry of packages) {
  const directory = resolve(entry.path);
  if (!existsSync(directory)) {
    throw new Error(
      `Install locked dependencies before generating notices: ${entry.name}`,
    );
  }
  const texts = readdirSync(directory, { withFileTypes: true })
    .filter(
      (file) =>
        file.isFile() &&
        /^(licen[cs]e|copying|notice)([.-]|$)/i.test(file.name),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!texts.length) {
    const metadata = JSON.parse(
      readFileSync(resolve(directory, "package.json"), "utf8"),
    );
    const repository =
      typeof metadata.repository === "string"
        ? metadata.repository
        : metadata.repository?.url;
    output += `\nThe npm package declares ${entry.license} but does not include a top-level license file. Upstream: ${repository ?? "see the package metadata"}.\n`;
  }
  output += `\n### ${entry.name}@${entry.version}\n`;
  for (const file of texts) {
    const text = readFileSync(resolve(directory, file.name), "utf8").trim();
    output += `\n${file.name}:\n\n~~~~text\n${text}\n~~~~\n`;
  }
}
// Keep generated Markdown byte-for-byte consistent with format checks.
const { format } = await import("prettier");
output = await format(output, { parser: "markdown" });
if (process.argv.includes("--check")) {
  if (
    !existsSync("THIRD_PARTY_NOTICES.md") ||
    readFileSync("THIRD_PARTY_NOTICES.md", "utf8") !== output
  ) {
    throw new Error(
      "Third-party notices are out of date. Run npm run notices.",
    );
  }
} else {
  writeFileSync("THIRD_PARTY_NOTICES.md", output);
}
console.log(`Verified notices for ${packages.length} runtime packages.`);
