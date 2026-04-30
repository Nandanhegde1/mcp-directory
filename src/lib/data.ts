import type { McpServer, McpCategory } from '~/types';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Read at module load time. process.cwd() is the project root during `astro build`,
// which is more reliable than __dirname after rollup bundling.
const manifestPath = resolve(process.cwd(), 'src', 'data', 'servers.json');
const data = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
  generatedAt: string;
  count: number;
  servers: McpServer[];
};

export const allServers: McpServer[] = data.servers;
export const generatedAt: string = data.generatedAt;

export const categories: { id: McpCategory; label: string; description: string }[] = [
  { id: 'database', label: 'Databases', description: 'MCP servers for SQL, NoSQL, vector, and graph databases.' },
  { id: 'devtools', label: 'Developer Tools', description: 'Git, CI/CD, IDEs, code analysis, and developer workflows.' },
  { id: 'productivity', label: 'Productivity', description: 'Notes, tasks, calendars, docs, and personal productivity.' },
  { id: 'ai', label: 'AI & ML', description: 'LLM gateways, embeddings, model orchestration, and AI utilities.' },
  { id: 'search', label: 'Search', description: 'Web search, knowledge bases, and information retrieval.' },
  { id: 'filesystem', label: 'Filesystem', description: 'Local files, cloud storage, and file manipulation.' },
  { id: 'communication', label: 'Communication', description: 'Email, chat, Slack, Discord, and messaging integrations.' },
  { id: 'finance', label: 'Finance', description: 'Accounting, payments, crypto, and financial data.' },
  { id: 'media', label: 'Media', description: 'Images, video, audio, and creative tools.' },
  { id: 'cloud', label: 'Cloud & DevOps', description: 'AWS, GCP, Azure, Kubernetes, Docker, and infrastructure.' },
  { id: 'monitoring', label: 'Monitoring', description: 'Logs, metrics, observability, and analytics.' },
  { id: 'security', label: 'Security', description: 'Auth, secrets, scanning, and security tools.' },
  { id: 'other', label: 'Other', description: 'Uncategorized and miscellaneous MCP servers.' },
];

export function getServerBySlug(slug: string): McpServer | undefined {
  return allServers.find((s) => s.slug === slug);
}

export function getServersByCategory(category: McpCategory): McpServer[] {
  return allServers.filter((s) => s.category === category);
}

export function getRelatedServers(server: McpServer, limit = 6): McpServer[] {
  return allServers
    .filter((s) => s.slug !== server.slug && s.category === server.category)
    .sort((a, b) => b.stars - a.stars)
    .slice(0, limit);
}

export function getTopServers(limit = 12): McpServer[] {
  return [...allServers].sort((a, b) => b.stars - a.stars).slice(0, limit);
}

export function getFeaturedServers(limit = 6): McpServer[] {
  return allServers.filter((s) => s.featured).slice(0, limit);
}

export function getRecentlyUpdated(limit = 12): McpServer[] {
  return [...allServers]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, limit);
}

export function categoryLabel(id: McpCategory): string {
  return categories.find((c) => c.id === id)?.label ?? 'Other';
}
