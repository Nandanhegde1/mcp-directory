/**
 * GitHub MCP Server scraper.
 *
 * Strategy:
 *  1. Search GitHub for repos matching MCP-related queries.
 *  2. For each repo, pull metadata + README excerpt.
 *  3. Infer category from topics + description.
 *  4. Output a single src/data/servers.json manifest the static site reads at build time.
 *
 * Run: `npm run scrape`
 * Required env: GITHUB_TOKEN (fine-grained, public-repo read access)
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { McpServer, McpCategory, ScrapeManifest } from '../src/types.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, '..', 'src', 'data', 'servers.json');

const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) {
  console.error('❌ GITHUB_TOKEN env var is required.');
  console.error('   Create one at https://github.com/settings/tokens?type=beta (public repo read access)');
  console.error('   Then run: $env:GITHUB_TOKEN="github_pat_..." ; npm run scrape');
  process.exit(1);
}

const HEADERS = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${TOKEN}`,
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'mcp-directory-scraper',
};

const SEARCH_QUERIES = [
  'mcp-server in:name,description,readme',
  '"model context protocol" in:readme',
  'topic:mcp',
  'topic:model-context-protocol',
  'topic:mcp-server',
  'modelcontextprotocol in:name,description',
  'claude-mcp in:name,description',
];

const PER_PAGE = 100;
const MAX_PAGES_PER_QUERY = 5; // GitHub caps search at 1000 results

interface GhRepo {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
  html_url: string;
  description: string | null;
  stargazers_count: number;
  language: string | null;
  topics: string[];
  default_branch: string;
  pushed_at: string;
  archived: boolean;
  fork: boolean;
}

async function ghFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: HEADERS });
  if (res.status === 403) {
    const remaining = res.headers.get('x-ratelimit-remaining');
    const reset = res.headers.get('x-ratelimit-reset');
    throw new Error(`Rate limited. Remaining=${remaining}, resets at ${reset}`);
  }
  if (!res.ok) {
    throw new Error(`GitHub API error ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

async function searchRepos(query: string): Promise<GhRepo[]> {
  const all: GhRepo[] = [];
  for (let page = 1; page <= MAX_PAGES_PER_QUERY; page++) {
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${PER_PAGE}&page=${page}`;
    try {
      const data = await ghFetch<{ items: GhRepo[]; total_count: number }>(url);
      if (!data.items?.length) break;
      all.push(...data.items);
      if (data.items.length < PER_PAGE) break;
      // small delay to be polite to search API (30 req/min limit)
      await new Promise((r) => setTimeout(r, 2200));
    } catch (e) {
      console.warn(`  ⚠️  Query "${query}" page ${page} failed:`, (e as Error).message);
      break;
    }
  }
  return all;
}

async function fetchReadme(owner: string, repo: string, branch: string): Promise<string> {
  const candidates = ['README.md', 'README.MD', 'readme.md', 'Readme.md', 'README'];
  for (const file of candidates) {
    try {
      const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${file}`;
      const res = await fetch(url, { headers: { 'User-Agent': 'mcp-directory-scraper' } });
      if (res.ok) return await res.text();
    } catch {
      /* try next */
    }
  }
  return '';
}

function excerptReadme(readme: string, maxLen = 600): string {
  if (!readme) return '';
  // Strip badges, html, and code blocks for the excerpt
  let text = readme
    .replace(/^---[\s\S]*?---/m, '') // frontmatter
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '') // images
    .replace(/\[!\[[^\]]*\]\([^)]+\)\]\([^)]+\)/g, '') // badge images
    .replace(/<[^>]+>/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]*`/g, '')
    .replace(/^#+\s.*$/gm, '')
    .replace(/\n{2,}/g, '\n\n')
    .trim();
  if (text.length > maxLen) text = text.slice(0, maxLen).trim() + '…';
  return text;
}

function inferCategory(repo: GhRepo, readme: string): McpCategory {
  const haystack = [
    repo.name,
    repo.description ?? '',
    ...(repo.topics ?? []),
    readme.slice(0, 1000),
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

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function buildInstallCommand(repo: GhRepo): string {
  const lang = (repo.language ?? '').toLowerCase();
  const fullName = repo.full_name;
  if (lang === 'python') return `pip install git+https://github.com/${fullName}.git`;
  if (lang === 'typescript' || lang === 'javascript') {
    // common pattern: npx <package> or git clone
    return `npx -y github:${fullName}`;
  }
  if (lang === 'go') return `go install github.com/${fullName}@latest`;
  if (lang === 'rust') return `cargo install --git https://github.com/${fullName}.git`;
  return `git clone https://github.com/${fullName}.git`;
}

