import { formatCents } from '@tivexy/core';
import { ArrowRight, BarChart3 } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { CountUp, type FormatoDoNumero } from '@/components/page/count-up';
import { EmptyState } from '@/components/page/empty-state';
import { PageHeader } from '@/components/page/header';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { sectionTitle } from '@/config/navigation';
import {
  type DiaDeVenda,
  type EtapaDoFunil,
  comparacaoSemanal,
  ticketMedio,
} from '@/lib/painel/dashboard';
import { type Terms, capitalizar, termOf } from '@/lib/terms/vocabulary';
import { cn } from '@/lib/utils';

import { SalesChart, SalesTable } from './sales-chart';

export interface Vendas {
  hoje: { vendas: number; total: number };
  mes: { vendas: number; total: number };
  dias: DiaDeVenda[];
}

export interface Dinheiro {
  saldoDoMes: number;
  entrouNoMes: number;
  aReceberVencido: number;
  aPagar30: number;
  aReceber30: number;
}

export interface Funil {
  nome: string;
  etapas: EtapaDoFunil[];
  ganhosNoMes: { quantidade: number; valor: number };
}

export interface Agenda {
  atrasadas: number | null;
  hoje: number | null;
}

export interface Estoque {
  negativos: number;
  zerados: number;
  noMinimo: number;
  controlados: number;
}

/* ── Peças ───────────────────────────────────────────────────────────── */

function Indicador({
  rotulo,
  valor,
  formato = 'inteiro',
  nota,
  tom,
  semValor = 'não consegui ler agora',
}: {
  rotulo: string;
  /** `null` quando não há número a mostrar — a leitura falhou, ou a conta não existe. */
  valor: number | null;
  formato?: FormatoDoNumero;
  nota?: ReactNode;
  tom?: 'danger' | 'success';
  semValor?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-lg border border-line-subtle bg-surface-subtle px-4 py-3">
      <span className="text-xs text-content-muted">{rotulo}</span>
      {valor === null ? (
        <span className="text-sm text-content-subtle">{semValor}</span>
      ) : (
        <CountUp
          valor={valor}
          formato={formato}
          className={cn(
            'font-display text-lg font-bold break-words sm:text-2xl',
            tom === 'danger' && valor !== 0 ? 'text-danger' : 'text-content',
            tom === 'success' && valor > 0 && 'text-success',
          )}
        />
      )}
      {nota !== undefined && <span className="text-xs text-content-subtle">{nota}</span>}
    </div>
  );
}

