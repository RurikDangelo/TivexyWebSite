import {
  PROVISIONING_STATUSES,
  PROVISIONING_STEPS,
  PROVISIONING_STEP_STATUSES,
  type ProvisioningStatus,
  type ProvisioningStep,
  type ProvisioningStepStatus,
  type TenantStatus,
} from '@tivexy/core';
import { Ban, Check, CircleSlash, Clock, Loader2, Minus, TriangleAlert, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Metadata } from 'next';

import { Page } from '@/components/page/page';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { SectionLabel } from '@/components/ui/section-label';
import { ETAPA, EXECUCAO, NOME_DA_ETAPA, SITUACAO } from '@/lib/admin/labels';
import { requireSession } from '@/lib/auth/require';
import { supabaseServer } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';

import { AutoAtualizar } from './auto-refresh';

export const metadata: Metadata = { title: 'Preparando' };

/**
 * O motivo que a plataforma gravou ao suspender — o texto que a empresa lê.
 * A linha da própria empresa continua legível para quem é dela, suspensa ou
 * não (`tenants_read`); o que a suspensão corta é o dado de negócio.
 */
async function motivoDaSuspensao(tenantId: string): Promise<string | null> {
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from('tenants')
    .select('status_reason')
    .eq('id', tenantId)
    .maybeSingle();
  const motivo = (data as { status_reason?: unknown } | null)?.status_reason;
  return typeof motivo === 'string' && motivo.trim() !== '' ? motivo : null;
}

/**
 * A linha crua de `provisioning_steps`.
 *
 * `unknown` em tudo porque o cliente do Supabase aqui não é tipado pelo esquema:
 * o que garante que só código conhecido chegue à tela são os guardas abaixo, não
 * a assinatura da consulta.
 */
interface LinhaDeEtapa {
  step?: unknown;
  position?: unknown;
  status?: unknown;
}

/** Uma etapa do provisionamento como esta tela a mostra. */
interface EtapaNaTela {
  posicao: number;
  /** `null` quando o banco trouxe um código que o catálogo não conhece. */
  etapa: ProvisioningStep | null;
  /** `null` quando a situação não é uma das do enum — não conta como feita. */
  situacao: ProvisioningStepStatus | null;
}

/**
 * Três respostas diferentes, e elas não podem virar uma só.
 *
 * `falha` é "não consegui olhar"; `sem-registro` é "olhei e não há execução
 * nenhuma". Fundir as duas num trilho vazio diria que o preparo não começou
 * quando talvez só a leitura tenha caído.
 */
type Acompanhamento =
  | { tipo: 'etapas'; execucao: ProvisioningStatus | null; etapas: readonly EtapaNaTela[] }
  | { tipo: 'sem-registro' }
  | { tipo: 'falha' };

const ehEtapa = (v: unknown): v is ProvisioningStep =>
  typeof v === 'string' && (PROVISIONING_STEPS as readonly string[]).includes(v);

const ehSituacaoDeEtapa = (v: unknown): v is ProvisioningStepStatus =>
  typeof v === 'string' && (PROVISIONING_STEP_STATUSES as readonly string[]).includes(v);

const ehSituacaoDeExecucao = (v: unknown): v is ProvisioningStatus =>
  typeof v === 'string' && (PROVISIONING_STATUSES as readonly string[]).includes(v);

/**
 * A última execução de provisionamento desta empresa, com as etapas dela.
 *
 * A consulta é a mesma do Admin (`admin/clientes/[id]/page.tsx`), e o RLS já
 * permitia: `provisioning_runs_read` e `provisioning_steps_read` liberam a
 * leitura para membro ativo do tenant. O dado existia, era escrito passo a
 * passo e só o cliente não via — é o achado do UI_AUDIT sobre esta linha, e é
 * por isso que uma consulta nova entra numa onda de redesenho.
 *
 * As sete linhas de etapa nascem juntas, no início da execução, então o total
 * daqui é o total de verdade — não uma estimativa e não uma soma truncada.
 */
async function acompanhamentoDoPreparo(tenantId: string): Promise<Acompanhamento> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from('provisioning_runs')
    .select('status, provisioning_steps(step, position, status)')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error !== null) return { tipo: 'falha' };
  if (data === null) return { tipo: 'sem-registro' };

  const brutas: readonly LinhaDeEtapa[] = Array.isArray(data.provisioning_steps)
    ? data.provisioning_steps
    : [];
  const etapas: EtapaNaTela[] = brutas
    .map((s) => ({
      posicao: Number(s.position ?? 0),
      /* Código fora do catálogo não é descartado: sumir com ele encolheria o denominador. */
      etapa: ehEtapa(s.step) ? s.step : null,
      situacao: ehSituacaoDeEtapa(s.status) ? s.status : null,
    }))
    .sort((a, b) => a.posicao - b.posicao);

  return {
    tipo: 'etapas',
    execucao: ehSituacaoDeExecucao(data.status) ? data.status : null,
    etapas,
  };
}

