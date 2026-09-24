'use server';

/**
 * As escritas da agenda.
 *
 * Mesmas duas regras das outras telas do módulo: `requireAccess()` roda aqui
 * dentro porque Server Action é endpoint, e o tenant vem da sessão, nunca do
 * formulário. Ver `crm/leads/actions.ts` para o motivo de cada uma.
 *
 * ## O alvo é um campo só, porque a constraint diz que é um alvo só
 *
 * `crm_activities_one_target` exige **exatamente uma** das quatro colunas de
 * alvo preenchida. Quatro campos na tela poderiam discordar entre si, e a
 * pessoa descobriria no erro de constraint. Um campo só não tem como
 * discordar: a escolha chega como `lead:<uuid>`, e o servidor decide em qual
 * coluna ela cai.
 *
 * ## O prazo é hora de parede, e precisa de fuso para virar instante
 *
 * `<input type="datetime-local">` manda `2026-09-24T14:30`, sem fuso.
 * Interpretar isso com `new Date()` usaria o fuso do **servidor**, que na
 * Vercel é UTC — a atividade das duas e meia da tarde entraria como 11:30 e
 * nasceria atrasada. Quem resolve é `zonedToUtc` com o fuso do tenant.
 */

import { zonedToUtc } from '@tivexy/core';
import { revalidatePath } from 'next/cache';

import { requireAccess } from '@/lib/auth/require';
import { mensagemDeErro, opcional, texto } from '@/lib/crm/form';
import { supabaseServer } from '@/lib/supabase/server';
import { currentTimeZone } from '@/lib/tenant/settings';

import {
  ALVOS,
  ATIVIDADE_INICIAL,
  type AtividadeFormState,
  COLUNA_DO_ALVO,
  type TipoDeAlvo,
} from './state.ts';

/** De onde a tela lê e escreve. Uma constante: o caminho também é a regra. */
const ROTA = '/crm/atividades';

/**
 * `lead:<uuid>` → o tipo e o id, ou `null`.
 *
 * O tipo é conferido contra a lista de `ALVOS` — não contra o que veio. Um
 * valor inventado no formulário viraria nome de coluna, e nome de coluna
 * montado a partir de entrada da rede é como se escreve injeção de SQL sem
 * perceber.
 */
function lerAlvo(bruto: string): { tipo: TipoDeAlvo; id: string } | null {
  const separador = bruto.indexOf(':');
  if (separador < 1) return null;

  const tipo = bruto.slice(0, separador);
  const id = bruto.slice(separador + 1);

  if (id === '' || !(ALVOS as readonly string[]).includes(tipo)) return null;
  return { tipo: tipo as TipoDeAlvo, id };
}

/** A tabela onde cada tipo de alvo mora, para conferir que ele é deste tenant. */
const TABELA_DO_ALVO: Record<TipoDeAlvo, string> = {
  lead: 'crm_leads',
  contact: 'crm_contacts',
  company: 'crm_companies',
  deal: 'crm_deals',
};

export async function criarAtividade(
  _anterior: AtividadeFormState,
  form: FormData,
): Promise<AtividadeFormState> {
  const { choice } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') {
    return { ...ATIVIDADE_INICIAL, erro: 'Escolha uma empresa antes de cadastrar.' };
  }

  const campos: Record<string, string> = {};

  const assunto = texto(form, 'subject');
  if (assunto === '') campos.subject = 'Obrigatório.';

  const alvo = lerAlvo(texto(form, 'alvo'));
  if (alvo === null) campos.alvo = 'Escolha sobre quem é a atividade.';

  /*
   * O prazo é opcional: anotar "ligar quando sobrar tempo" é uso legítimo, e
   * exigir data faria a pessoa inventar uma. O que não é opcional é a data
   * fazer sentido quando vem.
   */
  const prazoBruto = texto(form, 'due_at');
  const fuso = await currentTimeZone();
  const prazo = prazoBruto === '' ? null : zonedToUtc(prazoBruto, fuso);
  if (prazoBruto !== '' && prazo === null) campos.due_at = 'Data inválida.';

  if (Object.keys(campos).length > 0) {
    return { ...ATIVIDADE_INICIAL, campos: campos as AtividadeFormState['campos'] };
  }

  const supabase = await supabaseServer();
  const escolhido = alvo as { tipo: TipoDeAlvo; id: string };

  /*
   * O alvo precisa ser deste tenant. A chave estrangeira composta já
   * recusaria, e conferir antes troca um erro de constraint por uma frase —
   * e a leitura passa pelo RLS, então um id de outro tenant simplesmente não
   * volta, sem confirmar a quem tentou que ele existe.
   */
  const { data: existe } = await supabase
    .from(TABELA_DO_ALVO[escolhido.tipo])
    .select('id')
    .eq('id', escolhido.id)
    .eq('tenant_id', choice.tenant.id)
    .maybeSingle();

  if (existe === null) {
    return { ...ATIVIDADE_INICIAL, campos: { alvo: 'Esse registro não está na sua lista.' } };
  }

  const { error } = await supabase.from('crm_activities').insert({
    tenant_id: choice.tenant.id,
    subject: assunto,
    notes: opcional(form, 'notes'),
    type_id: opcional(form, 'type_id'),
    due_at: prazo === null ? null : prazo.toISOString(),
    [COLUNA_DO_ALVO[escolhido.tipo]]: escolhido.id,
  });

  if (error !== null) {
    return {
      ...ATIVIDADE_INICIAL,
      erro: mensagemDeErro(error, 'Você não tem permissão para registrar atividades aqui.'),
    };
  }

  revalidatePath(ROTA);
  return { ...ATIVIDADE_INICIAL, criado: assunto };
}

/**
 * Conclui ou reabre uma atividade.
 *
 * Uma ação só para os dois sentidos, e o estado atual vem no formulário: ela
 * confere que a atividade ainda está como a tela achava antes de gravar. Dois
 * cliques rápidos não alternam duas vezes, e a tela velha de outra aba não
 * desfaz o que alguém acabou de fazer.
 *
 * **Reabrir existe** porque concluir por engano é o clique mais fácil desta
 * tela. Sem o caminho de volta, o jeito de corrigir seria cadastrar de novo —
 * e a agenda ficaria com duas linhas para a mesma coisa.
 */
export async function alternarAtividade(form: FormData): Promise<void> {
  const { choice } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') return;

  const id = texto(form, 'id');
  if (id === '') return;

  /* `concluida` é o estado que a tela viu, não o que ela quer. */
  const estavaConcluida = texto(form, 'concluida') === 'sim';

  const supabase = await supabaseServer();
  const consulta = supabase
    .from('crm_activities')
    .update({ done_at: estavaConcluida ? null : new Date().toISOString() })
    .eq('id', id)
    /* O tenant no `where`, mesmo com o RLS filtrando: quem participa de duas
       empresas tem permissão nas duas, e o RLS não escolhe entre elas. */
    .eq('tenant_id', choice.tenant.id);

  await (estavaConcluida ? consulta.not('done_at', 'is', null) : consulta.is('done_at', null));

  revalidatePath(ROTA);
}
