import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';

// Set `base` (e.g. '/BiblijaHR') when deploying under a sub-path such as GitHub Pages.
export default defineConfig({
  integrations: [preact()],
  // The source is already a compact WebP; keep Astro's <Image> pipeline usable
  // without requiring Sharp in offline builds.
  image: { service: { entrypoint: 'astro/assets/services/noop' } },
  trailingSlash: 'always',
});
