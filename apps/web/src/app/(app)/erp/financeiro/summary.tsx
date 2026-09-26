import { formatCents } from '@tivexy/core';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  CalendarX2,
  Scale,
} from 'lucide-react';
import Link from 'next/link';

import { EmptyState } from '@/components/page/empty-state';
import { Stat, StatGrid } from '@/components/ui/stat';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { atrasoDaLinha, cn } from '@/lib/utils';

import type { Aba } from './state';

export interface ResumoFinanceiro {
  aReceber: number;
  aReceberVencido: number;
  aReceberQuantos: number;
  aPagar: number;
  aPagarVencido: number;
  aPagarQuantos: number;
  entrouNoMes: number;
  saiuNoMes: number;
  aReceber30: number;
  aPagar30: number;
}

/**
 * O vencido, escrito e com símbolo — a cor sozinha não pode carregar o alarme.
 */
function Vencido({ centavos }: { centavos: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-danger">
      <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
      {formatCents(centavos)} vencidos
    </span>
  );
}

/**
 * Os quatro números do caixa: o mês realizado, o que há a receber e a pagar,
 * e o que vem nos próximos 30 dias.
 *
 * `r === null` é falha de leitura, não caixa zerado: os quatro cartões dizem
 * que não conseguiram ler em vez de exibir R$ 0,00 (CLAUDE.md).
 *
 * Não há `variacao` em nenhum deles de propósito. `finance_summary` devolve o
 * mês corrente e a foto de hoje — não existe janela anterior apurada, e
 * inventar uma comparação seria o defeito que o contrato chama de "0% sem
 * base". Quando a RPC ganhar a janela anterior, `variacao` entra aqui.
 */
export function FinanceSummary({
  r,
  animar = false,
}: {
  r: ResumoFinanceiro | null;
  /** Entrada da faixa. Só na primeira chegada à tela (seção 8, regra 3). */
  animar?: boolean;
}) {
  const saldoDoMes = r === null ? null : r.entrouNoMes - r.saiuNoMes;
  const saldo30 = r === null ? null : r.aReceber30 - r.aPagar30;
  const semValor = 'não consegui ler agora';

  return (
    <StatGrid colunas={4}>
      <Stat
        rotulo="Saldo do mês"
        valor={saldoDoMes}
        formato="moeda"
        sinal
        Icone={Scale}
        tom={saldoDoMes !== null && saldoDoMes < 0 ? 'danger' : 'neutral'}
        semValor={semValor}
        nota={
          r === null
            ? undefined
            : `entrou ${formatCents(r.entrouNoMes)}, saiu ${formatCents(r.saiuNoMes)}`
        }
        animar={animar}
        atraso={atrasoDaLinha(0)}
      />
      <Stat
        rotulo="A receber"
        valor={r === null ? null : r.aReceber}
        formato="moeda"
        contar
        Icone={ArrowDownLeft}
        semValor={semValor}
        href={
          r !== null && r.aReceberVencido > 0
            ? '/erp/financeiro?aba=receber&filtro=vencidos'
            : '/erp/financeiro?aba=receber'
        }
        nota={
          r === null ? undefined : r.aReceberVencido > 0 ? (
            <Vencido centavos={r.aReceberVencido} />
          ) : (
            `${r.aReceberQuantos} em aberto, nada vencido`
          )
        }
        animar={animar}
        atraso={atrasoDaLinha(1)}
      />
      <Stat
        rotulo="A pagar"
        valor={r === null ? null : r.aPagar}
        formato="moeda"
        contar
        Icone={ArrowUpRight}
        semValor={semValor}
        href={
          r !== null && r.aPagarVencido > 0
            ? '/erp/financeiro?aba=pagar&filtro=vencidos'
            : '/erp/financeiro?aba=pagar'
        }
        nota={
          r === null ? undefined : r.aPagarVencido > 0 ? (
            <Vencido centavos={r.aPagarVencido} />
          ) : (
            `${r.aPagarQuantos} em aberto, nada vencido`
          )
        }
        animar={animar}
        atraso={atrasoDaLinha(2)}
      />
      <Stat
        rotulo="Próximos 30 dias"
        valor={saldo30}
        formato="moeda"
        sinal
        Icone={CalendarClock}
        tom={saldo30 !== null && saldo30 < 0 ? 'danger' : 'neutral'}
        semValor={semValor}
        nota={
          r === null
            ? undefined
            : `entra ${formatCents(r.aReceber30)}, sai ${formatCents(r.aPagar30)}`
        }
        animar={animar}
        atraso={atrasoDaLinha(3)}
      />
    </StatGrid>
  );
}

export interface ProximoVencimento {
  id: string;
  direcao: 'receivable' | 'payable';
  descricao: string;
  valorCentavos: number;
  prazoTexto: string;
  vencido: boolean;
}

