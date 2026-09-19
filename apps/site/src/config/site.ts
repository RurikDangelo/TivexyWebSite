import { PUBLIC_CONTACT_EMAIL, PUBLIC_WHATSAPP_NUMBER } from 'astro:env/client';

export const site = {
  name: 'Tivexy',
  title: 'Tivexy — Sistemas, SaaS e Automação para Empresas',
  description:
    'A Tivexy desenvolve sistemas, SaaS, automações e soluções com inteligência artificial para transformar processos e acelerar empresas.',
  positioning:
    'Transformamos processos complexos em soluções tecnológicas simples, inteligentes e escaláveis.',
  lang: 'pt-BR',
  locale: 'pt_BR',
} as const;

export interface NavItem {
  label: string;
  /** id da seção na página inicial */
  section: string;
}

export const primaryNav: NavItem[] = [
  { label: 'Soluções', section: 'solucoes' },
  { label: 'SaaS', section: 'saas' },
  { label: 'Como funciona', section: 'como-funciona' },
  { label: 'Sobre', section: 'sobre' },
  { label: 'Contato', section: 'contato' },
];

/** Link para uma seção da página inicial, funcionando a partir de qualquer página. */
export function sectionHref(section: string, params?: Record<string, string>): string {
  const query = params ? `?${new URLSearchParams(params).toString()}` : '';
  return `/${query}#${section}`;
}

export const contact = {
  whatsappNumber: (PUBLIC_WHATSAPP_NUMBER ?? '').replace(/\D/g, ''),
  email: PUBLIC_CONTACT_EMAIL ?? '',
};

export const hasWhatsapp = contact.whatsappNumber.length >= 12;
export const hasEmail = contact.email.includes('@');

export const whatsappDefaultMessage =
  'Olá, Tivexy! Quero conversar sobre uma solução para a minha empresa.';

export function whatsappUrl(message: string = whatsappDefaultMessage): string {
  return `https://wa.me/${contact.whatsappNumber}?text=${encodeURIComponent(message)}`;
}