function Secao({
  titulo,
  href,
  rotuloDoLink,
  children,
}: {
  titulo: string;
  href: string;
  rotuloDoLink: string;
  children: ReactNode;
}) {
  return (
    <Card className="animate-enter">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>{titulo}</CardTitle>
        <Link
          href={href}
          className="inline-flex items-center gap-1 text-sm text-content-accent hover:underline"
        >
          {rotuloDoLink}
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}

function Vazio({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-line px-4 py-4 text-sm text-content-muted">
      {children}
    </p>
  );
}

function FunnelBars({ etapas }: { etapas: readonly EtapaDoFunil[] }) {
  const maior = Math.max(1, ...etapas.map((e) => e.quantidade));
  return (
    <ol className="flex flex-col gap-2.5">
      {etapas.map((e, i) => (
        <li
          key={e.id}
          className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-[minmax(0,12rem)_1fr] sm:items-center sm:gap-3"
        >
          <span className="text-content-default sm:truncate" title={e.nome}>
            {e.nome}
          </span>
          <span className="flex min-w-0 items-center gap-2">
            <span className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-muted">
              <span
                className="block h-full origin-left animate-fill rounded-full bg-content-accent"
                style={{
                  width: `${(e.quantidade / maior) * 100}%`,
                  animationDelay: `${i * 50}ms`,
                }}
              />
            </span>
            <span className="shrink-0 text-xs text-content-muted tabular-nums">
              {e.quantidade} · {formatCents(e.valorCentavos)}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function variacaoEmTexto(variacao: number | null): string {
  if (variacao === null) return 'sem os 7 dias anteriores para comparar';
  if (variacao === 0) return 'igual aos 7 dias anteriores';
  return `${Math.abs(variacao)}% ${variacao > 0 ? 'acima' : 'abaixo'} dos 7 dias anteriores`;
}

/**
 * O painel, desenhado a partir do que a página leu. `undefined` numa seção é
 * "esta pessoa não pode ler isso" — a seção some; `null` é "a leitura falhou"
 * — a seção aparece e diz.
 */
export function Dashboard({
  terms,
  hoje,
  dataDeHoje,
  podeRegistrarVenda,
  vendas,
  dinheiro,
  funil,
  agenda,
  leadsNoMes,
  estoque,
}: {
  terms: Terms;
  hoje: string;
  dataDeHoje: string;
  podeRegistrarVenda: boolean;
  vendas: Vendas | null | undefined;
  dinheiro: Dinheiro | null | undefined;
  funil: Funil | 'sem-funil' | null | undefined;
  agenda: Agenda | undefined;
  leadsNoMes: number | null | undefined;
  estoque: Estoque | null | undefined;
}) {
  const t = (chave: Parameters<typeof termOf>[1]) => termOf(terms, chave);
  const nada = [vendas, dinheiro, funil, agenda, leadsNoMes, estoque].every((s) => s === undefined);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        titulo={sectionTitle(terms, '/painel')}
        descricao={`${dataDeHoje}. Números do banco da empresa, agora — nada aqui é estimativa.`}
      />

      {nada ? (
        <EmptyState icone={BarChart3} titulo="Nada para somar com o seu acesso">
          O painel mostra vendas, dinheiro, funil, agenda e estoque — cada parte para quem pode ver
          aquilo. Peça a quem administra a empresa, ou veja os primeiros passos no{' '}
          <Link href="/tutorial" className="text-content-accent underline-offset-2 hover:underline">
            tutorial
          </Link>
          .
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-6">
          {vendas !== undefined && (
            <Secao
              titulo={capitalizar(t('erp.sales').plural)}
              href={podeRegistrarVenda ? '/erp/vendas/nova' : '/erp/vendas'}
              rotuloDoLink={podeRegistrarVenda ? 'Abrir o balcão' : 'Ver todas'}
            >
              {vendas === null ? (
                <Vazio>Não consegui ler agora. Recarregue a página em instantes.</Vazio>
              ) : vendas.mes.vendas === 0 && vendas.dias.every((d) => d.vendas === 0) ? (
                <Vazio>
                  Ainda não há registro em {t('erp.sales').plural} neste mês nem nos últimos 14
                  dias. Os números e o gráfico aparecem com o primeiro — no balcão, leva segundos.
                </Vazio>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <Indicador
                      rotulo="Hoje"
                      valor={vendas.hoje.total}
                      formato="dinheiro"
                      nota={`${vendas.hoje.vendas} ${vendas.hoje.vendas === 1 ? 'registro' : 'registros'}`}
                    />
                    <Indicador
                      rotulo="No mês"
                      valor={vendas.mes.total}
                      formato="dinheiro"
                      nota={`${vendas.mes.vendas} ${vendas.mes.vendas === 1 ? 'registro' : 'registros'}`}
                    />
                    <Indicador
                      rotulo="Ticket médio do mês"
                      valor={ticketMedio(vendas.mes.total, vendas.mes.vendas)}
                      formato="dinheiro"
                      nota="total ÷ registros"
                      semValor="sem registro no mês"
                    />
                  </div>
                  {vendas.dias.every((d) => d.vendas === 0) ? (
                    <Vazio>
                      Nenhum registro em {t('erp.sales').plural} nos últimos 14 dias. O gráfico
                      aparece com o primeiro — no balcão, leva segundos.
                    </Vazio>
                  ) : (
                    <>
                      <p className="text-sm text-content-muted">
                        Últimos 7 dias:{' '}
                        <span className="font-medium text-content">
                          {formatCents(comparacaoSemanal(vendas.dias).atual)}
                        </span>{' '}
                        — {variacaoEmTexto(comparacaoSemanal(vendas.dias).variacao)}.
                      </p>
                      <SalesChart dias={vendas.dias} hoje={hoje} />
                      <SalesTable dias={vendas.dias} />
                    </>
                  )}
                </>
              )}
            </Secao>
          )}

          {dinheiro !== undefined && (
            <Secao titulo="Dinheiro" href="/erp/financeiro" rotuloDoLink="Abrir o financeiro">
              {dinheiro === null ? (
                <Vazio>Não consegui ler agora. Recarregue a página em instantes.</Vazio>
              ) : Object.values(dinheiro).every((v) => v === 0) ? (
                <Vazio>
                  Ainda não há lançamento. O dinheiro aparece aqui com o primeiro pagamento de{' '}
                  {t('erp.sales').singular} — ou com uma conta lançada no financeiro.
                </Vazio>
              ) : (
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Indicador
                    rotulo="Saldo do mês"
                    valor={dinheiro.saldoDoMes}
                    formato="dinheiro"
                    nota="entrou menos saiu, no regime de caixa"
                    tom={dinheiro.saldoDoMes < 0 ? 'danger' : 'success'}
                  />
                  <Indicador
                    rotulo="A receber vencido"
                    valor={dinheiro.aReceberVencido}
                    formato="dinheiro"
                    nota={dinheiro.aReceberVencido === 0 ? 'nada vencido' : 'passou do vencimento'}
                    tom="danger"
                  />
                  <Indicador
                    rotulo="A receber em 30 dias"
                    valor={dinheiro.aReceber30}
                    formato="dinheiro"
                  />
                  <Indicador
                    rotulo="A pagar em 30 dias"
                    valor={dinheiro.aPagar30}
                    formato="dinheiro"
                  />
                </div>
              )}
            </Secao>
          )}

          {(funil !== undefined || agenda !== undefined || leadsNoMes !== undefined) && (
            <Secao
              titulo="CRM"
              href={funil !== undefined ? '/crm/oportunidades' : '/crm/atividades'}
              rotuloDoLink={funil !== undefined ? 'Abrir o funil' : 'Abrir a agenda'}
            >
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {leadsNoMes !== undefined && (
                  <Indicador
                    rotulo={`${capitalizar(t('crm.leads').plural)} no mês`}
                    valor={leadsNoMes}
                    nota="cadastros desde o dia 1º"
                  />
                )}
                {funil !== undefined && funil !== null && funil !== 'sem-funil' && (
                  <Indicador
                    rotulo="Ganhos no mês"
                    valor={funil.ganhosNoMes.valor}
                    formato="dinheiro"
                    nota={`${funil.ganhosNoMes.quantidade} em ${t('crm.deals').plural}`}
                    tom="success"
                  />
                )}
                {agenda !== undefined && (
                  <>
                    <Indicador
                      rotulo="Minha agenda hoje"
                      valor={agenda.hoje}
                      nota={`${t('crm.activities').plural} para hoje`}
                    />
                    <Indicador
                      rotulo="Minhas atrasadas"
                      valor={agenda.atrasadas}
                      nota={agenda.atrasadas === 0 ? 'nada atrasado' : 'prazo já passou'}
                      tom="danger"
                    />
                  </>
                )}
              </div>
              {funil === null && <Vazio>Não consegui ler o funil agora.</Vazio>}
              {funil === 'sem-funil' && (
                <Vazio>
                  Ainda não há funil. Quem administra cria em {capitalizar(t('crm.deals').plural)} →
                  Funis e etapas.
                </Vazio>
              )}
              {funil !== undefined && funil !== null && funil !== 'sem-funil' && (
                <div className="flex flex-col gap-2">
                  <p
                    className={cn(
                      'text-sm text-content-muted',
                      funil.etapas.every((e) => e.quantidade === 0) && 'hidden',
                    )}
                  >
                    Funil <span className="font-medium text-content">{funil.nome}</span>:{' '}
                    {funil.etapas.reduce((s, e) => s + e.quantidade, 0)} em andamento, somando{' '}
                    {formatCents(funil.etapas.reduce((s, e) => s + e.valorCentavos, 0))}.
                  </p>
                  {funil.etapas.every((e) => e.quantidade === 0) ? (
                    <Vazio>
                      Nada em andamento. Crie no quadro de {t('crm.deals').plural} e arraste de
                      etapa em etapa.
                    </Vazio>
                  ) : (
                    <FunnelBars etapas={funil.etapas} />
                  )}
                </div>
              )}
            </Secao>
          )}

          {estoque !== undefined && (
            <Secao
              titulo={sectionTitle(terms, '/erp/estoque')}
              href="/erp/estoque"
              rotuloDoLink="Ver o saldo"
            >
              {estoque === null ? (
                <Vazio>Não consegui ler agora. Recarregue a página em instantes.</Vazio>
              ) : estoque.controlados === 0 ? (
                <Vazio>
                  Ainda não há {t('erp.products').plural} com estoque controlado. Marque
                  &quot;controla estoque&quot; no cadastro e dê a primeira entrada.
                </Vazio>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Indicador
                    rotulo="Saldo negativo"
                    valor={estoque.negativos}
                    nota="vendeu mais do que entrou"
                    tom="danger"
                  />
                  <Indicador rotulo="Zerados" valor={estoque.zerados} tom="danger" />
                  <Indicador
                    rotulo="No mínimo"
                    valor={estoque.noMinimo}
                    nota={`de ${estoque.controlados} controlados`}
                  />
                </div>
              )}
            </Secao>
          )}

          <p className="text-xs text-content-subtle">
            Tudo acima é contado no banco quando a página abre. Para ver de novo,{' '}
            <Link
              href="/painel"
              className={cn(buttonVariants({ variant: 'link' }), 'h-auto p-0 text-xs')}
            >
              recarregue
            </Link>
            .
          </p>
        </div>
      )}
    </div>
  );
}