function buildConfigSnippet(repo: GhRepo): string {
  const key = repo.name.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  const lang = (repo.language ?? '').toLowerCase();
  let command = 'npx';
  let args: string[] = ['-y', `github:${repo.full_name}`];
  if (lang === 'python') {
    command = 'uvx';
    args = [`git+https://github.com/${repo.full_name}.git`];
  }
  return JSON.stringify(
    {
      mcpServers: {
        [key]: {
          command,
          args,
        },
      },
    },
    null,
    2,
  );
}

function isLikelyMcpServer(repo: GhRepo, readme: string): boolean {
  if (repo.archived || repo.fork) return false;
  const text = `${repo.name} ${repo.description ?? ''} ${(repo.topics ?? []).join(' ')} ${readme.slice(0, 2000)}`.toLowerCase();
  // Must mention MCP-related terms in name, description, topics, or README header
  return /\b(mcp|model[\s-]?context[\s-]?protocol|modelcontextprotocol)\b/.test(text);
}

async function main(): Promise<void> {
  console.log('🔎 Scraping GitHub for MCP servers…');
  const seen = new Map<number, GhRepo>();

  for (const q of SEARCH_QUERIES) {
    console.log(`  • Query: ${q}`);
    const results = await searchRepos(q);
    for (const r of results) seen.set(r.id, r);
    console.log(`    → +${results.length} (total unique: ${seen.size})`);
  }

  console.log(`\n📦 Enriching ${seen.size} repos with README data…`);
  const servers: McpServer[] = [];
  let i = 0;
  for (const repo of seen.values()) {
    i++;
    if (i % 25 === 0) console.log(`  …${i}/${seen.size}`);
    const readme = await fetchReadme(repo.owner.login, repo.name, repo.default_branch);
    if (!isLikelyMcpServer(repo, readme)) continue;

    const slug = slugify(`${repo.owner.login}-${repo.name}`);
    const category = inferCategory(repo, readme);
    const official =
      repo.owner.login.toLowerCase() === 'modelcontextprotocol' ||
      repo.owner.login.toLowerCase() === 'anthropics';

    servers.push({
      slug,
      name: repo.name,
      owner: repo.owner.login,
      repo: repo.name,
      url: repo.html_url,
      description: (repo.description ?? '').trim() || `${repo.name} — MCP server.`,
      stars: repo.stargazers_count,
      language: repo.language,
      topics: repo.topics ?? [],
      category,
      readmeExcerpt: excerptReadme(readme),
      installCommand: buildInstallCommand(repo),
      configSnippet: buildConfigSnippet(repo),
      updatedAt: repo.pushed_at,
      featured: false,
      official,
    });

    // gentle pacing on raw.githubusercontent.com
    await new Promise((r) => setTimeout(r, 80));
  }

  // Merge in any "featured" overrides if present
  const featuredPath = join(__dirname, 'featured.json');
  if (existsSync(featuredPath)) {
    try {
      const featuredSlugs = JSON.parse(readFileSync(featuredPath, 'utf8')) as string[];
      const set = new Set(featuredSlugs);
      for (const s of servers) if (set.has(s.slug)) s.featured = true;
    } catch {
      /* ignore */
    }
  }

  // Sort: featured → official → stars desc
  servers.sort((a, b) => {
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    if (a.official !== b.official) return a.official ? -1 : 1;
    return b.stars - a.stars;
  });

  const manifest: ScrapeManifest = {
    generatedAt: new Date().toISOString(),
    count: servers.length,
    servers,
  };

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`\n✅ Wrote ${servers.length} servers → ${OUT_PATH}`);
}

main().catch((err) => {
  console.error('💥 Scrape failed:', err);
  process.exit(1);
});
