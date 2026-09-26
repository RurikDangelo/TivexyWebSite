/**
 * O que o formulário de conta manda, conferido antes do banco.
 *
 * Documento é opcional aqui — conta é empresa com quem se negocia, e muita
 * negociação começa antes de se saber o CNPJ. Quando vem, é conferido pelo
 * Core, inclusive o CNPJ novo, com letras.
 */

import { checkDocument } from '@tivexy/core';

import { campo, idOpcional, opcional } from '../ids.ts';

export interface CompanyInput {
  nome: string;
  razaoSocial: string | null;
  documento: string | null;
  email: string | null;
  telefone: string | null;
  site: string | null;
  responsavelId: string | null;
  notas: string | null;
}

export type CompanyField =
  'nome' | 'razaoSocial' | 'documento' | 'email' | 'telefone' | 'site' | 'notas';

export type CompanyCheck =
  { ok: true; valor: CompanyInput } | { ok: false; campos: Partial<Record<CompanyField, string>> };

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * O site, com esquema. `exemplo.com.br` vira `https://exemplo.com.br`.
 *
 * Guardar sem esquema faria o link da página da conta apontar para um caminho
 * relativo do próprio Tivexy — `/crm/empresas/exemplo.com.br`. Só `http` e
 * `https`: `javascript:` num link clicável é a porta clássica.
 */
export function normalizeWebsite(bruto: string): string | null {
  const texto = bruto.trim();
  const comEsquema = /^[a-z][a-z0-9+.-]*:/i.test(texto) ? texto : `https://${texto}`;
  try {
    const url = new URL(comEsquema);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname.includes('.')) return null;
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

export function parseCompanyInput(form: FormData): CompanyCheck {
  const campos: Partial<Record<CompanyField, string>> = {};

  const nome = campo(form, 'nome');
  if (nome === '') campos.nome = 'Obrigatório.';
  else if (nome.length > 160) campos.nome = 'No máximo 160 caracteres.';

  const razaoSocial = opcional(form, 'razaoSocial');
  if (razaoSocial !== null && razaoSocial.length > 200) {
    campos.razaoSocial = 'No máximo 200 caracteres.';
  }

  let documento: string | null = null;
  const docBruto = opcional(form, 'documento');
  if (docBruto !== null) {
    const conferido = checkDocument(docBruto);
    if (conferido.ok) documento = conferido.value;
    else campos.documento = conferido.error;
  }

  const email = opcional(form, 'email');
  if (email !== null && !EMAIL.test(email)) campos.email = 'Não parece um e-mail.';

  const telefone = opcional(form, 'telefone');
  if (telefone !== null && telefone.replace(/\D/g, '').length < 8) {
    campos.telefone = 'Curto demais para um telefone.';
  }

  let site: string | null = null;
  const siteBruto = opcional(form, 'site');
  if (siteBruto !== null) {
    site = normalizeWebsite(siteBruto);
    if (site === null) campos.site = 'Não parece um endereço de site.';
  }

  const notas = opcional(form, 'notas');
  if (notas !== null && notas.length > 5000) campos.notas = 'No máximo 5000 caracteres.';

  if (Object.keys(campos).length > 0) return { ok: false, campos };

  return {
    ok: true,
    valor: {
      nome,
      razaoSocial,
      documento,
      email: email?.toLowerCase() ?? null,
      telefone,
      site,
      responsavelId: idOpcional(form, 'responsavel'),
      notas,
    },
  };
}