/** Etapa concluída: fez o que tinha de fazer, ou não tinha o que fazer. Desfeita não conta. */
const CONCLUIDAS: readonly ProvisioningStepStatus[] = ['succeeded', 'skipped'];

/* Cor nunca sozinha: cada situação tem símbolo próprio, e o rótulo em texto vem ao lado. */
const SIMBOLO_DA_ETAPA: Record<ProvisioningStepStatus, { Icone: LucideIcon; classe: string }> = {
  pending: { Icone: Clock, classe: 'bg-surface-sunken text-content-subtle' },
  running: { Icone: Loader2, classe: 'bg-surface-accent-soft text-content-accent' },
  succeeded: { Icone: Check, classe: 'bg-success-soft text-success' },
  failed: { Icone: X, classe: 'bg-danger-soft text-danger' },
  skipped: { Icone: Minus, classe: 'bg-surface-sunken text-content-subtle' },
  compensated: { Icone: Ban, classe: 'bg-surface-sunken text-content-subtle' },
};

/** Os estados em que a empresa existe e não opera — os únicos que chegam aqui. */
type EstadoParado = Exclude<TenantStatus, 'active'>;

interface TextoDoEstado {
  titulo: string;
  descricao: string;
  passo: string;
}

/*
 * A empresa existe e não opera: `provisioning`, `suspended` ou `cancelled`.
 *
 * Os três têm textos diferentes porque o próximo passo é diferente em cada um —
 * esperar, falar com o financeiro, falar com o comercial. Um texto genérico
 * transferiria essa triagem para o suporte.
 */
const TEXTO: Record<EstadoParado, TextoDoEstado> = {
  provisioning: {
    titulo: 'Estamos preparando sua empresa',
    descricao: 'A configuração inicial está em andamento. Isso costuma levar poucos minutos.',
    passo: 'Se passar de meia hora, fale com quem contratou a Tivexy pela empresa.',
  },
  suspended: {
    titulo: 'Acesso suspenso',
    descricao: 'O acesso desta empresa está suspenso no momento. Os dados continuam guardados.',
    passo: 'Para regularizar, fale com quem contratou a Tivexy pela empresa.',
  },
  cancelled: {
    titulo: 'Conta encerrada',
    descricao: 'Esta empresa não está mais ativa na Tivexy.',
    passo: 'Se isso não era esperado, fale com quem contratou o serviço.',
  },
};

/** O símbolo grande do topo acompanha o estado — relógio só serve para quem espera. */
const SIMBOLO_DO_ESTADO: Record<EstadoParado, LucideIcon> = {
  provisioning: Clock,
  suspended: Ban,
  cancelled: CircleSlash,
};

