// Locks the precision rules that keep the index credible (shipped in commits
// defd08f + 527ef2d after 100k-star false positives polluted the homepage).
// Run: npm test  (tsx --test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLikelyMcpServer, inferCategory, slugify, type RepoMeta } from './classify.ts';

const repo = (over: Partial<RepoMeta> & { name: string }): RepoMeta => ({
  owner: { login: 'someone' },
  description: null,
  topics: [],
  archived: false,
  fork: false,
  ...over,
});

test('official orgs are always kept, even with no MCP metadata', () => {
  assert.ok(isLikelyMcpServer(repo({ name: 'servers', owner: { login: 'modelcontextprotocol' } })));
  assert.ok(isLikelyMcpServer(repo({ name: 'claude-plugins-official', owner: { login: 'anthropics' } })));
});

test('archived and forked repos are rejected', () => {
  assert.ok(!isLikelyMcpServer(repo({ name: 'mcp-server-x', archived: true })));
  assert.ok(!isLikelyMcpServer(repo({ name: 'mcp-server-x', fork: true })));
});

test('awesome-lists are rejected even when MCP-named', () => {
  assert.ok(!isLikelyMcpServer(repo({ name: 'awesome-mcp-servers', topics: ['mcp-server'] })));
});

test('"mcp" in the repo name qualifies (fastmcp, litemcp)', () => {
  assert.ok(isLikelyMcpServer(repo({ name: 'fastmcp' })));
  assert.ok(isLikelyMcpServer(repo({ name: 'litemcp' })));
});

test('a bare "mcp" topic does NOT qualify (topic-spam from unrelated giants)', () => {
  // The JavaGuide case: 156k-star Java interview guide tagged `mcp`
  assert.ok(!isLikelyMcpServer(repo({ name: 'JavaGuide', topics: ['java', 'interview', 'mcp'] })));
});

test('specific mcp-server / mcp-client / model-context-protocol topics qualify', () => {
  assert.ok(isLikelyMcpServer(repo({ name: 'n8n', topics: ['workflow', 'mcp-server'] })));
  assert.ok(isLikelyMcpServer(repo({ name: 'gemini-cli', topics: ['mcp-client'] })));
  assert.ok(isLikelyMcpServer(repo({ name: 'thing', topics: ['model-context-protocol'] })));
});

test('MCP named in the description qualifies', () => {
  assert.ok(isLikelyMcpServer(repo({ name: 'context-bridge', description: 'An MCP server for Postgres' })));
  assert.ok(isLikelyMcpServer(repo({ name: 'bridge', description: 'Implements the Model Context Protocol' })));
  assert.ok(!isLikelyMcpServer(repo({ name: 'compcert-tools', description: 'Formal verification helpers' })));
});

test('inferCategory reads curated metadata only and picks the first matching rule', () => {
  assert.equal(inferCategory(repo({ name: 'pg-mcp', description: 'Postgres MCP server' })), 'database');
  assert.equal(inferCategory(repo({ name: 'mcp-slack', description: 'Slack messaging for MCP' })), 'communication');
  assert.equal(inferCategory(repo({ name: 'mystery-mcp', description: 'An MCP server' })), 'other');
});

test('slugify produces stable url-safe slugs', () => {
  assert.equal(slugify('Owner-Name/Repo Name!'), 'owner-name-repo-name');
  assert.equal(slugify('--Weird__Input--'), 'weird-input');
});
