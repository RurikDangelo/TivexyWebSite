import { contact, hasEmail, hasWhatsapp, site } from './site';

type Schema = Record<string, unknown>;

export function organizationSchema(siteUrl: URL): Schema {
  const contactPoint =
    hasEmail || hasWhatsapp
      ? {
          '@type': 'ContactPoint',
          contactType: 'sales',
          availableLanguage: ['Portuguese'],
          ...(hasEmail ? { email: contact.email } : {}),
          ...(hasWhatsapp ? { telephone: `+${contact.whatsappNumber}` } : {}),
        }
      : undefined;

  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': new URL('/#organizacao', siteUrl).href,
    name: site.name,
    url: siteUrl.href,
    logo: new URL('/logo.png', siteUrl).href,
    description: site.description,
    slogan: site.positioning,
    areaServed: { '@type': 'Country', name: 'Brasil' },
    knowsAbout: [
      'Desenvolvimento de sistemas',
      'SaaS',
      'Automação de processos',
      'Integrações',
      'Inteligência artificial',
    ],
    ...(contactPoint ? { contactPoint } : {}),
  };
}

export function websiteSchema(siteUrl: URL): Schema {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: site.name,
    url: siteUrl.href,
    inLanguage: site.lang,
    publisher: { '@id': new URL('/#organizacao', siteUrl).href },
  };
}

export function breadcrumbSchema(siteUrl: URL, items: { name: string; path: string }[]): Schema {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: new URL(item.path, siteUrl).href,
    })),
  };
}

export function serviceSchema(
  siteUrl: URL,
  service: { name: string; description: string; path: string },
): Schema {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: service.name,
    description: service.description,
    url: new URL(service.path, siteUrl).href,
    areaServed: { '@type': 'Country', name: 'Brasil' },
    provider: { '@id': new URL('/#organizacao', siteUrl).href },
  };
}
