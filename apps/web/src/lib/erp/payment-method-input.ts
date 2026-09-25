/**
 * O formulário de forma de pagamento, conferido antes do banco.
 *
 * O tipo (`code`) diz ao sistema o que a forma é — é o que acende o cálculo de
 * troco para dinheiro, e o que o Blueprint usa para dar o prazo usual. O
 * prazo diz quando o dinheiro chega: zero é na hora, e a venda já entra no
 * caixa; mais que zero vira conta a receber.
 *
 * Não há "boleto" na lista de propósito: o nome sugeriria que o sistema emite
 * boleto, e ele não emite. Quem recebe por boleto do próprio banco cadastra
 * como "Outro", com o prazo que o banco dá.
 */

import { campo, opcional } from '../ids.ts';

export const TIPOS_DE_FORMA = [
  { codigo: 'cash', rotulo: 'Dinheiro' },
  { codigo: 'pix', rotulo: 'Pix' },
  { codigo: 'debit', rotulo: 'Cartão de débito' },
  { codigo: 'credit', rotulo: 'Cartão de crédito' },
  { codigo: 'voucher', rotulo: 'Vale-alimentação ou refeição' },
  { codigo: 'other', rotulo: 'Outro' },
] as const;

export type CodigoDeForma = (typeof TIPOS_DE_FORMA)[number]['codigo'];

export interface PaymentMethodInput {
  nome: string;
  codigo: CodigoDeForma;
  prazoEmDias: number;
  ativa: boolean;
}

export type PaymentMethodField = 'nome' | 'codigo' | 'prazo';

export type PaymentMethodCheck =
  | { ok: true; valor: PaymentMethodInput }
  | { ok: false; campos: Partial<Record<PaymentMethodField, string>> };

function ehCodigo(valor: string): valor is CodigoDeForma {
  return TIPOS_DE_FORMA.some((t) => t.codigo === valor);
}

export function parsePaymentMethodInput(form: FormData): PaymentMethodCheck {
  const campos: Partial<Record<PaymentMethodField, string>> = {};

  const nome = campo(form, 'nome');
  if (nome === '') campos.nome = 'Dê um nome — é o que aparece no balcão.';
  else if (nome.length > 60) campos.nome = 'No máximo 60 caracteres.';

  const codigoBruto = campo(form, 'codigo');
  const codigo: CodigoDeForma = ehCodigo(codigoBruto) ? codigoBruto : 'other';
  if (!ehCodigo(codigoBruto)) campos.codigo = 'Escolha um tipo da lista.';

  const prazoBruto = opcional(form, 'prazo') ?? '0';
  const prazo = Number(prazoBruto);
  if (!/^\d{1,3}$/.test(prazoBruto) || prazo > 365) {
    campos.prazo = 'Em dias, de 0 a 365. Zero é na hora.';
  }

  if (Object.keys(campos).length > 0) return { ok: false, campos };
  return {
    ok: true,
    valor: { nome, codigo, prazoEmDias: prazo, ativa: form.get('ativa') === 'on' },
  };
}
