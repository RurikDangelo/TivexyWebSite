/**
 * O que o formulário de pessoa manda, conferido antes do banco.
 *
 * `exigirDocumento` vem de `crm.contact_requires_document` — a clínica liga,
 * porque paciente sem CPF não tem como ser atendido pelo convênio. A regra de
 * CPF e CNPJ é a do Core (`checkDocument`), que é a mesma da constraint.
 */

import { checkDocument } from '@tivexy/core';

import { campo, idOpcional, opcional } from '../ids.ts';

export interface ContactInput {
  nome: string;
  email: string | null;
  telefone: string | null;
  documento: string | null;
  cargo: string | null;
  contaId: string | null;
  responsavelId: string | null;
  notas: string | null;
}

export type ContactField = 'nome' | 'email' | 'telefone' | 'documento' | 'cargo' | 'notas';

export type ContactCheck =
  { ok: true; valor: ContactInput } | { ok: false; campos: Partial<Record<ContactField, string>> };

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function parseContactInput(
  form: FormData,
  { exigirDocumento }: { exigirDocumento: boolean },
): ContactCheck {
  const campos: Partial<Record<ContactField, string>> = {};

  const nome = campo(form, 'nome');
  if (nome === '') campos.nome = 'Obrigatório.';
  else if (nome.length > 160) campos.nome = 'No máximo 160 caracteres.';

  const email = opcional(form, 'email');
  if (email !== null && !EMAIL.test(email)) campos.email = 'Não parece um e-mail.';

  const telefone = opcional(form, 'telefone');
  if (telefone !== null && telefone.replace(/\D/g, '').length < 8) {
    campos.telefone = 'Curto demais para um telefone.';
  }

  let documento: string | null = null;
  const docBruto = opcional(form, 'documento');
  if (docBruto === null) {
    if (exigirDocumento) campos.documento = 'Obrigatório nesta empresa.';
  } else {
    const conferido = checkDocument(docBruto);
    if (conferido.ok) documento = conferido.value;
    else campos.documento = conferido.error;
  }

  const cargo = opcional(form, 'cargo');
  if (cargo !== null && cargo.length > 120) campos.cargo = 'No máximo 120 caracteres.';

  const notas = opcional(form, 'notas');
  if (notas !== null && notas.length > 5000) campos.notas = 'No máximo 5000 caracteres.';

  if (Object.keys(campos).length > 0) return { ok: false, campos };

  return {
    ok: true,
    valor: {
      nome,
      email: email?.toLowerCase() ?? null,
      telefone,
      documento,
      cargo,
      contaId: idOpcional(form, 'conta'),
      responsavelId: idOpcional(form, 'responsavel'),
      notas,
    },
  };
}