/**
 * O endereço do próprio lançamento, não o da lista inteira.
 *
 * Sem `q=`: o termo passa por `ilikeTerm`, que troca vírgula, aspas e
 * parêntese por espaço — uma descrição com pontuação viraria uma busca que não
 * encontra o item que o link prometia, e a tela responderia "nada encontrado".
 * A âncora resolve sozinha: a lista em aberto é ordenada por vencimento, então
 * quem está vencendo nos próximos sete dias está na primeira página.
 */
function enderecoDo(i: ProximoVencimento): string {
  const aba: Aba = i.direcao === 'receivable' ? 'receber' : 'pagar';
  return `/erp/financeiro?aba=${aba}&filtro=${i.vencido ? 'vencidos' : 'abertos'}#lanc-${i.id}`;
}

export interface UpcomingDuesProps {
  itens: readonly ProximoVencimento[];
  /**
   * Quantos existem de fato na janela de sete dias. A lista mostra só os
   * primeiros; sem este número o corte por `.limit()` passaria por total.
   */
  total: number;
  /** A leitura falhou — diferente de "não há nada vencendo". */
  erro?: boolean;
}

/** Os próximos vencimentos das duas direções, cada linha levando ao lançamento. */
export function UpcomingDues({ itens, total, erro = false }: UpcomingDuesProps) {
  if (erro) {
    return (
      <EmptyState
        estado="erro"
        titulo="Não consegui ler os vencimentos"
        densidade="compacta"
        moldura={false}
      >
        A leitura do banco falhou. Recarregue a página em instantes — nada foi perdido, isto é só a
        tela.
      </EmptyState>
    );
  }

  if (itens.length === 0) {
    return (
      <EmptyState
        icone={CalendarX2}
        titulo="Nada vencendo nos próximos 7 dias"
        densidade="compacta"
        moldura={false}
        acao={
          <Link
            href="/erp/financeiro?aba=receber"
            className="text-body text-content-accent hover:underline"
          >
            Ver tudo o que está a receber
          </Link>
        }
      >
        É o que se quer ver aqui. Venda a prazo e conta lançada aparecem nesta caixa quando o
        vencimento chega perto — e é daqui que se dá baixa.
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Table densidade="densa" moldura="nenhuma" rotulo="Lançamentos vencendo nos próximos 7 dias">
        <THead>
          <TR>
            <TH>Lançamento</TH>
            <TH>Prazo</TH>
            <TH alinhamento="fim">Valor</TH>
          </TR>
        </THead>
        <TBody>
          {itens.map((i) => {
            const entra = i.direcao === 'receivable';
            const Icone = entra ? ArrowDownLeft : ArrowUpRight;
            const sentido = entra ? 'a receber' : 'a pagar';
            return (
              <TR
                key={i.id}
                href={enderecoDo(i)}
                rotulo={`${i.descricao} — ${sentido}, ${i.prazoTexto}`}
              >
                {/*
                 * Conteúdo em fluxo inline, sem flex aninhado: `truncar` corta na
                 * própria célula, e um contêiner flex dentro dela não teria
                 * largura definida para as reticências aparecerem.
                 */}
                <TD truncar rotulo="Lançamento">
                  <Icone
                    className={cn(
                      'mr-2 inline size-4 shrink-0 align-text-bottom',
                      entra ? 'text-success' : 'text-danger',
                    )}
                    aria-hidden
                  />
                  <span className="text-content">{i.descricao}</span>
                </TD>
                <TD rotulo="Prazo">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 whitespace-nowrap text-caption',
                      i.vencido ? 'text-danger' : 'text-content-muted',
                    )}
                  >
                    {/* O ícone acompanha o vermelho: quem não distingue a cor lê o alerta. */}
                    {i.vencido && <AlertTriangle className="size-3.5 shrink-0" aria-hidden />}
                    {sentido} · {i.prazoTexto}
                  </span>
                </TD>
                <TD numerico rotulo="Valor">
                  {formatCents(i.valorCentavos)}
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>

      {total > itens.length && (
        /*
         * O rodapé existe porque a consulta é cortada: dizer só os oito
         * primeiros e calar sobre o resto faria o painel passar por completo.
         */
        <p className="text-caption text-content-muted">
          Mais {(total - itens.length).toLocaleString('pt-BR')} vencendo nos próximos 7 dias.{' '}
          <Link
            href="/erp/financeiro?aba=receber&filtro=abertos"
            className="text-content-accent hover:underline"
          >
            A receber
          </Link>
          {' · '}
          <Link
            href="/erp/financeiro?aba=pagar&filtro=abertos"
            className="text-content-accent hover:underline"
          >
            A pagar
          </Link>
        </p>
      )}
    </div>
  );
}
