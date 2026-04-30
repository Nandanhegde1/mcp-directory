import type { McpServer, McpCategory } from '~/types';

// Vite's import.meta.glob with eager+raw is the most reliable way to embed a JSON file at build time
// without depending on JSON-import resolver quirks across rollup/vite/astro versions.
const files = import.meta.glob('./data/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;
const manifest = (files['./data/servers.json'] ?? { generatedAt: new Date().toISOString(), count: 0, servers: [] }) as {
  generatedAt: string;
  count: number;
  servers: McpServer[];
};
const data = manifest;

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
