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
import type { McpServer, ScrapeManifest } from '../src/types.ts';
import { isLikelyMcpServer, inferCategory, slugify } from './classify.ts';

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

async function main(): Promise<void> {
  console.log('🔎 Scraping GitHub for MCP servers…');
  const seen = new Map<number, GhRepo>();

  for (const q of SEARCH_QUERIES) {
    console.log(`  • Query: ${q}`);
    const results = await searchRepos(q);
    for (const r of results) seen.set(r.id, r);
    console.log(`    → +${results.length} (total unique: ${seen.size})`);
  }

  // Filter FIRST — the classifier only reads repo metadata, so fetching READMEs
  // for repos we then discard wasted thousands of raw.githubusercontent calls
  // per run and widened the window for partial-failure truncation.
  const candidates = [...seen.values()].filter((r) => isLikelyMcpServer(r));
  console.log(`\n📦 ${candidates.length}/${seen.size} pass the metadata filter; fetching READMEs for survivors…`);
  const servers: McpServer[] = [];
  let i = 0;
  for (const repo of candidates) {
    i++;
    if (i % 25 === 0) console.log(`  …${i}/${candidates.length}`);
    const readme = await fetchReadme(repo.owner.login, repo.name, repo.default_branch);

    const slug = slugify(`${repo.owner.login}-${repo.name}`);
    const category = inferCategory(repo);
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

  // Sanity gate: a rate-limited or partially-failed run must never overwrite a
  // healthy dataset (the cron would commit AND auto-deploy the truncated file).
  if (existsSync(OUT_PATH)) {
    try {
      const prev = JSON.parse(readFileSync(OUT_PATH, 'utf8')) as ScrapeManifest;
      const floor = Math.floor((prev.servers?.length ?? 0) * 0.7);
      if (servers.length < floor) {
        console.error(`💥 Sanity gate: new run found ${servers.length} servers vs ${prev.servers.length} previously (< 70%). Refusing to overwrite — likely a partial/rate-limited scrape.`);
        process.exit(1);
      }
    } catch {
      /* unreadable previous file — proceed with the fresh write */
    }
  }

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
