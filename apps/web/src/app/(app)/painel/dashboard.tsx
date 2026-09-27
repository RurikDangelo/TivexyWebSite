import { formatCents } from '@tivexy/core';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarClock,
  CircleCheck,
  Handshake,
  type LucideIcon,
  PackageSearch,
  Receipt,
  ShoppingCart,
  Sparkles,
  Target,
  Trophy,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { EmptyState } from '@/components/page/empty-state';
import { PageHeader } from '@/components/page/header';
import { GradeDePainel, Page } from '@/components/page/page';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Segmented, type ItemSegmentadoLink } from '@/components/ui/segmented';
import { Stat, StatGrid, type StatProps } from '@/components/ui/stat';
import { sectionTitle } from '@/config/navigation';
import {
  type DiaDeVenda,
  type EtapaDoFunil,
  type Janela,
  PERIODOS,
  type Periodo,
  ROTULO_DO_PERIODO,
  ticketMedio,
  totaisDaSerie,
  variacaoPercentual,
} from '@/lib/painel/dashboard';
import { type Terms, capitalizar, termOf } from '@/lib/terms/vocabulary';
import { atrasoDaLinha, cn } from '@/lib/utils';

import { AtualizarPainel } from './refresh-button';
import { SalesChart } from './sales-chart';
import { SalesTable } from './sales-table';

/* ── O que a página leu ──────────────────────────────────────────────── */

export interface Vendas {
  dias: DiaDeVenda[];
  /** `null` quando a janela anterior não pôde ser lida — não é "vendeu zero". */
  diasAnteriores: DiaDeVenda[] | null;
  total: number;
  quantidade: number;
  totalAnterior: number | null;
  /** O último dia da série. `null` só se a série vier vazia. */
  hoje: DiaDeVenda | null;
}

export interface Dinheiro {
  saldo: number;
  entrou: number;
  saiu: number;
  saldoAnterior: number | null;
  aReceberVencido: number;
  aPagar30: number;
  aReceber30: number;
}

export interface Funil {
  nome: string;
  etapas: EtapaDoFunil[];
  /** Frase de soma truncada, ou `null` quando a leitura pegou tudo. */
  parcialDoAberto: string | null;
  ganhos: { quantidade: number; valor: number };
  parcialDosGanhos: string | null;
  /** `null` = a janela anterior não foi apurada por inteiro; não vira base de comparação. */
  ganhosAnteriores: number | null;
}

export interface AtividadeNaAgenda {
  id: string;
  assunto: string;
  /** "14:30", "sex. 02/10 · 14:30". `null` sem data. */
  quandoTexto: string | null;
  atrasada: boolean;
  alvo: { tipo: 'negocio' | 'contato' | 'empresa' | 'lead'; id: string } | null;
}

export interface Agenda {
  atrasadas: number | null;
  hoje: number | null;
  /** `null` = a lista falhou. `[]` = não há nada marcado. São coisas diferentes. */
  proximas: AtividadeNaAgenda[] | null;
}

export interface Estoque {
  negativos: number;
  zerados: number;
  noMinimo: number;
  controlados: number;
  parcial: string | null;
}

/* ── Peças ───────────────────────────────────────────────────────────── */

/**
 * Um bloco da grade bento: título, link para a tela que aprofunda, conteúdo.
 *
 * Substitui o `Secao` antigo, que empilhava quatro cartões de largura cheia. O
 * link vai para `<CardAction>` em vez de disputar a linha do título com um
 * `justify-between` à mão.
 */
