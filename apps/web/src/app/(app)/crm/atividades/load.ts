import 'server-only';

/**
 * A agenda lida do banco, já em faixas e em texto.
 *
 * Um lugar só para a página da agenda e para as páginas de pessoa, conta e
 * oportunidade: as quatro mostram as mesmas atividades do mesmo jeito, e uma
 * segunda consulta parecida em outra tela é a que ia esquecer o `tenant_id`.
 */

import { type AgendaBucket, agendaBucket } from '@tivexy/core';

import { atraso, quando } from '@/lib/crm/agenda-text';
import type { ColunaDeAlvo, TipoDeAlvo } from '@/lib/crm/activity-input';
import { type Member, nomeDe } from '@/lib/members';
import { supabaseServer } from '@/lib/supabase/server';

import type { SecaoDaAgenda } from './agenda';
import type { ItemDaAgenda } from './state';

const SELECAO =
  'id, subject, notes, due_at, done_at, owner_id, type:crm_activity_types(name), lead:crm_leads(id, name), contact:crm_contacts(id, name), company:crm_companies(id, name), deal:crm_deals(id, title)';

const HISTORICO_DIAS = 7;

const TITULOS: Record<AgendaBucket | 'done', string> = {
  overdue: 'Com atraso',
  today: 'Hoje',
  tomorrow: 'Amanhã',
  week: 'Próximos 7 dias',
  later: 'Mais adiante',
  undated: 'Sem data',
  done: `Histórico · ${HISTORICO_DIAS} dias`,
};

type Linha = Record<string, unknown>;

function embutido(valor: unknown): Linha | null {
  const linha = Array.isArray(valor) ? valor[0] : valor;
  return linha !== null && typeof linha === 'object' ? (linha as Linha) : null;
}

/** O alvo da atividade: a única das quatro colunas preenchida. */
function alvoDe(linha: Linha): ItemDaAgenda['alvo'] {
  const candidatos: [TipoDeAlvo, string, string][] = [
    ['lead', 'lead', 'name'],
    ['contato', 'contact', 'name'],
    ['conta', 'company', 'name'],
    ['negocio', 'deal', 'title'],
  ];
  for (const [tipo, chave, campoNome] of candidatos) {
    const alvo = embutido(linha[chave]);
    if (alvo !== null) return { tipo, id: String(alvo.id), nome: String(alvo[campoNome]) };
  }
  /* O alvo existe e o RLS esconde — quem lê a agenda não lê leads, por exemplo. */
  return null;
}

export interface FiltroDaAgenda {
  /** Só as atividades deste alvo — a agenda dentro da página de uma pessoa. */
  alvo?: { coluna: ColunaDeAlvo; id: string };
  /** Só as de quem responde. */
  responsavelId?: string | null;
}

export async function loadAgenda(
  tenantId: string,
  fuso: string,
  membros: readonly Member[],
  filtro: FiltroDaAgenda = {},
): Promise<{ secoes: SecaoDaAgenda[]; pendentes: number; atrasadas: number; hoje: number }> {
  const agora = new Date();
  const desde = new Date(agora.getTime() - HISTORICO_DIAS * 86_400_000).toISOString();
  const supabase = await supabaseServer();

  const base = () => {
    let q = supabase.from('crm_activities').select(SELECAO).eq('tenant_id', tenantId);
    if (filtro.alvo !== undefined) q = q.eq(filtro.alvo.coluna, filtro.alvo.id);
    if (filtro.responsavelId) q = q.eq('owner_id', filtro.responsavelId);
    return q;
  };

  const [pendentesR, feitasR] = await Promise.all([
    base().is('done_at', null).order('due_at', { ascending: true, nullsFirst: false }).limit(500),
    base().gte('done_at', desde).order('done_at', { ascending: false }).limit(50),
  ]);

  const paraItem = (linha: Linha, faixa: AgendaBucket | 'done'): ItemDaAgenda => {
    const venceEm = typeof linha.due_at === 'string' ? linha.due_at : null;
    return {
      id: String(linha.id),
      assunto: String(linha.subject),
      tipo: (embutido(linha.type)?.name as string | undefined) ?? null,
      faixa,
      quando: venceEm === null ? null : quando(venceEm, faixa === 'done' ? 'later' : faixa, fuso),
      atraso: faixa === 'overdue' && venceEm !== null ? atraso(venceEm, agora, fuso) : null,
      alvo: alvoDe(linha),
      responsavel: nomeDe(membros, linha.owner_id),
      notas: typeof linha.notes === 'string' && linha.notes !== '' ? linha.notes : null,
    };
  };

  const porFaixa = new Map<AgendaBucket | 'done', ItemDaAgenda[]>();
  for (const linha of (pendentesR.data ?? []) as Linha[]) {
    const venceEm = typeof linha.due_at === 'string' ? linha.due_at : null;
    const faixa = agendaBucket(venceEm, agora, fuso);
    porFaixa.set(faixa, [...(porFaixa.get(faixa) ?? []), paraItem(linha, faixa)]);
  }
  porFaixa.set(
    'done',
    ((feitasR.data ?? []) as Linha[]).map((linha) => paraItem(linha, 'done')),
  );

  const ordem: (AgendaBucket | 'done')[] = [
    'overdue',
    'today',
    'tomorrow',
    'week',
    'later',
    'undated',
    'done',
  ];

  return {
    secoes: ordem.map((chave) => ({
      chave,
      titulo: TITULOS[chave],
      itens: porFaixa.get(chave) ?? [],
      alerta: chave === 'overdue',
    })),
    pendentes: pendentesR.data?.length ?? 0,
    atrasadas: porFaixa.get('overdue')?.length ?? 0,
    hoje: porFaixa.get('today')?.length ?? 0,
  };
}
