import { AlertTriangle, Zap } from 'lucide-react';
import type { Metadata } from 'next';

import {
  AUTOMATION_ACTION_LABEL,
  AUTOMATION_EVENT_LABEL,
  AUTOMATION_OPERATOR_LABEL,
  type AutomationActionKind,
  type AutomationEvent,
  type AutomationOperator,
  formatInstant,
} from '@tivexy/core';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAccess } from '@/lib/auth/require';
import { supabaseServer } from '@/lib/supabase/server';
import { currentTimeZone } from '@/lib/tenant/settings';

import { alternarRegra, apagarRegra } from './actions';
import { RuleForm } from './rule-form';
import type { DisparoListado, RegraListada } from './state';

export const metadata: Metadata = { title: 'Automações' };

/**
 * As automações do cliente.
 *
 * ## ⚠️ Só ação interna
 *
 * Nenhuma automação manda e-mail, mensagem de WhatsApp ou chamada de webhook,
 * e a ausência é fronteira, não atraso: o projeto não tem SMTP próprio nem
 * credencial da Meta. Uma automação que dissesse "notifiquei o cliente" sem
 * notificar ninguém é pior do que automação nenhuma — ela faz a pessoa parar
 * de conferir. A tela diz isso, em vez de deixar procurando a opção.
 *
 * ## O histórico é parte do produto, não depuração
 *
 * Sem ele, automação é mágica: o cliente vê uma atividade que ninguém criou e
 * não tem como descobrir de onde veio. A pergunta "por que isso apareceu na
 * minha agenda?" precisa ter resposta — e as falhas aparecem junto, porque
 * automação que falha calada é pior que automação nenhuma.
 */
