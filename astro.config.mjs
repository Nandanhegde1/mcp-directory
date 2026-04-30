// @ts-check
import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';

import cloudflare from "@astrojs/cloudflare";

// CHANGE THIS once you buy a domain (e.g., 'https://mcphub.dev')
const SITE_URL = process.env.SITE_URL || 'https://mcp-directory.pages.dev';

export default defineConfig({
  site: SITE_URL,
  integrations: [tailwind(), sitemap()],
  output: 'static',

  build: {
    format: 'directory',
  },

  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'viewport',
  },

  adapter: cloudflare()
});