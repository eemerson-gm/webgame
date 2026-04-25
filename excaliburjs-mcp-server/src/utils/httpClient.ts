import axios, { AxiosError, AxiosRequestConfig, Method } from "axios";

const buildHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "excaliburjs-mcp-server",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token !== undefined && token.length > 0) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
};

export const makeGithubApiRequest = async <T>(path: string, method: Method = "GET", config?: Pick<AxiosRequestConfig, "params" | "responseType">): Promise<T> => {
  const response = await axios<T>({
    method,
    url: `https://api.github.com${path}`,
    params: config?.params,
    responseType: config?.responseType,
    timeout: 30_000,
    headers: buildHeaders(),
    validateStatus: (status) => status < 500,
  });
  if (response.status === 404) {
    const err = new Error("Not found");
    (err as { statusCode?: number }).statusCode = 404;
    throw err;
  }
  if (response.status === 403) {
    const err = new Error("Access denied or rate limited");
    (err as { statusCode?: number }).statusCode = 403;
    throw err;
  }
  if (response.status < 200 || response.status >= 300) {
    const err = new Error(`Request failed with status ${response.status}`);
    (err as { statusCode?: number }).statusCode = response.status;
    throw err;
  }
  return response.data;
};

export const getAxiosErrorMessage = (err: unknown): string => {
  if (err instanceof AxiosError) {
    if (err.response?.status === 404) {
      return "Error: resource not found. Check the ref and path.";
    }
    if (err.response?.status === 403) {
      return "Error: GitHub access denied. Set GITHUB_TOKEN for higher rate limits.";
    }
    if (err.response?.status === 429) {
      return "Error: rate limit. Wait and retry, or set GITHUB_TOKEN.";
    }
    if (err.response !== undefined) {
      return `Error: GitHub request failed with status ${err.response.status}.`;
    }
    return "Error: network failure talking to GitHub.";
  }
  if (err instanceof Error) {
    return `Error: ${err.message}.`;
  }
  return "Error: unexpected failure.";
};