export default async function PreparandoPage() {
  const { choice } = await requireSession();
  const empresa = choice.kind === 'resolved' ? choice.tenant : null;
  /*
   * Sem empresa resolvida a guarda não teria mandado para cá; `provisioning` é
   * o palpite conservador de sempre — ele só espera, não afirma nada.
   */
  const bruto = empresa?.status ?? 'provisioning';
  const estado: EstadoParado = bruto === 'active' ? 'provisioning' : bruto;
  const texto = TEXTO[estado];
  const Simbolo = SIMBOLO_DO_ESTADO[estado];

  /*
   * Sem `Promise.all`: as duas leituras são de estados que se excluem — motivo
   * só existe em `suspended`, etapas só em `provisioning` —, então paralelizar
   * não economiza ida ao banco nenhuma e só esconderia a exclusão mútua.
   */
  const motivo =
    empresa !== null && estado === 'suspended' ? await motivoDaSuspensao(empresa.id) : null;
  const acompanhamento: Acompanhamento =
    empresa !== null && estado === 'provisioning'
      ? await acompanhamentoDoPreparo(empresa.id)
      : { tipo: 'sem-registro' };

  const etapas = acompanhamento.tipo === 'etapas' ? acompanhamento.etapas : [];
  const total = etapas.length;
  const feitas = etapas.filter(
    (e) => e.situacao !== null && CONCLUIDAS.includes(e.situacao),
  ).length;
  const execucao = acompanhamento.tipo === 'etapas' ? acompanhamento.execucao : null;

  /*
   * Parou de verdade: releitura periódica aqui seria um movimento que promete
   * mudança onde não vai haver nenhuma.
   */
  const preparoParou = execucao === 'failed' || execucao === 'compensated';
  const acompanharSozinho = estado === 'provisioning' && !preparoParou;

  return (
    <Page variant="intersticial">
      {/* Um evento de entrada por tela (seção 8, regra 1): o bloco entra, os filhos não. */}
      <div className="flex animate-enter flex-col gap-5">
        <header className="flex flex-col gap-3">
          <span className="flex size-14 items-center justify-center rounded-pill bg-surface-sunken text-content-subtle">
            <Simbolo className="size-7" aria-hidden />
          </span>
          {/* Era `CardTitle`, ou seja `<h3>`: a tela não tinha `<h1>`. */}
          <h1 className="text-display text-balance text-content">{texto.titulo}</h1>
          <p className="text-body-lg text-pretty text-content-muted">{texto.descricao}</p>
        </header>

        {empresa !== null && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-label text-content">{empresa.name}</span>
            {/*
             * `SITUACAO` no lugar do enum cru: a tela imprimia `provisioning` e
             * `suspended` em inglês para o cliente, com o mapa em português
             * pronto e sem uso. O tom também vem do mapa — o ternário local
             * dava o mesmo cinza para "Cancelada" e para "Suspensa".
             */}
            <Badge tone={SITUACAO[estado].tom}>{SITUACAO[estado].rotulo}</Badge>
          </div>
        )}

        {estado === 'provisioning' && (
          <Card>
            <CardContent className="flex flex-col gap-4 pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <SectionLabel como="h2">Etapas do preparo</SectionLabel>
                {execucao !== null && (
                  <Badge tone={EXECUCAO[execucao].tom} tamanho="xs">
                    {EXECUCAO[execucao].rotulo}
                  </Badge>
                )}
              </div>

              {acompanhamento.tipo === 'falha' && (
                <p role="alert" className="text-body text-content-muted">
                  Não consegui ler as etapas agora. A preparação segue do lado da Tivexy — o que
                  falhou foi esta leitura.
                </p>
              )}

              {acompanhamento.tipo === 'sem-registro' && (
                <p className="text-body text-content-muted">
                  Ainda não há registro de etapas para esta empresa. Assim que a execução começar,
                  ela aparece aqui.
                </p>
              )}

              {acompanhamento.tipo === 'etapas' && total === 0 && (
                <p className="text-body text-content-muted">
                  A execução existe, mas não gravou etapa nenhuma. Sem etapa não há progresso para
                  mostrar.
                </p>
              )}

              {total > 0 && (
                <>
                  <div className="flex flex-col gap-2">
                    <p className="flex items-baseline justify-between gap-3">
                      <span className="text-caption text-content-muted">Etapas concluídas</span>
                      <span className="flex items-baseline gap-1">
                        <span className="text-metric-sm text-content tabular-nums">{feitas}</span>
                        {/* O denominador é o número de linhas gravadas, não uma estimativa. */}
                        <span className="text-caption text-content-muted">{`de ${total}`}</span>
                      </span>
                    </p>
                    <Progress
                      valor={feitas}
                      maximo={total}
                      rotulo="Etapas do preparo concluídas"
                      descricaoDoValor={`${feitas} de ${total} etapas concluídas`}
                      tom={preparoParou ? 'danger' : 'brand'}
                    />
                  </div>

                  <ol className="flex flex-col gap-1.5">
                    {etapas.map((e) => {
                      /* Anotado: sem o tipo, o ternário devolve uma união de componentes. */
                      const { Icone, classe }: { Icone: LucideIcon; classe: string } =
                        e.situacao === null
                          ? { Icone: TriangleAlert, classe: 'bg-warning-soft text-warning' }
                          : SIMBOLO_DA_ETAPA[e.situacao];
                      const concluida = e.situacao !== null && CONCLUIDAS.includes(e.situacao);
                      return (
                        <li
                          key={`${e.posicao}-${e.etapa ?? 'desconhecida'}`}
                          className="flex items-center gap-2.5 py-1"
                        >
                          <span
                            className={cn(
                              'flex size-6 shrink-0 items-center justify-center rounded-pill',
                              classe,
                            )}
                          >
                            <Icone
                              aria-hidden
                              className={cn(
                                'size-3.5',
                                /* Girar só o que está rodando — é o único que descreve algo em curso. */
                                e.situacao === 'running' && 'animate-spin',
                              )}
                            />
                          </span>
                          <span
                            className={cn(
                              'min-w-0 flex-1 text-body',
                              concluida ? 'text-content-muted' : 'text-content',
                            )}
                          >
                            {/* Nome em português do catálogo; código cru nunca vai para a tela. */}
                            {e.etapa === null
                              ? 'Etapa adicional do provisionamento'
                              : NOME_DA_ETAPA[e.etapa]}
                          </span>
                          {/* A palavra ao lado do símbolo: quem não distingue as cores ainda lê o estado. */}
                          <span className="shrink-0 text-caption text-content-subtle">
                            {e.situacao === null ? 'situação não reconhecida' : ETAPA[e.situacao]}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                </>
              )}

              {preparoParou && (
                <p role="alert" className="text-body text-pretty text-content-default">
                  O preparo não terminou, e não vai continuar sozinho. Resolver é da Tivexy, não sua
                  — fale com quem contratou a Tivexy pela empresa.
                </p>
              )}

              {acompanharSozinho && <AutoAtualizar />}
            </CardContent>
          </Card>
        )}

        {motivo !== null && (
          <p className="rounded-card border border-line-subtle bg-surface-panel px-4 py-3 text-body text-pretty text-content-default">
            <span className="font-medium">Motivo informado pela Tivexy: </span>
            {motivo}
          </p>
        )}

        <p className="rounded-card border border-line-subtle bg-surface-sunken px-4 py-3 text-body text-pretty text-content-muted">
          {texto.passo}
        </p>
      </div>
    </Page>
  );
}
