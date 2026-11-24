import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  // The app serves the docs under /docs; a standalone host (Netlify) sets DOCS_BASE=/
  base: process.env.DOCS_BASE ?? '/docs',
  // Netlify sets URL to the site's address (canonical links, sitemap)
  site: process.env.URL,
  integrations: [
    starlight({
      title: 'relief',
      logo: { src: './src/assets/logo.svg', alt: 'relief' },
      defaultLocale: 'root',
      locales: {
        root: { label: 'Français', lang: 'fr' },
        en: { label: 'English', lang: 'en' },
      },
      sidebar: [
        {
          label: 'Commencer',
          translations: { en: 'Get started' },
          slug: 'getting-started',
        },
        { label: 'La carte', translations: { en: 'The map' }, slug: 'map' },
        {
          label: 'Espace de travail',
          translations: { en: 'Workspace' },
          slug: 'workspace',
        },
        { label: 'Relire une PR', translations: { en: 'Review a PR' }, slug: 'review' },
        {
          label: "Règles d'architecture",
          translations: { en: 'Architecture rules' },
          slug: 'rules',
        },
        { label: 'Explorer un repo', translations: { en: 'Explore a repo' }, slug: 'explore' },
        { label: 'Référence CLI', translations: { en: 'CLI reference' }, slug: 'cli' },
        { label: 'À propos', translations: { en: 'About' }, slug: 'about' },
      ],
    }),
  ],
});
