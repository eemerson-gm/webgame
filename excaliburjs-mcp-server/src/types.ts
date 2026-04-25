export type GitTreeEntry = {
  path: string;
  mode: string;
  type: "blob" | "tree" | "commit";
  sha: string;
  size?: number;
};

export type GitTreeResponse = {
  sha: string;
  tree: GitTreeEntry[];
  truncated: boolean;
};

export type GitCommitListItem = {
  commit: { tree: { sha: string } };
};

export type DocPageInfo = {
  repo_path: string;
  file_name: string;
  path_segments: string[];
  docs_site_path: string;
  github_blob_url: string;
  source_extension: "md" | "mdx";
};
