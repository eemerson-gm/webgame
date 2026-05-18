import * as fs from "fs/promises";
import * as path from "path";

export type SpriteManifestEntry = {
  key: string;
  url: string;
};

const pascalCaseFromBaseName = (basename: string): string => {
  const lower = basename.toLowerCase();
  if (!lower.endsWith(".png")) {
    return "";
  }
  const withoutExt = basename.slice(0, Math.max(0, basename.length - 4));
  const parts = withoutExt.split("_").filter((p) => p.length > 0);
  return parts
    .map(
      (part) =>
        part.substring(0, 1).toUpperCase() + part.substring(1).toLowerCase(),
    )
    .join("");
};

const extractFromResourceTsText = (text: string): SpriteManifestEntry[] => {
  const trimmed = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const pattern =
    /(\w+)\s*:\s*new\s+ex\.ImageSource\s*\(\s*(["'])(\.\/assets\/[^"']+)\2/gs;
  return [...trimmed.matchAll(pattern)]
    .map((m) => {
      const key = String(m[1] ?? "").trim();
      const assetPath = String(m[3] ?? "").trim();
      const normalized = assetPath.replace(/^\.\//, "");
      const prefix = "assets/";
      const tail = normalized.startsWith(prefix)
        ? normalized.slice(prefix.length)
        : normalized;
      const url = `/assets/${tail}`;
      return { key, url };
    })
    .filter((s) => s.key.length > 0 && s.url.startsWith("/assets/"));
};

const listPngRelUnderDir = async (
  absDir: string,
  relPrefix: string,
): Promise<string[]> => {
  let entries;
  try {
    entries = await fs.readdir(absDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
      const full = path.join(absDir, entry.name);
      if (entry.isDirectory() === true) {
        return listPngRelUnderDir(full, rel);
      }
      if (entry.isFile() !== true) {
        return [];
      }
      return entry.name.toLowerCase().endsWith(".png") ? [rel] : [];
    }),
  );
  return nested.flat();
};

const mergeCharacterPngsFromDisk = async (
  workspaceRoot: string,
  byKey: Map<string, string>,
): Promise<void> => {
  const assetsRoot = path.join(workspaceRoot, "public", "assets");
  const relPngs = await listPngRelUnderDir(assetsRoot, "");
  relPngs.forEach((relRaw) => {
    const rel = relRaw.replaceAll("\\", "/");
    if (!rel.toLowerCase().startsWith("characters/")) {
      return;
    }
    const key = pascalCaseFromBaseName(path.basename(rel));
    if (key.length === 0 || byKey.has(key) === true) {
      return;
    }
    byKey.set(key, `/assets/${rel}`);
  });
};

export const extractImageSpritesFromResourceTs = async (
  workspaceRoot: string,
): Promise<SpriteManifestEntry[]> => {
  const resourceTsPath = path.join(workspaceRoot, "src", "resource.ts");
  const text = await fs.readFile(resourceTsPath, "utf8");
  const byKey = new Map<string, string>();
  extractFromResourceTsText(text).forEach((entry) => {
    byKey.set(entry.key, entry.url);
  });
  await mergeCharacterPngsFromDisk(workspaceRoot, byKey);
  const sprites = [...byKey.entries()].map(([key, url]) => ({ key, url }));
  sprites.sort((a, b) => a.key.localeCompare(b.key));
  return sprites;
};
