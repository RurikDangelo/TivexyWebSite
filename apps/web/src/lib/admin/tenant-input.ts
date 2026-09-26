/**
 * O formulário de dados da empresa, no Admin.
 *
 * O documento passa pela mesma conferência do resto do sistema — CPF ou CNPJ,
 * inclusive o de letras —, e a mensagem diz o que está errado. O slug não
 * está aqui: vira subdomínio, e mudar quebraria todo link já enviado.
 */

import { checkDocument } from '@tivexy/core';

export type TenantField = 'nome' | 'razaoSocial' | 'documento';

export type TenantInput =
  | { ok: true; valor: { nome: string; razaoSocial: string | null; documento: string | null } }
  | { ok: false; campos: Partial<Record<TenantField, string>> };

function texto(form: FormData, campo: string): string {
  const valor = form.get(campo);
  return typeof valor === 'string' ? valor.trim() : '';
}

export function parseTenantInput(form: FormData): TenantInput {
  const campos: Partial<Record<TenantField, string>> = {};
  const nome = texto(form, 'nome');
  const razaoSocial = texto(form, 'razaoSocial');
  const documentoDigitado = texto(form, 'documento');

  if (nome === '') campos.nome = 'Dê um nome à empresa.';
  else if (nome.length > 120) campos.nome = 'No máximo 120 caracteres.';
  if (razaoSocial.length > 200) campos.razaoSocial = 'No máximo 200 caracteres.';

  let documento: string | null = null;
  if (documentoDigitado !== '') {
    const conferido = checkDocument(documentoDigitado);
    if (conferido.ok) documento = conferido.value;
    else campos.documento = conferido.error;
  }

  if (Object.keys(campos).length > 0) return { ok: false, campos };
  return {
    ok: true,
    valor: { nome, razaoSocial: razaoSocial === '' ? null : razaoSocial, documento },
  };
}