function Bloco({
  titulo,
  Icone,
  href,
  rotuloDoLink,
  children,
  className,
}: {
  titulo: string;
  Icone: LucideIcon;
  href?: string;
  rotuloDoLink?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icone className="size-4 shrink-0 text-content-subtle" aria-hidden />
          {titulo}
        </CardTitle>
        {href !== undefined && rotuloDoLink !== undefined && (
          <CardAction>
            <Link
              href={href}
              className="inline-flex min-h-6 items-center gap-1 rounded-control text-label text-content-accent transition-colors transition-base hover:underline"
            >
              {rotuloDoLink}
              <ArrowRight className="size-3.5 shrink-0" aria-hidden />
            </Link>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">{children}</CardContent>
    </Card>
  );
}

/** A frase que o painel repete quando uma leitura falhou — três estados, este é o terceiro. */
function Falhou({ oQue }: { oQue: string }) {
  return (
    <EmptyState
      estado="erro"
      titulo={`Não consegui ler ${oQue}`}
      densidade="compacta"
      moldura={false}
    >
      A consulta ao banco não respondeu. Recarregue a página em instantes — se insistir, ninguém
      apagou nada: é leitura.
    </EmptyState>
  );
}

interface Alerta {
  chave: string;
  Icone: LucideIcon;
  tom: 'danger' | 'warning';
  titulo: string;
  detalhe: string;
  href: string;
}

const TOM_DO_ALERTA: Record<Alerta['tom'], { circulo: string; palavra: string }> = {
  danger: { circulo: 'bg-danger-soft text-danger', palavra: 'Urgente' },
  warning: { circulo: 'bg-warning-soft text-warning', palavra: 'Atenção' },
};

/**
 * Os alertas que já existiam como número passivo, agora em ordem de dano e com
 * para onde ir.
 *
 * Nada aqui nasce de estimativa: cada linha só aparece quando a contagem que a
 * origina veio do banco e é maior que zero. O que não foi lido (`null`) não
 * vira alerta nem vira "tudo em ordem" — some, e o bloco da seção diz por quê.
 */
function alertasDoDia(
  dinheiro: Dinheiro | null | undefined,
  agenda: Agenda | undefined,
  estoque: Estoque | null | undefined,
  plurais: { produtos: string; atividades: string },
): Alerta[] {
  const alertas: Alerta[] = [];

  if (dinheiro !== null && dinheiro !== undefined && dinheiro.aReceberVencido > 0) {
    alertas.push({
      chave: 'vencido',
      Icone: Wallet,
      tom: 'danger',
      titulo: `${formatCents(dinheiro.aReceberVencido)} a receber, vencido`,
      detalhe: 'passou do vencimento e ninguém deu baixa',
      href: '/erp/financeiro?aba=receber&filtro=vencidos',
    });
  }

  if (estoque !== null && estoque !== undefined && estoque.negativos > 0) {
    alertas.push({
      chave: 'negativo',
      Icone: PackageSearch,
      tom: 'danger',
      titulo: `${estoque.negativos} ${plurais.produtos} com saldo negativo`,
      detalhe: 'saiu mais do que entrou — falta lançar entrada ou contagem',
      href: '/erp/estoque?situacao=negativo',
    });
  }

  if (agenda !== undefined && agenda.atrasadas !== null && agenda.atrasadas > 0) {
    alertas.push({
      chave: 'atrasadas',
      Icone: CalendarClock,
      tom: 'danger',
      titulo: `${agenda.atrasadas} ${plurais.atividades} atrasadas`,
      detalhe: 'o prazo já passou e ninguém concluiu',
      href: '/crm/atividades?minhas=1',
    });
  }

  if (estoque !== null && estoque !== undefined && estoque.zerados > 0) {
    alertas.push({
      chave: 'zerados',
      Icone: PackageSearch,
      tom: 'warning',
      titulo: `${estoque.zerados} ${plurais.produtos} zerados`,
      detalhe: 'não dá para vender o que não tem saldo',
      href: '/erp/estoque?situacao=repor',
    });
  }

  if (agenda !== undefined && agenda.hoje !== null && agenda.hoje > 0) {
    alertas.push({
      chave: 'hoje',
      Icone: CalendarClock,
      tom: 'warning',
      titulo: `${agenda.hoje} ${plurais.atividades} para hoje`,
      detalhe: 'ainda dá tempo',
      href: '/crm/atividades?minhas=1',
    });
  }

  if (estoque !== null && estoque !== undefined && estoque.noMinimo > 0) {
    alertas.push({
      chave: 'minimo',
      Icone: PackageSearch,
      tom: 'warning',
      titulo: `${estoque.noMinimo} ${plurais.produtos} no mínimo`,
      detalhe: 'chegaram ao estoque mínimo do cadastro',
      href: '/erp/estoque?situacao=repor',
    });
  }

  return alertas;
}

function LinhaDeAlerta({ alerta }: { alerta: Alerta }) {
  const tom = TOM_DO_ALERTA[alerta.tom];
  return (
    <li>
      <Link
        href={alerta.href}
        className="group flex items-start gap-3 rounded-card px-2 py-2 transition-colors transition-base hover:bg-surface-subtle"
      >
        <span
          className={cn(
            'mt-px flex size-8 shrink-0 items-center justify-center rounded-pill',
            tom.circulo,
          )}
        >
          <alerta.Icone className="size-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-label text-content">{alerta.titulo}</span>
          <span className="block text-caption text-content-subtle">
            {/* A cor do círculo não carrega o grau sozinha: a palavra vem junto. */}
            <span className="font-medium">{tom.palavra}</span> · {alerta.detalhe}
          </span>
        </span>
        <ArrowRight
          className="mt-2 size-4 shrink-0 text-content-subtle transition-transform transition-base group-hover:translate-x-0.5"
          aria-hidden
        />
      </Link>
    </li>
  );
}

function AcaoRapida({
  href,
  Icone,
  titulo,
  nota,
}: {
  href: string;
  Icone: LucideIcon;
  titulo: string;
  nota: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-card border border-line-subtle bg-surface-panel p-3 shadow-card transition transition-base hover:border-line hover:shadow-raised motion-safe:hover:-translate-y-px"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-control bg-surface-accent-soft text-content-accent">
        <Icone className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-label text-content">{titulo}</span>
        <span className="block truncate text-caption text-content-subtle">{nota}</span>
      </span>
      <ArrowRight
        className="size-4 shrink-0 text-content-subtle transition-transform transition-base group-hover:translate-x-0.5"
        aria-hidden
      />
    </Link>
  );
}

/**
 * O funil aberto, etapa a etapa.
 *
 * Era uma barra à mão sem `role` nenhum; agora é `<Progress semantica="medida">`
 * — cada etapa é uma quantidade dentro de uma faixa conhecida, não uma tarefa
 * caminhando para o fim.
 */
function EtapasDoFunil({
  etapas,
  rotuloDeNegocios,
  animar,
}: {
  etapas: readonly EtapaDoFunil[];
  rotuloDeNegocios: string;
  animar: boolean;
}) {
  const maior = Math.max(1, ...etapas.map((e) => e.quantidade));
  return (
    <ol className="flex flex-col gap-3">
      {etapas.map((e, i) => (
        <li key={e.id} className="flex flex-col gap-1.5">
          <span className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-label text-content">{e.nome}</span>
            <span className="shrink-0 text-num text-content-muted">
              {e.quantidade} · {formatCents(e.valorCentavos)}
            </span>
          </span>
          <Progress
            valor={e.quantidade}
            maximo={maior}
            semantica="medida"
            densidade="densa"
            rotulo={`${e.nome}: ${e.quantidade} em ${rotuloDeNegocios}`}
            descricaoDoValor={`${e.quantidade} de ${maior} na etapa mais cheia`}
            animar={animar}
            atraso={animar ? atrasoDaLinha(i) : undefined}
          />
        </li>
      ))}
    </ol>
  );
}

/** Para onde cada linha da agenda leva. `null` cai na agenda, que é onde ela vive. */
function hrefDaAtividade(alvo: AtividadeNaAgenda['alvo']): string {
  if (alvo === null) return '/crm/atividades?minhas=1';
  switch (alvo.tipo) {
    case 'negocio':
      return `/crm/oportunidades/${alvo.id}`;
    case 'contato':
      return `/crm/contatos/${alvo.id}`;
    case 'empresa':
      return `/crm/empresas/${alvo.id}`;
    /* Lead não tem tela de registro: a lista é o destino honesto. */
    case 'lead':
      return '/crm/leads';
  }
}

/* ── O painel ────────────────────────────────────────────────────────── */

export interface DashboardProps {
  terms: Terms;
  periodo: Periodo;
  janela: Janela;
  dataDeHoje: string;
  lidoAs: string;
  podeRegistrarVenda: boolean;
  podeLancarConta: boolean;
  podeCriarNegocio: boolean;
  podeCriarAtividade: boolean;
  animarEntrada: boolean;
  vendas: Vendas | null | undefined;
  dinheiro: Dinheiro | null | undefined;
  funil: Funil | 'sem-funil' | null | undefined;
  agenda: Agenda | undefined;
  leads: number | null | undefined;
  leadsAnteriores: number | null | undefined;
  estoque: Estoque | null | undefined;
}

/**
 * O painel, desenhado a partir do que a página leu.
 *
 * `undefined` numa seção é "esta pessoa não pode ler isso" — a seção some;
 * `null` é "a leitura falhou" — a seção aparece e diz. Nenhum caminho aqui
 * substitui um dado que faltou por zero, por exemplo ou por estimativa.
 *
 * Composição: faixa única de indicadores no topo e grade bento embaixo
 * (`<GradeDePainel>`), em vez da pilha de quatro cartões de largura cheia
 * dentro de 1024px. Os cinco números que decidem o dia ficam acima da dobra;
 * o detalhamento — gráfico, funil, agenda — desce para os blocos.
 */
export function Dashboard({
  terms,
  periodo,
  janela,
  dataDeHoje,
  lidoAs,
  podeRegistrarVenda,
  podeLancarConta,
  podeCriarNegocio,
  podeCriarAtividade,
  animarEntrada,
  vendas,
  dinheiro,
  funil,
  agenda,
  leads,
  leadsAnteriores,
  estoque,
}: DashboardProps) {
  const t = (chave: Parameters<typeof termOf>[1]) => termOf(terms, chave);
  const nada = [vendas, dinheiro, funil, agenda, leads, estoque].every((s) => s === undefined);

  const vsAnterior = `vs. ${ROTULO_DO_PERIODO[periodo]} anteriores`;
  const periodos: ItemSegmentadoLink<Periodo>[] = PERIODOS.map((p) => ({
    chave: p,
    rotulo: ROTULO_DO_PERIODO[p],
    href: `?periodo=${p}`,
  }));

  /*
   * A descrição carrega data e hora da leitura, e só. A frase antiga
   * ("nada aqui é estimativa") era uma promessa de engenharia gastando a única
   * linha de contexto da tela; quem precisa dela é o código, e lá ela está.
   */
  const cabecalho = (acoes?: ReactNode) => (
    <PageHeader
      titulo={sectionTitle(terms, '/painel')}
      descricao={`${dataDeHoje} · lido no banco às ${lidoAs}`}
      acoes={acoes}
    />
  );

  if (nada) {
    return (
      <Page variant="painel">
        {/* Sem número nenhum na tela, seletor de período e botão de atualizar não têm o que mexer. */}
        {cabecalho()}
        <EmptyState icone={BarChart3} titulo="Nada para somar com o seu acesso">
          O painel mostra vendas, dinheiro, funil, agenda e estoque — cada parte para quem pode ver
          aquilo. Peça a quem administra a empresa, ou veja os primeiros passos no{' '}
          <Link href="/tutorial" className="text-content-accent underline-offset-2 hover:underline">
            tutorial
          </Link>
          .
        </EmptyState>
      </Page>
    );
  }

  /* ── A faixa de indicadores ─────────────────────────────────────────
   *
   * Cinco números, e um só componente (`<Stat>`) no lugar das cinco
   * implementações divergentes de cartão de KPI que o sistema tinha. Cada um
   * só entra quando a permissão correspondente existe; `valor: null` é leitura
   * que falhou, e `variacao.valor: null` é ausência de base — nunca 0%.
   */
  const faixa: StatProps[] = [];

  if (vendas !== undefined) {
    faixa.push({
      rotulo: capitalizar(t('erp.sales').plural),
      valor: vendas === null ? null : vendas.total,
      formato: 'moeda',
      Icone: ShoppingCart,
      href: '/erp/vendas',
      serie: vendas === null ? undefined : totaisDaSerie(vendas.dias),
      variacao:
        vendas === null
          ? undefined
          : { valor: variacaoPercentual(vendas.total, vendas.totalAnterior), rotulo: vsAnterior },
      nota:
        vendas === null
          ? undefined
          : `${vendas.quantidade.toLocaleString('pt-BR')} ${vendas.quantidade === 1 ? 'registro' : 'registros'} em ${ROTULO_DO_PERIODO[periodo]}`,
    });
  }

  if (dinheiro !== undefined) {
    faixa.push({
      rotulo: 'Saldo de caixa',
      valor: dinheiro === null ? null : dinheiro.saldo,
      formato: 'moeda',
      Icone: Wallet,
      sinal: true,
      tom: dinheiro !== null && dinheiro.saldo < 0 ? 'danger' : 'success',
      href: '/erp/financeiro',
      /*
       * Saldo não ganha chip de variação de propósito. Porcentagem sobre um
       * número que troca de sinal mente: de −R$ 100 para −R$ 50 daria "+50%",
       * e de +R$ 10 para −R$ 10 daria "−200%". O período anterior aparece como
       * valor, que é o que dá para comparar sem interpretar.
       */
      nota:
        dinheiro === null
          ? undefined
          : `entrou ${formatCents(dinheiro.entrou)} · saiu ${formatCents(dinheiro.saiu)}${
              dinheiro.saldoAnterior === null
                ? ''
                : ` · ${ROTULO_DO_PERIODO[periodo]} anteriores: ${formatCents(dinheiro.saldoAnterior)}`
            }`,
    });

    faixa.push({
      rotulo: 'A receber vencido',
      valor: dinheiro === null ? null : dinheiro.aReceberVencido,
      formato: 'moeda',
      Icone: AlertTriangle,
      tom: 'danger',
      href: '/erp/financeiro?aba=receber&filtro=vencidos',
      nota:
        dinheiro === null
          ? undefined
          : dinheiro.aReceberVencido === 0
            ? 'nada vencido'
            : `e ${formatCents(dinheiro.aReceber30)} a vencer em 30 dias`,
    });
  }

  if (funil !== undefined) {
    const temFunil = funil !== null && funil !== 'sem-funil';
    faixa.push({
      rotulo: 'Ganhos no período',
      valor: temFunil ? funil.ganhos.valor : null,
      formato: 'moeda',
      Icone: Trophy,
      tom: 'success',
      href: '/crm/oportunidades',
      semValor: funil === 'sem-funil' ? 'ainda não há funil' : 'não consegui ler agora',
      parcial: temFunil ? (funil.parcialDosGanhos ?? undefined) : undefined,
      variacao: temFunil
        ? {
            valor: variacaoPercentual(funil.ganhos.valor, funil.ganhosAnteriores),
            rotulo: vsAnterior,
          }
        : undefined,
      nota: temFunil ? `${funil.ganhos.quantidade} em ${t('crm.deals').plural}` : undefined,
    });
  }

  if (estoque !== undefined) {
    const aRepor = estoque === null ? null : estoque.zerados + estoque.noMinimo;
    faixa.push({
      rotulo: `${capitalizar(t('erp.products').plural)} a repor`,
      valor: aRepor,
      Icone: PackageSearch,
      tom: 'warning',
      href: '/erp/estoque?situacao=repor',
      parcial: estoque?.parcial ?? undefined,
      nota:
        estoque === null
          ? undefined
          : estoque.controlados === 0
            ? 'nenhum com estoque controlado'
            : `zerados e no mínimo, de ${estoque.controlados.toLocaleString('pt-BR')} controlados`,
    });
  }

  const alertas = alertasDoDia(dinheiro, agenda, estoque, {
    produtos: t('erp.products').plural,
    atividades: t('crm.activities').plural,
  });

  const acoes: ReactNode[] = [];
  if (podeRegistrarVenda) {
    acoes.push(
      <AcaoRapida
        key="venda"
        href="/erp/vendas/nova"
        Icone={ShoppingCart}
        titulo={`Registrar ${t('erp.sales').singular}`}
        nota="o balcão, com busca de produto e pagamento"
      />,
    );
  }
  if (podeLancarConta) {
    acoes.push(
      <AcaoRapida
        key="conta"
        href="/erp/financeiro"
        Icone={Receipt}
        titulo="Lançar uma conta"
        nota="a pagar ou a receber, no regime de caixa"
      />,
    );
  }
  if (podeCriarNegocio) {
    acoes.push(
      <AcaoRapida
        key="negocio"
        href="/crm/oportunidades"
        Icone={Handshake}
        titulo={`Abrir ${t('crm.deals').singular}`}
        nota="no quadro, na primeira etapa do funil"
      />,
    );
  }
  if (podeCriarAtividade) {
    acoes.push(
      <AcaoRapida
        key="atividade"
        href="/crm/atividades"
        Icone={CalendarClock}
        titulo={`Marcar ${t('crm.activities').singular}`}
        nota="ligação, visita, retorno — com prazo"
      />,
    );
  }

  return (
    <Page variant="painel">
      {cabecalho(
        <>
          <Segmented como="link" rotulo="Período do painel" itens={periodos} ativa={periodo} />
          <AtualizarPainel />
        </>,
      )}

      <div className="flex flex-col gap-6">
        {faixa.length > 0 && (
          <StatGrid colunas={5}>
            {faixa.map((props, i) => (
              <Stat
                key={props.rotulo}
                {...props}
                /* `CountUp` só aqui, nos cinco do topo — não nos catorze números da tela (seção 8, regra 5). */
                contar
                animar={animarEntrada}
                atraso={animarEntrada ? atrasoDaLinha(i) : undefined}
              />
            ))}
          </StatGrid>
        )}

        <GradeDePainel>
          {/* ── Coluna principal ─────────────────────────────────────── */}
          <div className="flex min-w-0 flex-col gap-6">
            {vendas !== undefined && (
              <Bloco
                titulo={capitalizar(t('erp.sales').plural)}
                Icone={BarChart3}
                href={podeRegistrarVenda ? '/erp/vendas/nova' : '/erp/vendas'}
                rotuloDoLink={podeRegistrarVenda ? 'Abrir o balcão' : 'Ver todas'}
              >
                {vendas === null ? (
                  <Falhou oQue={t('erp.sales').plural} />
                ) : vendas.dias.every((d) => d.vendas === 0) ? (
                  <EmptyState
                    icone={ShoppingCart}
                    titulo={`Nenhuma ${t('erp.sales').singular} em ${ROTULO_DO_PERIODO[periodo]}`}
                    densidade="compacta"
                    moldura={false}
                    acao={
                      podeRegistrarVenda ? (
                        <Link
                          href="/erp/vendas/nova"
                          className={buttonVariants({ variant: 'brand', size: 'sm' })}
                        >
                          Abrir o balcão
                        </Link>
                      ) : undefined
                    }
                  >
                    O gráfico e os números aparecem com o primeiro registro. Se houve venda neste
                    período e ela não está aqui, ela não foi registrada no sistema — experimente um
                    período maior antes de concluir.
                  </EmptyState>
                ) : (
                  <>
                    <SalesChart
                      dias={vendas.dias}
                      diasAnteriores={vendas.diasAnteriores}
                      hoje={vendas.hoje?.dia ?? null}
                      rotuloDoPeriodo={ROTULO_DO_PERIODO[periodo]}
                      animar={animarEntrada}
                      tabela={<SalesTable dias={vendas.dias} />}
                    />
                    <dl className="grid grid-cols-2 gap-3 border-t border-line-subtle pt-4 sm:grid-cols-3">
                      <Fato
                        rotulo="Hoje"
                        valor={vendas.hoje === null ? null : formatCents(vendas.hoje.totalCentavos)}
                        nota={
                          vendas.hoje === null
                            ? 'sem leitura do dia'
                            : `${vendas.hoje.vendas} ${vendas.hoje.vendas === 1 ? 'registro' : 'registros'}`
                        }
                      />
                      <Fato
                        rotulo="Ticket médio"
                        valor={centavosOuNada(ticketMedio(vendas.total, vendas.quantidade))}
                        nota={
                          vendas.quantidade === 0
                            ? 'sem registro no período'
                            : 'total ÷ registros do período'
                        }
                      />
                      <Fato
                        rotulo={`${ROTULO_DO_PERIODO[periodo]} anteriores`}
                        valor={centavosOuNada(vendas.totalAnterior)}
                        nota={
                          vendas.totalAnterior === null
                            ? 'janela anterior não lida'
                            : `${janela.inicioAnterior.slice(8, 10)}/${janela.inicioAnterior.slice(5, 7)} a ${janela.fimAnterior.slice(8, 10)}/${janela.fimAnterior.slice(5, 7)}`
                        }
                      />
                    </dl>
                  </>
                )}
              </Bloco>
            )}

            {funil !== undefined && (
              <Bloco
                titulo={capitalizar(t('crm.deals').plural)}
                Icone={Target}
                href="/crm/oportunidades"
                rotuloDoLink="Abrir o funil"
              >
                {funil === null ? (
                  <Falhou oQue="o funil" />
                ) : funil === 'sem-funil' ? (
                  <EmptyState
                    icone={Target}
                    titulo="Ainda não há funil"
                    densidade="compacta"
                    moldura={false}
                    acao={
                      podeCriarNegocio ? (
                        <Link
                          href="/crm/oportunidades/funis"
                          className={buttonVariants({ variant: 'outline', size: 'sm' })}
                        >
                          {/* "Abrir", não "Criar": ver a tela é permissão de leitura; criar o funil pode não ser. */}
                          Abrir funis e etapas
                        </Link>
                      ) : undefined
                    }
                  >
                    Sem etapas, {t('crm.deals').plural} não têm por onde andar — e o painel não tem
                    o que somar. Quem administra a empresa cria o primeiro funil.
                  </EmptyState>
                ) : funil.etapas.every((e) => e.quantidade === 0) ? (
                  <EmptyState
                    icone={Target}
                    titulo="Nada em andamento"
                    densidade="compacta"
                    moldura={false}
                    acao={
                      podeCriarNegocio ? (
                        <Link
                          href="/crm/oportunidades"
                          className={buttonVariants({ variant: 'brand', size: 'sm' })}
                        >
                          Abrir o quadro
                        </Link>
                      ) : undefined
                    }
                  >
                    O funil <strong className="font-medium text-content">{funil.nome}</strong> está
                    vazio. Cada etapa passa a mostrar quantidade e valor assim que houver{' '}
                    {t('crm.deals').plural} nela.
                  </EmptyState>
                ) : (
                  <>
                    <p className="text-body text-content-muted">
                      Funil <span className="font-medium text-content">{funil.nome}</span>:{' '}
                      {funil.etapas.reduce((s, e) => s + e.quantidade, 0)} em andamento, somando{' '}
                      <span className="text-num text-content">
                        {formatCents(funil.etapas.reduce((s, e) => s + e.valorCentavos, 0))}
                      </span>
                      .{' '}
                      {funil.parcialDoAberto !== null && (
                        /* Soma truncada não é total, e a tela tem de dizer isso onde o número está. */
                        <span className="text-warning">
                          <AlertTriangle
                            className="mr-1 inline size-3.5 align-[-0.15em]"
                            aria-hidden
                          />
                          Parcial: {funil.parcialDoAberto}.
                        </span>
                      )}
                    </p>
                    <EtapasDoFunil
                      etapas={funil.etapas}
                      rotuloDeNegocios={t('crm.deals').plural}
                      animar={animarEntrada}
                    />
                  </>
                )}
              </Bloco>
            )}
          </div>

          {/* ── Coluna de apoio ──────────────────────────────────────── */}
          <div className="flex min-w-0 flex-col gap-6">
            <Bloco titulo="Próxima melhor ação" Icone={Zap}>
              {alertas.length === 0 ? (
                <EmptyState
                  icone={CircleCheck}
                  titulo="Nada pedindo ação agora"
                  densidade="compacta"
                  moldura={false}
                >
                  Dentro do que o seu acesso alcança e do que deu para ler agora: nada vencido a
                  receber, nenhum saldo negativo e nenhuma {t('crm.activities').singular} atrasada.
                  O que não pôde ser lido não vira alerta — nem vira &quot;está tudo bem&quot;.
                </EmptyState>
              ) : (
                <ul className="-mx-2 flex flex-col">
                  {alertas.map((a) => (
                    <LinhaDeAlerta key={a.chave} alerta={a} />
                  ))}
                </ul>
              )}
            </Bloco>

            {acoes.length > 0 && (
              <Bloco titulo="Ações rápidas" Icone={Sparkles}>
                <div className="flex flex-col gap-2">{acoes}</div>
              </Bloco>
            )}

            {agenda !== undefined && (
              <Bloco
                titulo={capitalizar(t('crm.activities').plural)}
                Icone={CalendarClock}
                href="/crm/atividades?minhas=1"
                rotuloDoLink="Abrir a agenda"
              >
                {agenda.proximas === null ? (
                  <Falhou oQue={`as suas ${t('crm.activities').plural}`} />
                ) : agenda.proximas.length === 0 ? (
                  <EmptyState
                    icone={CalendarClock}
                    titulo="Nada marcado para você"
                    densidade="compacta"
                    moldura={false}
                    acao={
                      podeCriarAtividade ? (
                        <Link
                          href="/crm/atividades"
                          className={buttonVariants({ variant: 'outline', size: 'sm' })}
                        >
                          Marcar {t('crm.activities').singular}
                        </Link>
                      ) : undefined
                    }
                  >
                    Só entram aqui as {t('crm.activities').plural} com prazo e sem conclusão que
                    estão no seu nome.
                  </EmptyState>
                ) : (
                  <ul className="-mx-2 flex flex-col">
                    {agenda.proximas.map((a) => (
                      <li key={a.id}>
                        <Link
                          href={hrefDaAtividade(a.alvo)}
                          className="group flex items-baseline gap-3 rounded-card px-2 py-2 transition-colors transition-base hover:bg-surface-subtle"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-label text-content">
                              {a.assunto}
                            </span>
                            <span
                              className={cn(
                                'block text-caption',
                                a.atrasada ? 'text-danger' : 'text-content-subtle',
                              )}
                            >
                              {/* Vermelho nunca sozinho: quando está atrasada, o ícone e a palavra vêm junto. */}
                              {a.atrasada && (
                                <AlertTriangle
                                  className="mr-1 inline size-3.5 align-[-0.15em]"
                                  aria-hidden
                                />
                              )}
                              {a.atrasada ? 'Atrasada · ' : ''}
                              {a.quandoTexto ?? 'sem prazo'}
                            </span>
                          </span>
                          <ArrowRight
                            className="size-4 shrink-0 text-content-subtle transition-transform transition-base group-hover:translate-x-0.5"
                            aria-hidden
                          />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Bloco>
            )}

            {leads !== undefined && (
              <Bloco
                titulo={capitalizar(t('crm.leads').plural)}
                Icone={Users}
                href="/crm/leads"
                rotuloDoLink="Ver a lista"
              >
                <Stat
                  rotulo={`Novos em ${ROTULO_DO_PERIODO[periodo]}`}
                  valor={leads}
                  /*
                   * Tile sem cromo: o `<Bloco>` em volta já é o cartão, e um
                   * segundo painel com borda e sombra aqui dentro seria moldura
                   * dentro de moldura. O que se aproveita do `<Stat>` é o
                   * contrato do número — inclusive o "sem base para comparar".
                   */
                  className="border-0 bg-transparent p-0 shadow-flat"
                  variacao={{
                    valor:
                      leads === null ? null : variacaoPercentual(leads, leadsAnteriores ?? null),
                    rotulo: vsAnterior,
                  }}
                  nota="cadastros com data dentro da janela escolhida"
                />
              </Bloco>
            )}
          </div>
        </GradeDePainel>
      </div>
    </Page>
  );
}

/** Um fato de rodapé de bloco: rótulo pequeno, valor médio, nota. Não é KPI — KPI é a faixa. */
function Fato({
  rotulo,
  valor,
  nota,
}: {
  rotulo: string;
  /** `null` quando não há número: escreve a nota e nada mais. */
  valor: string | null;
  nota: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-caption text-content-muted">{rotulo}</dt>
      <dd className="flex min-w-0 flex-col">
        <span
          className={cn(
            'break-words',
            valor === null
              ? 'text-body text-content-subtle'
              : 'text-metric-sm tabular-nums text-content',
          )}
        >
          {valor ?? '—'}
        </span>
        <span className="text-caption text-content-subtle">{nota}</span>
      </dd>
    </div>
  );
}

/** Centavos formatados, ou `null` para quem escreve a ausência — nunca "R$ 0,00" por falta de dado. */
function centavosOuNada(centavos: number | null): string | null {
  return centavos === null ? null : formatCents(centavos);
}
