export type McpCategory =
  | 'database'
  | 'devtools'
  | 'productivity'
  | 'ai'
  | 'search'
  | 'filesystem'
  | 'communication'
  | 'finance'
  | 'media'
  | 'cloud'
  | 'monitoring'
  | 'security'
  | 'other';

export interface McpServer {
  /** Slug used in URL: e.g. "modelcontextprotocol-server-github" */
  slug: string;
  /** Display name */
  name: string;
  /** GitHub owner (user or org) */
  owner: string;
  /** Repo name */
  repo: string;
  /** Full repo URL */
  url: string;
  /** Short description (from repo or README) */
  description: string;
  /** GitHub stars */
  stars: number;
  /** Programming language */
  language: string | null;
  /** Topic/tag list from GitHub */
  topics: string[];
  /** Inferred category */
  category: McpCategory;
  /** README excerpt (first ~500 chars, sanitized) */
  readmeExcerpt: string;
  /** Suggested install command */
  installCommand: string;
  /** Suggested Claude Desktop config snippet */
  configSnippet: string;
  /** Last updated ISO date */
  updatedAt: string;
  /** Whether this server is "Featured" (paid) */
  featured: boolean;
  /** Official servers from modelcontextprotocol org */
  official: boolean;
}

export interface ScrapeManifest {
  generatedAt: string;
  count: number;
  servers: McpServer[];
}
