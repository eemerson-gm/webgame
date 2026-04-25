import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { DocPageInfo } from "../types.js";
import {
  findPageByRepoPath,
  findPageBySitePath,
  fetchDocSource,
  getDocPagesIndex,
} from "../services/excaliburDocs.js";
import { getAxiosErrorMessage } from "../utils/httpClient.js";

const defaultRef = (): string => process.env.EXCALIBUR_DOCS_GIT_REF ?? "main";

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

const docListItemSchema = z.object({
  repo_path: z.string(),
  docs_site_path: z.string(),
  file_name: z.string(),
  github_blob_url: z.string().url(),
  source_extension: z.enum(["md", "mdx"]),
});

const matchesQuery = (page: DocPageInfo, q: string): boolean => {
  const lower = q.toLowerCase();
  const pathMatch = page.docs_site_path.toLowerCase().includes(lower);
  const nameMatch = page.file_name.toLowerCase().includes(lower);
  return pathMatch || nameMatch;
};

export const registerExcaliburTools = (server: McpServer): void => {
  server.registerTool(
    "excaliburjs_list_doc_pages",
    {
      title: "List Excalibur.js documentation pages",
      description:
        "List documentation pages from the official Excalibur.js documentation source in the public GitHub repository (site/docs). Includes a GitHub blob URL for each file (canonical for the Markdown/MDX). The live excaliburjs.com/docs URLs can use different slugs than the file path; browse the site or use search for rendered pages.\n\nUse when: you need a directory of doc topics, pagination, or stable paths before reading a file.\nDo NOT use when: you already know the exact repo path—use excaliburjs_get_doc_source instead.",
      inputSchema: {
        ref: z
          .string()
          .min(1)
          .max(200)
          .default(defaultRef())
          .describe("Git branch, tag, or commit SHA in excaliburjs/Excalibur (e.g. main)."),
        limit: z.number().int().min(1).max(100).default(30).describe("Page size."),
        offset: z.number().int().min(0).default(0).describe("Number of items to skip."),
        refresh_index: z
          .boolean()
          .default(false)
          .describe("If true, bypass the in-memory index cache and rebuild from GitHub."),
      },
      outputSchema: {
        ref: z.string(),
        total: z.number().int().min(0),
        count: z.number().int().min(0),
        offset: z.number().int().min(0),
        has_more: z.boolean(),
        next_offset: z.number().int().min(0).optional(),
        pages: z.array(docListItemSchema),
      },
      annotations: readOnlyAnnotations,
    },
    async ({ ref, limit, offset, refresh_index: refreshIndex }) => {
      try {
        const all = await getDocPagesIndex(ref, refreshIndex);
        const total = all.length;
        const slice = all.slice(offset, offset + limit);
        const hasMore = total > offset + slice.length;
        const nextOffset = hasMore ? offset + slice.length : undefined;
        const pages = slice.map((p) => ({
          repo_path: p.repo_path,
          docs_site_path: p.docs_site_path,
          file_name: p.file_name,
          github_blob_url: p.github_blob_url,
          source_extension: p.source_extension,
        }));
        const output = {
          ref,
          total,
          count: slice.length,
          offset,
          has_more: hasMore,
          next_offset: nextOffset,
          pages,
        };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      } catch (err) {
        const msg = getAxiosErrorMessage(err);
        return { content: [{ type: "text" as const, text: msg }], isError: true };
      }
    }
  );

  server.registerTool(
    "excaliburjs_search_doc_pages",
    {
      title: "Search Excalibur.js documentation pages by path or filename",
      description:
        "Case-insensitive substring search over doc paths and file names in site/docs. Does not full-text search inside MDX bodies (use excaliburjs_get_doc_source for that). Paginated results.\n\nUse when: finding a topic from keywords (e.g. 'sprite', 'collision').\nDo NOT use when: you have the full docs path already.",
      inputSchema: {
        ref: z.string().min(1).max(200).default(defaultRef()).describe("Git ref in excaliburjs/Excalibur."),
        query: z
          .string()
          .min(2)
          .max(200)
          .describe("Substring to match against path or file name (not file contents)."),
        limit: z.number().int().min(1).max(100).default(20).describe("Page size."),
        offset: z.number().int().min(0).default(0).describe("Skip this many results from the match list."),
        refresh_index: z.boolean().default(false).describe("Bypass doc index cache when true."),
      },
      outputSchema: {
        ref: z.string(),
        query: z.string(),
        total_matches: z.number().int().min(0),
        count: z.number().int().min(0),
        offset: z.number().int().min(0),
        has_more: z.boolean(),
        next_offset: z.number().int().min(0).optional(),
        pages: z.array(docListItemSchema),
      },
      annotations: readOnlyAnnotations,
    },
    async ({ ref, query, limit, offset, refresh_index: refreshIndex }) => {
      try {
        const all = await getDocPagesIndex(ref, refreshIndex);
        const matches = all.filter((p) => matchesQuery(p, query));
        const totalMatches = matches.length;
        const slice = matches.slice(offset, offset + limit);
        const hasMore = totalMatches > offset + slice.length;
        const nextOffset = hasMore ? offset + slice.length : undefined;
        const pages = slice.map((p) => ({
          repo_path: p.repo_path,
          docs_site_path: p.docs_site_path,
          file_name: p.file_name,
          github_blob_url: p.github_blob_url,
          source_extension: p.source_extension,
        }));
        const output = {
          ref,
          query,
          total_matches: totalMatches,
          count: slice.length,
          offset,
          has_more: hasMore,
          next_offset: nextOffset,
          pages,
        };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      } catch (err) {
        const msg = getAxiosErrorMessage(err);
        return { content: [{ type: "text" as const, text: msg }], isError: true };
      }
    }
  );

  server.registerTool(
    "excaliburjs_get_doc_source",
    {
      title: "Get raw Excalibur.js documentation file from GitHub",
      description:
        "Fetches the raw Markdown or MDX source for a documentation page from excaliburjs/Excalibur at site/docs. At least one of repo_path or docs_site_path is required. Large files are truncated with a message at ~25k characters. Returns a GitHub blob URL for the file on the same ref.\n\nUse when: you need the actual documentation text, examples, or frontmatter to answer API questions.\nDo NOT use when: you only need the file list (use list or search).",
      inputSchema: {
        ref: z.string().min(1).max(200).default(defaultRef()).describe("Git ref in excaliburjs/Excalibur."),
        repo_path: z
          .string()
          .min(1)
          .max(500)
          .optional()
          .describe("Path under site/docs, e.g. 01-fundamentals/02-getting-started.mdx"),
        docs_site_path: z
          .string()
          .min(1)
          .max(500)
          .optional()
          .describe("Docusaurus doc path, same as the URL under /docs/ without the domain."),
      },
      outputSchema: {
        ref: z.string(),
        resolved_repo_path: z.string(),
        github_blob_url: z.string().url(),
        source_extension: z.enum(["md", "mdx"]),
        text: z.string(),
        character_count: z.number().int().min(0),
        byte_length: z.number().int().min(0),
        truncated: z.boolean(),
        truncation_message: z.string().optional(),
      },
      annotations: readOnlyAnnotations,
    },
    async ({ ref, repo_path: repoPath, docs_site_path: sitePath }) => {
      if (repoPath === undefined && sitePath === undefined) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: provide repo_path and/or docs_site_path.",
            },
          ],
          isError: true,
        };
      }
      try {
        const fromRepo =
          repoPath !== undefined ? await findPageByRepoPath(ref, repoPath) : undefined;
        const page =
          fromRepo !== undefined
            ? fromRepo
            : sitePath !== undefined
              ? await findPageBySitePath(ref, sitePath)
              : undefined;
        if (page === undefined) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: no documentation file matched. Use excaliburjs_search_doc_pages or list_doc_pages to find a valid path.",
              },
            ],
            isError: true,
          };
        }
        const source = await fetchDocSource(ref, page.repo_path);
        const output = {
          ref,
          resolved_repo_path: page.repo_path,
          github_blob_url: page.github_blob_url,
          source_extension: page.source_extension,
          text: source.text,
          character_count: source.text.length,
          byte_length: source.byte_length,
          truncated: source.truncated,
          truncation_message: source.truncation_message,
        };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      } catch (err) {
        const msg = getAxiosErrorMessage(err);
        return { content: [{ type: "text" as const, text: msg }], isError: true };
      }
    }
  );
};
