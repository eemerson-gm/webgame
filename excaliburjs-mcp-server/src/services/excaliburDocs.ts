import {
  GITHUB_OWNER,
  GITHUB_REPO,
  DOCS_DIR_IN_REPO,
  CHARACTER_LIMIT,
  DOCS_INDEX_CACHE_MS,
} from "../constants.js";
import type { DocPageInfo, GitTreeEntry, GitTreeResponse, GitCommitListItem } from "../types.js";
import { makeGithubApiRequest } from "../utils/httpClient.js";
import { withRetry } from "../utils/withRetry.js";
import axios from "axios";

const isDocFile = (path: string): boolean =>
  path.endsWith(".md") || path.endsWith(".mdx");

const toDocInfo = (repoPath: string, ref: string): DocPageInfo | null => {
  if (!isDocFile(repoPath)) {
    return null;
  }
  const segments = repoPath.split("/");
  const fileName = segments[segments.length - 1] ?? "";
  const baseName = fileName.replace(/\.mdx$/i, "").replace(/\.md$/i, "");
  if (fileName === "") {
    return null;
  }
  const ext = fileName.toLowerCase().endsWith(".mdx") ? "mdx" : "md";
  const pathOnlySegments = repoPath
    .replace(/\.mdx$/i, "")
    .replace(/\.md$/i, "")
    .split("/");
  const lastSeg = pathOnlySegments[pathOnlySegments.length - 1] ?? baseName;
  if (baseName === "_category_" || lastSeg === "_category_") {
    return null;
  }
  const docsSitePath = pathOnlySegments.join("/");
  return {
    repo_path: repoPath,
    file_name: fileName,
    path_segments: pathOnlySegments,
    docs_site_path: docsSitePath,
    github_blob_url: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/blob/${ref}/${DOCS_DIR_IN_REPO}/${repoPath}`,
    source_extension: ext,
  };
};

const findEntry = (tree: GitTreeEntry[], name: string): GitTreeEntry | undefined =>
  tree.find((e) => e.type === "tree" && e.path === name);

type CacheState = {
  ref: string;
  pages: DocPageInfo[];
  cachedAt: number;
};

const cache: { state: CacheState | null } = { state: null };

const fetchTree = async (treeSha: string, recursive: boolean): Promise<GitTreeResponse> => {
  const path = `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/trees/${treeSha}`;
  return withRetry(
    () =>
      makeGithubApiRequest<GitTreeResponse>(path, "GET", {
        params: recursive ? { recursive: "1" } : undefined,
      })
  );
};

const resolveDocsTreeSha = async (ref: string): Promise<string> => {
  const list = await withRetry(
    () =>
      makeGithubApiRequest<GitCommitListItem[]>(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/commits`, "GET", {
        params: { sha: ref, per_page: "1" },
      })
  );
  const first = list[0];
  if (first === undefined) {
    throw new Error("No commits returned for the given ref.");
  }
  const rootTreeSha = first.commit.tree.sha;
  const root = await withRetry(() => fetchTree(rootTreeSha, false));
  const siteEntry = findEntry(root.tree, "site");
  if (siteEntry === undefined) {
    throw new Error("Repository layout missing site/ directory.");
  }
  const site = await withRetry(() => fetchTree(siteEntry.sha, false));
  const docsEntry = findEntry(site.tree, "docs");
  if (docsEntry === undefined) {
    throw new Error("Repository layout missing site/docs directory.");
  }
  return docsEntry.sha;
};

const buildIndex = async (ref: string): Promise<DocPageInfo[]> => {
  const docsTreeSha = await resolveDocsTreeSha(ref);
  const full = await withRetry(() => fetchTree(docsTreeSha, true));
  if (full.truncated) {
    throw new Error("Document tree was truncated by GitHub; try a narrower ref or contact maintainers.");
  }
  const pages: DocPageInfo[] = full.tree
    .map((e) => {
      if (e.type !== "blob") {
        return null;
      }
      return toDocInfo(e.path, ref);
    })
    .filter((x): x is DocPageInfo => x !== null);
  return pages.sort((a, b) => a.docs_site_path.localeCompare(b.docs_site_path));
};

export const getDocPagesIndex = async (ref: string, force = false): Promise<DocPageInfo[]> => {
  const now = Date.now();
  if (!force) {
    if (cache.state !== null && cache.state.ref === ref && now - cache.state.cachedAt < DOCS_INDEX_CACHE_MS) {
      return cache.state.pages;
    }
  }
  const pages = await buildIndex(ref);
  cache.state = { ref, pages, cachedAt: now };
  return pages;
};

const pathTraversalSafe = (relPath: string): boolean => {
  if (relPath.startsWith("/") || relPath.includes("..") || relPath.startsWith("..")) {
    return false;
  }
  return true;
};

export const buildRawSourceUrl = (ref: string, repoPath: string): string =>
  `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${ref}/${DOCS_DIR_IN_REPO}/${repoPath}`;

export const fetchDocSource = async (ref: string, repoPath: string): Promise<{ text: string; byte_length: number; truncated: boolean; truncation_message?: string }> => {
  if (!pathTraversalSafe(repoPath)) {
    throw new Error("Invalid path: directory traversal is not allowed.");
  }
  const url = buildRawSourceUrl(ref, repoPath);
  const response = await withRetry(
    () =>
      axios.get<string>(url, {
        timeout: 30_000,
        responseType: "text",
        transformResponse: [(d) => d as string],
        validateStatus: (s) => s === 200,
      })
  );
  const text = response.data;
  const byteLength = Buffer.byteLength(text, "utf8");
  if (text.length > CHARACTER_LIMIT) {
    return {
      text: text.slice(0, CHARACTER_LIMIT),
      byte_length: byteLength,
      truncated: true,
      truncation_message: `Content exceeded ${CHARACTER_LIMIT} characters; truncated. Use a narrower file or read from GitHub directly.`,
    };
  }
  return { text, byte_length: byteLength, truncated: false };
};

export const findPageByRepoPath = async (ref: string, repoPath: string): Promise<DocPageInfo | undefined> => {
  const pages = await getDocPagesIndex(ref);
  return pages.find((p) => p.repo_path === repoPath);
};

export const findPageBySitePath = async (ref: string, sitePath: string): Promise<DocPageInfo | undefined> => {
  const pages = await getDocPagesIndex(ref);
  return pages.find((p) => p.docs_site_path === sitePath);
};
