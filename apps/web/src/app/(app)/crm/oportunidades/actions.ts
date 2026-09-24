'use server';

/**
 * As escritas da tela do funil.
 *
 * Mesmas duas regras das outras telas do módulo: `requireAccess()` roda aqui
 * dentro porque Server Action é endpoint, e o tenant vem da sessão, nunca do
 * formulário. Ver `crm/leads/actions.ts` para o motivo de cada uma.
 *
 * ## O funil é lido da etapa, nunca recebido do formulário
 *
 * `crm_deals` guarda `pipeline_id` **e** `stage_id`, e o gatilho
 * `assert_deal_stage_in_pipeline` recusa a linha em que os dois discordam.
 * Seria cômodo o formulário mandar os dois — e seria a origem de um defeito
 * de dado: quem editasse o campo escondido gravaria a oportunidade no funil A
 * apontando para etapa do funil B. O gatilho pega, e a mensagem que chega na
 * tela fala de nome de função.
 *
 * Então o servidor consulta a etapa e **deduz** o funil dela. O formulário
 * escolhe uma coisa só, que é o que a pessoa de fato escolheu.
 */

import { parseCents } from '@tivexy/core';
import { revalidatePath } from 'next/cache';

import { requireAccess } from '@/lib/auth/require';
import { mensagemDeErro, opcional, texto } from '@/lib/crm/form';
import { supabaseServer } from '@/lib/supabase/server';

import { OPORTUNIDADE_INICIAL, type OportunidadeFormState } from './state.ts';

/** De onde a tela lê e escreve. Uma constante: o caminho também é a regra. */
const ROTA = '/crm/oportunidades';

/** `YYYY-MM-DD`, que é o que `<input type="date">` manda e a coluna `date` aceita. */
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function criarOportunidade(
  _anterior: OportunidadeFormState,
  form: FormData,
): Promise<OportunidadeFormState> {
  const { choice } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') {
    return { ...OPORTUNIDADE_INICIAL, erro: 'Escolha uma empresa antes de cadastrar.' };
  }

  const campos: Record<string, string> = {};

  const titulo = texto(form, 'title');
  if (titulo === '') campos.title = 'Obrigatório.';

  const etapaId = texto(form, 'stage_id');
  if (etapaId === '') campos.stage_id = 'Escolha a etapa onde ela entra.';

  /*
   * Valor em branco é zero, e valor torto é erro. A diferença importa: quem
   * ainda não sabe quanto vale deixa vazio de propósito, e quem digitou
   * `1.2.3` errou — transformar os dois em zero esconde o segundo, e o que
   * some é justamente o número que vai para o relatório.
   */
  const bruto = texto(form, 'value_cents');
  const centavos = bruto === '' ? 0 : parseCents(bruto);
  if (centavos === null) campos.value_cents = 'Use 1.234,56.';

  const previsao = texto(form, 'expected_close_date');
  if (previsao !== '' && !DATA_ISO.test(previsao)) {
    campos.expected_close_date = 'Data inválida.';
  }

  if (Object.keys(campos).length > 0) {
    return { ...OPORTUNIDADE_INICIAL, campos: campos as OportunidadeFormState['campos'] };
  }

  const supabase = await supabaseServer();

  /*
   * A etapa, e o funil dela. A leitura passa pelo RLS e pelo tenant da sessão,
   * então uma etapa de outro tenant não volta — e o `null` resultante vira
   * mensagem, sem confirmar a quem tentou que aquele identificador existe.
   */
  const { data: etapa } = await supabase
    .from('crm_pipeline_stages')
    .select('id, pipeline_id')
    .eq('id', etapaId)
    .eq('tenant_id', choice.tenant.id)
    .maybeSingle();

  if (etapa === null) {
    return { ...OPORTUNIDADE_INICIAL, campos: { stage_id: 'Essa etapa não é deste funil.' } };
  }

  const { error } = await supabase.from('crm_deals').insert({
    tenant_id: choice.tenant.id,
    pipeline_id: String(etapa.pipeline_id),
    stage_id: etapaId,
    title: titulo,
    value_cents: centavos,
    company_id: opcional(form, 'company_id'),
    contact_id: opcional(form, 'contact_id'),
    expected_close_date: previsao === '' ? null : previsao,
    notes: opcional(form, 'notes'),
  });

  if (error !== null) {
    return {
      ...OPORTUNIDADE_INICIAL,
      erro: mensagemDeErro(error, 'Você não tem permissão para cadastrar oportunidades aqui.'),
    };
  }

  revalidatePath(ROTA);
  return { ...OPORTUNIDADE_INICIAL, criado: titulo };
}

/**
 * Move a oportunidade de etapa.
 *
 * **Não escreve `closed_at`.** Quem mantém essa coluna é o gatilho
 * `sync_deal_closed_at`: entrou em etapa terminal, carimba; saiu, limpa. A
 * aplicação carimbar junto seria a segunda verdade que o esquema recusou ter —
 * e a que diverge no dia em que alguém mover a etapa por importação ou por SQL.
 *
 * Também não escreve `pipeline_id`: mover dentro do funil não troca de funil,
 * e mover **entre** funis é outra operação — ela precisaria decidir o que
 * fazer com o histórico, e não é esta tela que decide isso.
 */
export async function moverOportunidade(form: FormData): Promise<void> {
  const { choice } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') return;

  const id = texto(form, 'id');
  const de = texto(form, 'de');
  const para = texto(form, 'para');
  if (id === '' || para === '' || para === de) return;

  const supabase = await supabaseServer();

  /*
   * A etapa de destino precisa ser do mesmo funil da oportunidade. O gatilho
   * `assert_deal_stage_in_pipeline` já recusaria, e conferir antes é o que
   * evita gravar metade: aqui a recusa é silenciosa e a tela simplesmente não
   * muda, em vez de mostrar erro de nome de função para quem clicou.
   */
  const { data: destino } = await supabase
    .from('crm_pipeline_stages')
    .select('id, pipeline_id')
    .eq('id', para)
    .eq('tenant_id', choice.tenant.id)
    .maybeSingle();

  if (destino === null) return;

  await supabase
    .from('crm_deals')
    .update({ stage_id: para })
    .eq('id', id)
    /*
     * O tenant no `where`, mesmo com o RLS filtrando. Sem ele, um id de outra
     * empresa em que a pessoa **também** trabalha seria atualizado a partir da
     * tela da empresa errada — o RLS deixaria passar, porque ela tem permissão
     * nas duas.
     */
    .eq('tenant_id', choice.tenant.id)
    /* E o funil: a etapa de destino é deste funil, então a origem também precisa ser. */
    .eq('pipeline_id', String(destino.pipeline_id))
    /* E a etapa de origem: dois cliques rápidos não aplicam o movimento duas vezes. */
    .eq('stage_id', de);

  revalidatePath(ROTA);
}
