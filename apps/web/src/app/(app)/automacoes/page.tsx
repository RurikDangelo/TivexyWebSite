import {
  AUTOMATION_ACTIONS,
  AUTOMATION_TRIGGERS,
  AUTOMATION_TRIGGER_CODES,
  type AutomationAction,
  type AutomationCondition,
  type AutomationTrigger,
  CONDITION_OPERATORS,
  type ConditionOperator,
  can,
  isAutomationTrigger,
} from '@tivexy/core';
import { CircleAlert, CirclePause, History, TriangleAlert, Zap } from 'lucide-react';
import type { Metadata } from 'next';

import { PageHeader } from '@/components/page/header';
import { NoTenant } from '@/components/page/no-tenant';
import { Page } from '@/components/page/page';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Stat, StatGrid } from '@/components/ui/stat';
import { TBody, TH, THead, TR, Table, TableEmpty } from '@/components/ui/table';
import { sectionTitle } from '@/config/navigation';
import { requireAccess } from '@/lib/auth/require';
import { modelosDeAutomacao, permissoesDeDestino } from '@/lib/automation/rule-text';
import { formatInstant } from '@/lib/format';
import { tenantMembers } from '@/lib/members';
import { tenantTimeZone } from '@/lib/settings/current';
import { supabaseServer } from '@/lib/supabase/server';
import { currentTerms } from '@/lib/terms/current';
import { termOf } from '@/lib/terms/vocabulary';

import type { OpcoesDoEditor } from './rule-draft';
import { COLUNAS_DA_TABELA, NovaAutomacao, RuleRow } from './rules';
import { RunList } from './runs';
import type { ExecucaoNaTela, RegraNaTela } from './state';

export async function generateMetadata(): Promise<Metadata> {
  return { title: sectionTitle(await currentTerms(), '/automacoes') };
}

/**
 * Teto da consulta de execuções.
 *
 * Constante, e não o literal `40` solto, porque a tela precisa dizer que o
 * número é parcial — e o aviso só é verdade enquanto bater com o `limit`.
 */
const ULTIMAS_EXECUCOES = 40;

