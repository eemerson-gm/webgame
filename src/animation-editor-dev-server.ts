import express from "express";
import * as fs from "fs";
import path from "path";

const port = 8081;
const app = express();
app.use(express.json({ limit: "1mb" }));

const workspaceRoot = process.cwd();
const editorHtmlPath = path.join(workspaceRoot, "animation-editor.html");
const publicDir = path.join(workspaceRoot, "public");
const assetsDir = path.join(publicDir, "assets");
const animationsDir = path.join(workspaceRoot, "src", "data", "animations");
const editorStaticDir = path.join(workspaceRoot, "src");

const posixPath = (input: string) => input.replaceAll("\\", "/");

const safeResolveUnder = (baseDir: string, relativeId: string) => {
  const resolved = path.resolve(baseDir, relativeId);
  const normalizedBase = path.resolve(baseDir);
  return resolved.startsWith(normalizedBase) ? resolved : null;
};

const extractSpriteMapFromResourceTs = async () => {
  const resourceTsPath = path.join(workspaceRoot, "src", "resource.ts");
  const text = await fs.promises.readFile(resourceTsPath, "utf8");
  const pattern =
    /(\w+)\s*:\s*new\s+ex\.ImageSource\(\s*["'](\.\/assets\/[^"']+)["']\s*\)/g;
  const matches = [...text.matchAll(pattern)];
  const result = matches
    .map((m) => {
      const key = String(m[1] ?? "");
      const assetPath = String(m[2] ?? "");
      const clean = assetPath.replace("./assets/", "assets/");
      const url = "/" + clean;
      return { key, url };
    })
    .filter((x) => x.key.length > 0 && x.url.startsWith("/assets/"));
  return result;
};

const listJsonFiles = async (dir: string): Promise<string[]> => {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return listJsonFiles(full);
      }
      if (!entry.isFile()) {
        return [];
      }
      return entry.name.toLowerCase().endsWith(".json") ? [full] : [];
    }),
  );
  return nested.flat();
};

const animationIdForPath = (filePath: string) => {
  const rel = path.relative(animationsDir, filePath);
  return posixPath(rel);
};

app.get("/", (_, res) => {
  res.sendFile(editorHtmlPath);
});

app.use("/assets", express.static(assetsDir));
app.use("/editor", express.static(editorStaticDir));

app.get("/api/sprites", async (_req, res) => {
  const sprites = await extractSpriteMapFromResourceTs();
  res.json({ sprites });
});

app.get("/api/animations", async (_req, res) => {
  const files = await listJsonFiles(animationsDir);
  const animations = files
    .map((filePath) => {
      const id = animationIdForPath(filePath);
      const name = id.split("/").pop() ?? id;
      return { id, name };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  res.json({ animations });
});

app.get("/api/animations/:id", async (req, res) => {
  const id = String(req.params.id ?? "");
  const resolved = safeResolveUnder(animationsDir, id);
  if (resolved === null) {
    res.status(400).json({ error: "Invalid animation id" });
    return;
  }
  if (!resolved.toLowerCase().endsWith(".json")) {
    res.status(400).json({ error: "Only json is allowed" });
    return;
  }
  const text = await fs.promises.readFile(resolved, "utf8");
  const json = JSON.parse(text) as unknown;
  res.json(json);
});

app.put("/api/animations/:id", async (req, res) => {
  const id = String(req.params.id ?? "");
  const resolved = safeResolveUnder(animationsDir, id);
  if (resolved === null) {
    res.status(400).json({ error: "Invalid animation id" });
    return;
  }
  if (!resolved.toLowerCase().endsWith(".json")) {
    res.status(400).json({ error: "Only json is allowed" });
    return;
  }
  const text = JSON.stringify(req.body, null, 2) + "\n";
  await fs.promises.writeFile(resolved, text, "utf8");
  res.json({ ok: true });
});

app.listen(port, () => {
  console.log(`[Editor] Listening on port ${port}`);
});