export default async function AutomacoesPage() {
  const { choice } = await requireAccess('/automacoes');
  if (choice.kind !== 'resolved') return null;

  const supabase = await supabaseServer();
  const fuso = await currentTimeZone();

  const [regrasResposta, disparosResposta] = await Promise.all([
    supabase
      .from('automation_rules')
      .select('id, name, event, conditions, actions, is_active')
      .eq('tenant_id', choice.tenant.id)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('automation_runs')
      .select('id, rule_id, rule_name, event, succeeded, error, created_at')
      .eq('tenant_id', choice.tenant.id)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  const disparos: DisparoListado[] = (disparosResposta.data ?? []).map((linha) => ({
    id: String(linha.id),
    ruleName: String(linha.rule_name),
    event: String(linha.event),
    succeeded: linha.succeeded === true,
    error: (linha.error as string | null) ?? null,
    createdAt: String(linha.created_at),
  }));

  /* As contagens saem do histórico já carregado — uma consulta a menos, e o
     número é do mesmo recorte que a lista abaixo mostra. */
  const porRegra = new Map<string, { total: number; falhas: number }>();
  for (const linha of disparosResposta.data ?? []) {
    const id = linha.rule_id === null ? null : String(linha.rule_id);
    if (id === null) continue;
    const atual = porRegra.get(id) ?? { total: 0, falhas: 0 };
    atual.total += 1;
    if (linha.succeeded !== true) atual.falhas += 1;
    porRegra.set(id, atual);
  }

  const regras: RegraListada[] = (regrasResposta.data ?? []).map((linha) => {
    const contagem = porRegra.get(String(linha.id)) ?? { total: 0, falhas: 0 };
    return {
      id: String(linha.id),
      name: String(linha.name),
      event: linha.event as AutomationEvent,
      condicoes: Array.isArray(linha.conditions) ? linha.conditions : [],
      acoes: Array.isArray(linha.actions) ? linha.actions : [],
      isActive: linha.is_active === true,
      disparos: contagem.total,
      falhas: contagem.falhas,
    };
  });

  const falhasRecentes = disparos.filter((d) => !d.succeeded);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold text-content sm:text-3xl">Automações</h1>
        <p className="mt-1 text-content-muted">
          Quando acontece isto, faça aquilo. {regras.filter((r) => r.isActive).length} valendo.
        </p>
      </header>

      <p className="mb-6 flex items-start gap-2 rounded-md bg-surface-subtle px-3 py-2 text-sm text-content-muted">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
        <span>
          As ações são <strong>internas</strong>: criar atividade e lançar conta. Não há envio de
          e-mail, WhatsApp nem webhook — o Tivexy ainda não tem esses canais, e uma automação que
          dissesse “avisei o cliente” sem avisar ninguém seria pior do que nenhuma.
        </span>
      </p>

      <div className="mb-6">
        <RuleForm />
      </div>

      {falhasRecentes.length > 0 && (
        <p className="mb-4 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          {falhasRecentes.length === 1
            ? 'Um disparo falhou'
            : `${falhasRecentes.length} disparos falharam`}{' '}
          recentemente. O que os provocou — o lead, a venda — aconteceu normalmente; só a automação
          não completou.
        </p>
      )}

      <section className="mb-8">
        <h2 className="mb-2 font-mono text-[0.6875rem] font-medium uppercase tracking-wider text-content-subtle">
          Regras
        </h2>

        {regras.length === 0 ? (
          <Card>
            <CardHeader>
              <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-surface-muted">
                <Zap className="size-5 text-content-subtle" aria-hidden />
              </div>
              <CardTitle>Nenhuma automação ainda</CardTitle>
              <CardDescription>
                Um exemplo que cabe em quase todo negócio: quando um lead é cadastrado, agendar uma
                ligação para o dia seguinte.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <ul className="flex flex-col gap-2">
            {regras.map((regra) => (
              <Regra key={regra.id} regra={regra} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-mono text-[0.6875rem] font-medium uppercase tracking-wider text-content-subtle">
          Histórico
        </h2>
        <p className="mb-2 text-xs text-content-subtle">
          Para responder “por que isso apareceu na minha agenda?”. As falhas ficam aqui também —
          automação que falha calada é pior que automação nenhuma.
        </p>

        {disparos.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line-subtle px-4 py-6 text-center text-sm text-content-muted">
            Nenhum disparo ainda.
          </p>
        ) : (
          <ul className="overflow-hidden rounded-lg border border-line-subtle bg-surface-raised">
            {disparos.map((disparo) => (
              <li
                key={disparo.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line-subtle p-3 last:border-b-0"
              >
                <span
                  aria-hidden
                  className={
                    disparo.succeeded
                      ? 'size-2 shrink-0 rounded-full bg-success'
                      : 'size-2 shrink-0 rounded-full bg-danger'
                  }
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-content">{disparo.ruleName}</span>
                  <span className="block truncate text-xs text-content-subtle">
                    {AUTOMATION_EVENT_LABEL[disparo.event as AutomationEvent] ?? disparo.event}
                  </span>
                </span>
                {disparo.error !== null && (
                  <span className="w-full text-xs text-danger sm:w-auto sm:max-w-xs sm:truncate">
                    {disparo.error}
                  </span>
                )}
                <time dateTime={disparo.createdAt} className="text-xs text-content-subtle">
                  {formatInstant(new Date(disparo.createdAt), fuso)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Regra({ regra }: { regra: RegraListada }) {
  return (
    <li className="rounded-lg border border-line-subtle bg-surface-raised p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-medium text-content">{regra.name}</span>
        {!regra.isActive && <Badge tone="neutral">desligada</Badge>}
        {regra.falhas > 0 && <Badge tone="danger">{regra.falhas} com falha</Badge>}
        {regra.disparos > 0 && regra.falhas === 0 && (
          <Badge tone="success">{regra.disparos} disparos</Badge>
        )}
      </div>

      {/*
        A regra por extenso, em português. O objeto `jsonb` é a verdade, e
        mostrá-lo cru faria quem configurou precisar ler JSON para conferir o
        que acabou de escrever.
      */}
      <p className="mt-1 text-sm text-content-muted">
        {AUTOMATION_EVENT_LABEL[regra.event] ?? regra.event}
        {regra.condicoes.map((condicao, i) => (
          <span key={`${condicao.field}-${i}`}>
            {i === 0 ? ', e ' : ' e '}
            <strong className="font-medium text-content">{condicao.field}</strong>{' '}
            {AUTOMATION_OPERATOR_LABEL[condicao.operator as AutomationOperator] ??
              condicao.operator}
            {condicao.value !== undefined && ` “${condicao.value}”`}
          </span>
        ))}
        {' → '}
        {regra.acoes
          .map((acao) => AUTOMATION_ACTION_LABEL[acao.kind as AutomationActionKind] ?? acao.kind)
          .join(', ')}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <form action={alternarRegra}>
          <input type="hidden" name="id" value={regra.id} />
          <input type="hidden" name="ativa" value={regra.isActive ? 'sim' : 'nao'} />
          <button
            type="submit"
            className="h-8 rounded-md border border-line-strong px-3 text-xs text-content-default transition-colors hover:bg-surface-muted"
          >
            {regra.isActive ? 'Desligar' : 'Ligar'}
          </button>
        </form>

        <form action={apagarRegra}>
          <input type="hidden" name="id" value={regra.id} />
          <button
            type="submit"
            className="h-8 rounded-md px-3 text-xs text-content-subtle transition-colors hover:bg-danger-soft hover:text-danger"
          >
            Apagar
          </button>
        </form>
      </div>
    </li>
  );
}
