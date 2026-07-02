// @ts-check
import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';

import cloudflare from "@astrojs/cloudflare";

// The live deploy is the Cloudflare Worker below. Override with SITE_URL env once a custom domain is bought.
const SITE_URL = process.env.SITE_URL || 'https://mcp-directory.nandanhegde1096.workers.dev';

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