function objeto(valor: unknown): Record<string, unknown> {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

/** As condições como o banco guardou, conferidas — o que não se reconhece não vai para a tela. */
function condicoesDe(valor: unknown): AutomationCondition[] {
  if (!Array.isArray(valor)) return [];
  return valor.flatMap((item) => {
    const c = objeto(item);
    const operador = CONDITION_OPERATORS.find((op) => op === c.operador);
    if (typeof c.campo !== 'string' || operador === undefined) return [];
    if (typeof c.valor !== 'string' && typeof c.valor !== 'number') return [];
    return [{ campo: c.campo, operador: operador as ConditionOperator, valor: c.valor }];
  });
}

function paramsDe(valor: unknown): Record<string, string | number> {
  return Object.fromEntries(
    Object.entries(objeto(valor)).filter(
      (par): par is [string, string | number] =>
        typeof par[1] === 'string' || typeof par[1] === 'number',
    ),
  );
}

/** "Última vez: 25/09/2026 14:30 — 2 avisos". */
function ultimaVez(execucao: ExecucaoNaTela | undefined, fuso: string): string | null {
  if (execucao === undefined) return null;
  const resultado = execucao.deuCerto ? (execucao.detalhe ?? 'rodou') : 'falhou';
  return `Última vez: ${formatInstant(execucao.quando, fuso)} — ${resultado}`;
}

/**
 * Automações: quando acontece X, se Y, então Z — tudo dentro do Tivexy.
 *
 * **Motor interno.** O evento nasce no banco (lead criado, venda registrada,
 * saldo no mínimo), as condições são conferidas lá, e a ação é interna:
 * avisar alguém aqui dentro ou criar atividade no CRM. Nada depende de canal
 * externo — e-mail, WhatsApp e webhook não existem aqui, nem simulados.
 *
 * A faixa de números sai do que já está carregado: nenhuma consulta nova. Os
 * dois cartões de execução vêm de uma lista truncada em `ULTIMAS_EXECUCOES`, e
 * por isso são anunciados como parciais quando o teto é atingido — um total
 * apresentado a partir de consulta cortada seria número inventado.
 */
export default async function AutomacoesPage() {
  const { choice, viewer } = await requireAccess('/automacoes');
  if (choice.kind !== 'resolved') return <NoTenant />;

  const tenantId = choice.tenant.id;
  const supabase = await supabaseServer();
  const [terms, fuso, pessoas, regras, execucoes] = await Promise.all([
    currentTerms(),
    tenantTimeZone(),
    tenantMembers(tenantId),
    supabase
      .from('automation_rules')
      .select('id, name, trigger, conditions, action, action_params, active')
      .eq('tenant_id', tenantId)
      .order('created_at')
      .order('id'),
    supabase
      .from('automation_runs')
      .select('id, rule_id, trigger, outcome, detail, payload, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(ULTIMAS_EXECUCOES),
  ]);

  const lista: RegraNaTela[] = (regras.data ?? []).flatMap((r) => {
    const gatilho = String(r.trigger);
    const acao = AUTOMATION_ACTIONS.find((a) => a === r.action);
    if (!isAutomationTrigger(gatilho) || acao === undefined) return [];
    return [
      {
        id: String(r.id),
        nome: String(r.name),
        gatilho,
        condicoes: condicoesDe(r.conditions),
        acao: acao as AutomationAction,
        params: paramsDe(r.action_params),
        ativa: r.active === true,
      },
    ];
  });

  const historico: ExecucaoNaTela[] = (execucoes.data ?? []).map((e) => ({
    id: String(e.id),
    regraId: String(e.rule_id),
    gatilho: String(e.trigger),
    deuCerto: e.outcome === 'executed',
    detalhe: typeof e.detail === 'string' ? e.detail : null,
    payload: objeto(e.payload),
    quando: String(e.created_at),
  }));

  const modulos = viewer.enabledModules;
  const gatilhos: AutomationTrigger[] = AUTOMATION_TRIGGER_CODES.filter((g) =>
    modulos.has(AUTOMATION_TRIGGERS[g].modulo),
  );
  const podeEditar = can(viewer, 'automation.rules.write');
  const podeCriarAtividade = modulos.has('crm') && can(viewer, 'crm.activities.write');
  const opcoes: OpcoesDoEditor = {
    gatilhos,
    podeCriarAtividade,
    pessoas,
    permissoes: permissoesDeDestino(modulos, terms),
    terms,
  };
  const nomes = new Map(lista.map((r) => [r.id, r.nome]));
  const automacao = termOf(terms, 'automation.rules');

  /*
   * Leitura que falhou não é lista vazia. Sem esta distinção o cartão diria
   * "0 em vigor" e a tabela diria "ainda não há automações" — duas afirmações
   * sobre um dado que ninguém conseguiu ler.
   */
  const erroNasRegras = regras.error !== null;
  const erroNasExecucoes = execucoes.error !== null;

  const emVigor = erroNasRegras ? null : lista.filter((r) => r.ativa).length;
  const emPausa = erroNasRegras ? null : lista.filter((r) => !r.ativa).length;
  const falhas = erroNasExecucoes ? null : historico.filter((e) => !e.deuCerto).length;
  const truncado = historico.length >= ULTIMAS_EXECUCOES;
  const parcial = truncado ? `nas ${ULTIMAS_EXECUCOES} mais recentes` : undefined;

  return (
    <Page variant="operacao">
      <PageHeader
        titulo={sectionTitle(terms, '/automacoes')}
        descricao="Motor interno: gatilho → condição → ação. Nada que dependa de canal externo — sem e-mail, WhatsApp ou webhook."
      />

      <div className="flex flex-col gap-6">
        <StatGrid colunas={4}>
          <Stat rotulo="Em vigor" valor={emVigor} Icone={Zap} />
          <Stat rotulo="Em pausa" valor={emPausa} Icone={CirclePause} nota="não disparam" />
          <Stat
            rotulo="Execuções"
            valor={erroNasExecucoes ? null : historico.length}
            Icone={History}
            parcial={parcial}
          />
          <Stat
            rotulo="Falhas"
            valor={falhas}
            Icone={CircleAlert}
            tom="danger"
            parcial={parcial}
            nota={falhas === 0 && !truncado ? 'nenhuma no registro' : undefined}
          />
        </StatGrid>

        {podeEditar && (
          <Card>
            <CardHeader>
              <CardTitle>Cadastrar</CardTitle>
              <CardDescription>
                Comece por um modelo ou monte do zero. Nada é criado antes de salvar.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <NovaAutomacao
                opcoes={opcoes}
                modelos={modelosDeAutomacao(modulos, podeCriarAtividade, terms)}
              />
            </CardContent>
          </Card>
        )}

        <section aria-labelledby="em-uso" className="flex flex-col gap-3">
          <h2 id="em-uso" className="text-h2 text-content">
            Em uso e em pausa
          </h2>
          <Table rotulo="Automações desta empresa">
            <THead sticky>
              <TR>
                <TH>Automação</TH>
                <TH>Quando</TH>
                <TH>Então</TH>
                <TH>Situação</TH>
                <TH alinhamento="fim">
                  <span className="sr-only">Ações</span>
                </TH>
              </TR>
            </THead>
            <TBody>
              {erroNasRegras ? (
                <TableEmpty
                  colunas={COLUNAS_DA_TABELA}
                  icone={TriangleAlert}
                  titulo="Não consegui ler as automações"
                >
                  Pode existir {automacao.singular} em vigor que não aparece aqui. Recarregue a
                  página em instantes antes de cadastrar outra.
                </TableEmpty>
              ) : lista.length === 0 ? (
                <TableEmpty
                  colunas={COLUNAS_DA_TABELA}
                  icone={Zap}
                  titulo={`Ainda não há ${automacao.plural}`}
                >
                  Cada {automacao.singular} escuta um evento do sistema — cadastro novo, registro em{' '}
                  {termOf(terms, 'erp.sales').plural}, saldo no mínimo —, confere as condições e faz
                  uma ação interna: avisar alguém aqui dentro ou criar{' '}
                  {termOf(terms, 'crm.activities').singular} no CRM.
                  {podeEditar
                    ? ' Comece por um modelo acima.'
                    : ' Quem administra a empresa cadastra aqui.'}
                </TableEmpty>
              ) : (
                lista.map((regra, indice) => (
                  <RuleRow
                    key={regra.id}
                    regra={regra}
                    opcoes={opcoes}
                    podeEditar={podeEditar}
                    indice={indice}
                    ultimaExecucao={ultimaVez(
                      historico.find((e) => e.regraId === regra.id),
                      fuso,
                    )}
                  />
                ))
              )}
            </TBody>
          </Table>
        </section>

        <section aria-labelledby="execucoes" className="flex flex-col gap-3">
          <h2 id="execucoes" className="text-h2 text-content">
            Últimas execuções
          </h2>
          <RunList
            execucoes={historico}
            nomes={nomes}
            fuso={fuso}
            automacao={automacao}
            erro={erroNasExecucoes}
            teto={ULTIMAS_EXECUCOES}
          />
        </section>
      </div>
    </Page>
  );
}
