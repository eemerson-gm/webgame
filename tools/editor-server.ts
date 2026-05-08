import express from "express";
import fs from "fs";
import path from "path";

const app = express();
const root = path.resolve(__dirname, "..");
const animationsDir = path.join(root, "src", "data", "animations");
const publicDir = path.join(root, "public");
const toolsDir = path.join(root, "tools");

app.use(express.json());
app.use(express.static(toolsDir));
app.use(express.static(publicDir));

app.get("/api/animations", (_req, res) => {
  const files = fs.readdirSync(animationsDir).filter((f) => f.endsWith(".json"));
  const animations = files.map((file) => ({
    id: path.basename(file, ".json"),
    filename: file,
  }));
  res.json(animations);
});

const collectPngs = (dir: string, base: string): string[] => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry.name);
    const rel = path.join(base, entry.name).replace(/\\/g, "/");
    if (entry.isDirectory()) return collectPngs(full, rel);
    if (entry.name.endsWith(".png")) return [rel];
    return [];
  });
};

app.get("/api/assets", (_req, res) => {
  const pngs = collectPngs(path.join(publicDir, "assets"), "assets");
  res.json(pngs);
});

app.get("/api/animations/:id", (req, res) => {
  const file = path.join(animationsDir, `${req.params.id}.json`);
  if (!fs.existsSync(file)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(JSON.parse(fs.readFileSync(file, "utf-8")));
});

app.post("/api/save", (req, res) => {
  const { id, data } = req.body as { id: string; data: unknown };
  if (!id || !data) {
    res.status(400).json({ error: "Missing id or data" });
    return;
  }
  const safeId = path.basename(id);
  const file = path.join(animationsDir, `${safeId}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
  res.json({ ok: true });
});

const port = 5174;
app.listen(port, () => {
  console.log(`Animation editor: http://localhost:${port}/animation-editor.html`);
});
