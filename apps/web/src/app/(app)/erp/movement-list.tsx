import { type ProductUnit, formatQuantity } from '@tivexy/core';
import { ArrowDownLeft, ArrowUpRight, History, type LucideIcon, Scale } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import {
  type MolduraDaTabela,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  TableEmpty,
} from '@/components/ui/table';
import { atrasoDaLinha, cn } from '@/lib/utils';

export interface MovimentoNaTela {
  id: string;
  /** "Entrada", "Contagem", "Venda nº 12" — já no vocabulário do tenant. */
  rotulo: string;
  quantidade: number;
  contado: number | null;
  motivo: string | null;
  quando: string;
  quem: string | null;
  /** O produto, quando a lista mistura vários (a tela de estoque). */
  produto?: { id: string; nome: string; unidade: ProductUnit } | null;
  unidade: ProductUnit;
}

export interface MovementListProps {
  movimentos: readonly MovimentoNaTela[];
  /**
   * O corpo do estado vazio: por que esta lista importa e o que faz deixar de
   * estar vazia. Frase, não "Nenhum registro" — ver o `EmptyState`.
   */
  vazio: ReactNode;
  /** O que está vazio. O padrão serve ao caso "ainda não mexeu nada". */
  tituloVazio?: string;
  /** Troque quando a ausência for outra: `SearchX` para filtro sem resultado. */
  iconeVazio?: LucideIcon;
  /** O que fazer agora, quando há caminho clicável para quem está vendo. */
  acaoVazia?: ReactNode;
  /** `nenhuma` (padrão) para uso dentro de um `Card`; `painel` quando é a lista da tela. */
  moldura?: MolduraDaTabela;
  /**
   * Cadência de entrada. Falso por padrão: uma tela tem um evento de entrada
   * só, e numa página de detalhe quem entra é outra coisa (seção 8, regra 1).
   */
  animar?: boolean;
}

/**
 * O razão do estoque, linha a linha.
 *
 * Entrada e saída se distinguem por sinal **e** por ícone — nunca só pela cor.
 * A contagem mostra o que foi contado e a diferença que ela gerou, que é o que
 * explica "o sistema dizia 8 e agora diz 5".
 *
 * Virou `<Table>` na densidade `densa` (36px): antes era `py-2.5` solto, e
 * trocar da aba Saldo para a aba Movimentações mudava o ritmo vertical pela
 * metade sem que nada na informação justificasse.
 *
 * A coluna do produto aparece sozinha, quando a lista mistura vários. Uma
 * coluna com o mesmo valor em todas as linhas é ruído na página do produto, e
 * a ausência dela não pode virar prop esquecida em quem chama.
 */
export function MovementList({
  movimentos,
  vazio,
  tituloVazio = 'Nada movimentou ainda',
  iconeVazio = History,
  acaoVazia,
  moldura = 'nenhuma',
  animar = false,
}: MovementListProps) {
  const comProduto = movimentos.some((m) => m.produto != null);
  const colunas = comProduto ? 6 : 5;

  return (
    <Table densidade="densa" moldura={moldura} rotulo="Movimentações de estoque">
      <THead sticky>
        <TR>
          <TH>Quando</TH>
          <TH>Movimento</TH>
          {comProduto && <TH>Produto</TH>}
          <TH alinhamento="fim">Quantidade</TH>
          <TH>Quem</TH>
          <TH>Observação</TH>
        </TR>
      </THead>

      <TBody>
        {movimentos.length === 0 ? (
          <TableEmpty colunas={colunas} icone={iconeVazio} titulo={tituloVazio} acao={acaoVazia}>
            {vazio}
          </TableEmpty>
        ) : (
          movimentos.map((m, i) => {
            const Icone =
              m.contado !== null ? Scale : m.quantidade < 0 ? ArrowUpRight : ArrowDownLeft;
            /*
             * Três sinais para três fatos: `+` entrou, `−` saiu, `±` a contagem
             * bateu com o saldo. O menos é o tipográfico (U+2212), que se
             * distingue do hífen no meio de uma coluna de números.
             */
            const sinal = m.quantidade > 0 ? '+' : m.quantidade < 0 ? '−' : '±';
            const observacao = [
              m.contado === null ? null : `contado ${formatQuantity(m.contado, m.unidade)}`,
              m.motivo,
            ]
              .filter((v): v is string => v !== null && v !== '')
              .join(' · ');

            return (
              <TR
                key={m.id}
                className={animar ? 'animate-enter' : undefined}
                style={animar ? { animationDelay: atrasoDaLinha(i) } : undefined}
              >
                <TD rotulo="Quando" className="whitespace-nowrap text-content-muted">
                  {m.quando}
                </TD>

                <TD rotulo="Movimento">
                  <span className="inline-flex items-center gap-2 whitespace-nowrap">
                    <Icone
                      className={cn(
                        'size-4 shrink-0',
                        m.quantidade > 0 ? 'text-success' : 'text-content-muted',
                      )}
                      aria-hidden
                    />
                    <span className="text-content">{m.rotulo}</span>
                  </span>
                </TD>

                {comProduto && (
                  <TD rotulo="Produto" truncar>
                    {m.produto == null ? (
                      <span className="text-content-subtle">
                        <span aria-hidden>—</span>
                        <span className="sr-only">cadastro removido</span>
                      </span>
                    ) : (
                      /* A linha do razão não navega (um lançamento não tem página
                         própria); o produto dela sim, e é o único alvo da linha. */
                      <Link
                        href={`/erp/produtos/${m.produto.id}`}
                        className="text-content-accent hover:underline"
                      >
                        {m.produto.nome}
                      </Link>
                    )}
                  </TD>
                )}

                <TD numerico rotulo="Quantidade">
                  <span className={m.quantidade > 0 ? 'text-success' : 'text-content'}>
                    {sinal}
                    {formatQuantity(Math.abs(m.quantidade), m.unidade)}
                  </span>
                </TD>

                <TD rotulo="Quem" truncar className="text-content-muted">
                  {m.quem ?? (
                    <span className="text-content-subtle">
                      <span aria-hidden>—</span>
                      <span className="sr-only">autor não identificado</span>
                    </span>
                  )}
                </TD>

                <TD rotulo="Observação" truncar className="text-content-muted">
                  {observacao === '' ? (
                    <span className="text-content-subtle" aria-hidden>
                      —
                    </span>
                  ) : (
                    observacao
                  )}
                </TD>
              </TR>
            );
          })
        )}
      </TBody>
    </Table>
  );
}
