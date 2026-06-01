import { readFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const patternArg = process.argv[2];
const searchRoot = process.argv[3] ? resolve(process.argv[3]) : resolve("src");

const skippedDirNames = new Set([
  "node_modules",
  ".git",
  "dist",
  ".cache",
  "coverage",
]);
const searchableExtensions = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".json",
  ".md",
  ".mdc",
]);

const parsePattern = (raw: string): RegExp => {
  if (raw.length >= 2 && raw.startsWith("/")) {
    const lastSlash = raw.lastIndexOf("/");
    if (lastSlash > 0) {
      const source = raw.slice(1, lastSlash);
      const flags = raw.slice(lastSlash + 1);
      return new RegExp(source, flags);
    }
  }
  const escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped, "i");
};

const hasSearchableExtension = (fileName: string) => {
  const lower = fileName.toLowerCase();
  const dot = lower.lastIndexOf(".");
  const ext = dot >= 0 ? lower.slice(dot) : "";
  return searchableExtensions.has(ext);
};

const collectFiles = async (dir: string): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (skippedDirNames.has(entry.name)) {
          return [];
        }
        return collectFiles(fullPath);
      }
      if (!entry.isFile()) {
        return [];
      }
      if (!hasSearchableExtension(entry.name)) {
        return [];
      }
      return [fullPath];
    }),
  );
  return nested.flat();
};

const searchFile = async (
  absolutePath: string,
  pattern: RegExp,
  cwd: string,
): Promise<string[]> => {
  const text = await readFile(absolutePath, "utf8");
  const relativePath = relative(cwd, absolutePath);
  return text.split(/\r?\n/).flatMap((line, index) => {
    if (!pattern.test(line)) {
      return [];
    }
    pattern.lastIndex = 0;
    return [`${relativePath}:${index + 1}:${line}`];
  });
};

const run = async () => {
  if (!patternArg) {
    console.error("Usage: tsx scripts/search.ts <pattern> [path]");
    process.exit(1);
  }
  const pattern = parsePattern(patternArg);
  const cwd = process.cwd();
  const files = await collectFiles(searchRoot);
  const sortedFiles = [...files].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
  const matchGroups = await Promise.all(
    sortedFiles.map((file) => searchFile(file, pattern, cwd)),
  );
  matchGroups.flat().forEach((line) => {
    console.log(line);
  });
};

run().catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
