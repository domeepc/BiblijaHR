import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';

// Set `base` (e.g. '/BiblijaHR') when deploying under a sub-path such as GitHub Pages.
export default defineConfig({
  integrations: [preact()],
  trailingSlash: 'always',
});
