/**
 * Pure classification logic for the scraper — extracted so the precision rules
 * that keep the index credible are unit-tested (see classify.test.ts) instead of
 * living untested inside the cron script.
 */
import type { McpCategory } from '../src/types.ts';

/** Minimal structural shape shared by the GitHub API repo and stored entries. */
export interface RepoMeta {
  name: string;
  owner: { login: string };
  description: string | null;
  topics: string[];
  archived?: boolean;
  fork?: boolean;
}

const OFFICIAL_OWNERS = new Set(['modelcontextprotocol', 'anthropics']);

export function isLikelyMcpServer(repo: RepoMeta): boolean {
  if (repo.archived || repo.fork) return false;
  // Official orgs are always in scope.
  if (OFFICIAL_OWNERS.has(repo.owner.login.toLowerCase())) return true;
  // Curated link lists aren't servers.
  if (/^awesome[-_.]/i.test(repo.name)) return false;
  // Precision over recall: the repo's OWN metadata must identify it as an MCP
  // project. A passing README mention is not enough, and neither is a bare
  // `mcp` topic — huge unrelated projects tag `mcp` for discoverability.
  // Qualifying signals:
  //   - "mcp" in the repo NAME, or
  //   - a specific topic: mcp-server(s) / mcp-client / model-context-protocol, or
  //   - MCP named in the repo's own DESCRIPTION.
  const name = repo.name.toLowerCase();
  if (/mcp/.test(name)) return true;
  const topics = (repo.topics ?? []).map((t) => t.toLowerCase());
  if (topics.some((t) => /^mcp-servers?$|^mcp-client$|^model-context-protocol$/.test(t))) return true;
  return /\bmcp\b|model[\s-]?context[\s-]?protocol|modelcontextprotocol/.test((repo.description ?? '').toLowerCase());
}

export function inferCategory(repo: RepoMeta): McpCategory {
  // Classify from author-curated metadata only. READMEs of real projects mention
  // every technology they touch (auth, postgres, docker, …), which mis-filed
  // servers into whichever rule happened to match first.
  const haystack = [
    repo.name,
    repo.description ?? '',
    ...(repo.topics ?? []),
  ]
    .join(' ')
    .toLowerCase();

  const rules: [McpCategory, RegExp][] = [
    ['database', /\b(postgres|mysql|sqlite|mongo|redis|database|sql|nosql|vector\s?db|pinecone|qdrant|chroma|supabase|neon|planetscale|duckdb|clickhouse)\b/],
    ['filesystem', /\b(filesystem|file\ssystem|file-system|files?|directory|storage|s3|gdrive|google\sdrive|dropbox|onedrive)\b/],
    ['cloud', /\b(aws|azure|gcp|google\scloud|kubernetes|k8s|docker|terraform|cloudflare|vercel|fly\.io)\b/],
    ['devtools', /\b(git|github|gitlab|bitbucket|ci\/cd|jenkins|linter|formatter|ide|vscode|intellij|debug)\b/],
    ['communication', /\b(slack|discord|email|smtp|gmail|outlook|whatsapp|telegram|sms|twilio)\b/],
    ['productivity', /\b(notion|obsidian|todo|task|calendar|jira|linear|trello|asana|notes?)\b/],
    ['ai', /\b(llm|openai|anthropic|gemini|huggingface|embedding|rag|agent|fine-?tune)\b/],
    ['search', /\b(search|brave|bing|duckduckgo|tavily|perplexity|knowledge\s?base|wiki)\b/],
    ['finance', /\b(stripe|paypal|crypto|bitcoin|ethereum|trading|stock|invoice|accounting|quickbooks)\b/],
    ['media', /\b(image|video|audio|photo|youtube|twitch|spotify|figma|design|canva)\b/],
    ['monitoring', /\b(log|metric|observability|sentry|datadog|grafana|prometheus|newrelic|monitoring|analytics)\b/],
    ['security', /\b(auth|oauth|jwt|secrets?|vault|password|security|scanner|cve|vulnerab)\b/],
  ];

  for (const [cat, re] of rules) {
    if (re.test(haystack)) return cat;
  }
  return 'other';
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
