// @ts-check
import sitemap from '@astrojs/sitemap';
import { defineConfig, envField, fontProviders } from 'astro/config';
import { loadEnv } from 'vite';

const env = loadEnv(process.env.NODE_ENV ?? 'production', process.cwd(), '');
const { PUBLIC_SITE_URL } = env;

/** Avisa no build quando o formulário de contato não tem para onde enviar os leads. */
const contactDestinationCheck = {
  name: 'tivexy:contact-destination',
  hooks: {
    /** @param {{ logger: import('astro').AstroIntegrationLogger }} options */
    'astro:build:done': ({ logger }) => {
      if (!env.PUBLIC_LEADS_ENDPOINT && !env.PUBLIC_WHATSAPP_NUMBER && !env.PUBLIC_CONTACT_EMAIL) {
        logger.warn(
          'Formulário de contato sem destino. Defina PUBLIC_LEADS_ENDPOINT, PUBLIC_WHATSAPP_NUMBER ou PUBLIC_CONTACT_EMAIL (veja .env.example).',
        );
      }
      if (!PUBLIC_SITE_URL) {
        logger.warn('PUBLIC_SITE_URL não definido: usando https://tivexy.com.br em canonical, sitemap e Open Graph.');
      }
    },
  },
};

// https://astro.build/config
export default defineConfig({
  site: PUBLIC_SITE_URL || 'https://tivexy.com.br',
  trailingSlash: 'ignore',
  devToolbar: { enabled: false },
  // CSS embutido no HTML: medido mais rápido que folhas externas (LCP e layout inicial).
  build: { inlineStylesheets: 'always' },
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/404'),
    }),
    contactDestinationCheck,
  ],
  fonts: [
    {
      provider: fontProviders.fontsource(),
      name: 'Manrope',
      cssVariable: '--font-manrope',
      weights: ['500 800'],
      styles: ['normal'],
      subsets: ['latin'],
      fallbacks: ['sans-serif'],
    },
    {
      provider: fontProviders.fontsource(),
      name: 'Inter',
      cssVariable: '--font-inter',
      weights: ['400 700'],
      styles: ['normal'],
      subsets: ['latin'],
      fallbacks: ['sans-serif'],
    },
    {
      provider: fontProviders.fontsource(),
      name: 'Geist Mono',
      cssVariable: '--font-geist-mono',
      weights: ['400 600'],
      styles: ['normal'],
      subsets: ['latin'],
      fallbacks: ['monospace'],
    },
  ],
  env: {
    schema: {
      PUBLIC_WHATSAPP_NUMBER: envField.string({
        context: 'client',
        access: 'public',
        optional: true,
      }),
      PUBLIC_CONTACT_EMAIL: envField.string({
        context: 'client',
        access: 'public',
        optional: true,
      }),
      PUBLIC_LEADS_ENDPOINT: envField.string({
        context: 'client',
        access: 'public',
        optional: true,
      }),
    },
  },
});
