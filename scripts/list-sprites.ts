import { readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const defaultAssetsDir = resolve("public/assets");
const assetsDir = process.argv[2] ? resolve(process.argv[2]) : defaultAssetsDir;

const spriteExtensions = new Set([".png", ".gif", ".jpg", ".jpeg", ".webp"]);

const collectFiles = async (dir: string): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        return collectFiles(fullPath);
      }
      if (!entry.isFile()) {
        return [];
      }
      const lower = entry.name.toLowerCase();
      const dot = lower.lastIndexOf(".");
      const ext = dot >= 0 ? lower.slice(dot) : "";
      if (!spriteExtensions.has(ext)) {
        return [];
      }
      return [fullPath];
    }),
  );
  return nested.flat();
};

const run = async () => {
  const files = await collectFiles(assetsDir);
  const cwd = process.cwd();
  const lines = files
    .map((absolute) => relative(cwd, absolute))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  lines.forEach((line) => {
    console.log(line);
  });
};

run().catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
