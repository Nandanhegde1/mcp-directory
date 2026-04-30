/// <reference path="../.astro/types.d.ts" />

interface ImportMetaEnv {
  readonly SITE_URL?: string;
  readonly PUBLIC_FORMSPREE_ID?: string;
  readonly PUBLIC_STRIPE_FEATURED_LINK?: string;
  readonly PUBLIC_ADSENSE_CLIENT?: string;
  readonly PUBLIC_AFFILIATE_ANTHROPIC?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
