import {
  type ProductUnit,
  type StockStatus,
  type StockSummary,
  formatQuantity,
} from '@tivexy/core';
import {
  AlertTriangle,
  ArrowDownLeft,
  CircleCheck,
  Inbox,
  Scale,
  SearchX,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Stat, StatGrid } from '@/components/ui/stat';
import { TBody, TD, TH, THead, TR, Table, TableEmpty, hrefDeOrdem } from '@/components/ui/table';
import { Tooltip } from '@/components/ui/tooltip';
import { SITUACAO_DO_ESTOQUE } from '@/lib/erp/labels';
import { contagem } from '@/lib/format';
import { atrasoDaLinha, cn } from '@/lib/utils';

import { ICONE_DO_ESTOQUE } from '../produtos/product-rows';
import type { FiltroDeSituacao } from './state';

export interface SaldoNaTela {
  id: string;
  nome: string;
  categoria: string | null;
  unidade: ProductUnit;
  saldo: number;
  minimo: number | null;
  situacao: StockStatus;
  ativo: boolean;
}

/**
 * O resumo no topo: o que pede ação, e quanto o estoque vale a custo.
 *
 * Cada tile é um filtro — clicar em "pedem reposição" lista quais. O `Cartao`
 * local que existia aqui era a terceira de cinco implementações do mesmo
 * cartão de KPI; agora é o primitivo `Stat`, que também já sabe dizer quando o
 * número é uma soma **truncada** em vez de um total (prop `parcial`).
 */
export function StockSummaryCards({
  resumo,
  filtro,
  rotulo,
  parcial,
}: {
  resumo: StockSummary;
  filtro: FiltroDeSituacao;
  rotulo: { singular: string; plural: string };
  /**
   * Presente: a consulta parou antes do fim do catálogo, e estes números
   * cobrem só o pedaço lido. O tile passa a exibir "parcial" em vez de
   * apresentar a soma como total da empresa (CLAUDE.md).
   */
  parcial?: string;
}) {
  const s = resumo.porSituacao;
  const repor = s.low + s.out;
  const total = s.ok + repor + s.negative;

  return (
    <StatGrid colunas={4}>
      <Stat
        rotulo="Pedem reposição"
        valor={repor}
        Icone={AlertTriangle}
        tom="warning"
        href="/erp/estoque?situacao=repor"
        ativo={filtro === 'repor'}
        contar
        nota={`${s.out} sem estoque, ${s.low} no mínimo`}
        parcial={parcial}
      />
      <Stat
        rotulo="Saldo negativo"
        valor={s.negative}
        Icone={AlertTriangle}
        tom="danger"
        href="/erp/estoque?situacao=negativo"
        ativo={filtro === 'negativo'}
        contar
        nota={s.negative === 0 ? 'nada vendido sem entrada' : 'vendido antes da entrada'}
        parcial={parcial}
      />
      <Stat
        rotulo="Em dia"
        valor={s.ok}
        Icone={CircleCheck}
        tom="success"
        href="/erp/estoque?situacao=em-dia"
        ativo={filtro === 'em-dia'}
        contar
        nota={`${contagem(total, rotulo.singular, rotulo.plural)} ao todo`}
        parcial={parcial}
      />
      <Stat
        rotulo="Valor a custo"
        valor={resumo.valorACusto}
        formato="moeda"
        Icone={Wallet}
        href="/erp/estoque"
        ativo={filtro === 'todos'}
        contar
        nota={
          resumo.semCusto === 0
            ? 'saldo × custo cadastrado'
            : `${contagem(resumo.semCusto, 'sem custo ficou', 'sem custo ficaram')} de fora`
        }
        parcial={parcial}
      />
    </StatGrid>
  );
}

/** Ícone + palavra: a situação nunca é só a cor (R8 do DESIGN_SYSTEM). */
function Situacao({ situacao }: { situacao: StockStatus }) {
  const { Icone, classe } = ICONE_DO_ESTOQUE[situacao];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <Icone className={cn('size-4 shrink-0', classe)} aria-hidden />
      {SITUACAO_DO_ESTOQUE[situacao].rotulo}
    </span>
  );
}

/** Ausência de dado é travessão para o olho e frase para quem ouve. */
function SemValor({ children }: { children: ReactNode }) {
  return (
    <span className="text-content-subtle">
      <span aria-hidden>—</span>
      <span className="sr-only">{children}</span>
    </span>
  );
}

export interface LevelRowsProps {
  saldos: readonly SaldoNaTela[];
  podeMovimentar: boolean;
  /** O `?ordem=` vigente: decide a seta do cabeçalho e o destino do próximo clique. */
  ordem: string;
  /** Busca e filtros em vigor, para os links de ordenação os preservarem. */
  params: Readonly<Record<string, string | null | undefined>>;
  /** O termo buscado, só para explicar um resultado vazio. */
  busca: string;
  filtro: FiltroDeSituacao;
  /**
   * Cadência de entrada. Falso ao filtrar, ordenar ou paginar: a coreografia é
   * agradável na primeira vez e irritante na décima (seção 8, regra 3).
   */
  animar: boolean;
  /** Como o nicho chama o que está em estoque — vira o cabeçalho da primeira coluna. */
  rotulo: { singular: string; plural: string };
}

/**
 * O saldo, linha a linha — agora tabela de verdade.
 *
 * Saíram os cartões-linha de ~90px que faziam 8 registros caberem numa tela de
 * 1080p; entrou a densidade `larga` (44px), que cabe cerca de vinte. O que se
 * ganha não é só rolagem: com colunas, saldo e mínimo passam a alinhar por
 * dígito entre linhas, que é o que permite varrer a coluna em vez de ler
 * registro por registro.
 *
 * Nenhuma linha de exemplo quando não há dado: o vazio fica dentro da própria
 * tabela, com o cabeçalho de pé, e diz qual das duas ausências é.
 */
export function LevelRows({
  saldos,
  podeMovimentar,
  ordem,
  params,
  busca,
  filtro,
  animar,
  rotulo,
}: LevelRowsProps) {
  const colunas = podeMovimentar ? 6 : 5;
  const coluna = (chave: string) => ({
    chave,
    atual: ordem,
    href: hrefDeOrdem(params, chave, ordem),
  });
  const filtrando = busca !== '' || filtro !== 'todos';

  return (
    <Table densidade="larga" rotulo={`Saldo por ${rotulo.singular}`}>
      {/*
       * Cabeçalho fixo: numa página de 50 linhas, rolar até a trigésima sem
       * saber qual coluna é o saldo e qual é o mínimo é o mesmo que não ter
       * coluna nenhuma.
       */}
      <THead sticky>
        <TR>
          <TH ordem={coluna('nome')}>{rotulo.singular}</TH>
          <TH ordem={coluna('categoria')}>Categoria</TH>
          <TH ordem={coluna('saldo')} alinhamento="fim">
            Saldo
          </TH>
          <TH ordem={coluna('minimo')} alinhamento="fim">
            Mínimo
          </TH>
          <TH ordem={coluna('situacao')}>Situação</TH>
          {podeMovimentar && (
            <TH alinhamento="fim">
              <span className="sr-only">Ações</span>
            </TH>
          )}
        </TR>
      </THead>

      <TBody>
        {saldos.length === 0 ? (
          /*
           * Três ausências, três respostas — nunca "nenhum registro" sozinho.
           * A busca não achou, o filtro não tem ninguém, ou a página pedida
           * passou do fim da lista. Falha de leitura NÃO chega aqui: a página
           * a trata antes, porque uma tabela vazia afirmaria que o estoque
           * está zerado quando ninguém conseguiu olhar.
           */
          <TableEmpty
            colunas={colunas}
            icone={busca !== '' ? SearchX : filtro !== 'todos' ? CircleCheck : Inbox}
            titulo={
              busca !== ''
                ? `Nada com “${busca}”`
                : filtro !== 'todos'
                  ? 'Nada nesta situação'
                  : 'Nada nesta página'
            }
            acao={
              filtrando ? (
                <Link href="/erp/estoque" className={buttonVariants({ variant: 'outline' })}>
                  Limpar filtros
                </Link>
              ) : (
                <Link href="/erp/estoque" className={buttonVariants({ variant: 'outline' })}>
                  Voltar ao começo da lista
                </Link>
              )
            }
          >
            {busca !== ''
              ? 'Nenhum cadastro tem esse texto no nome nem no código. Confira a grafia, ou limpe os filtros para ver a lista inteira.'
              : filtro !== 'todos'
                ? 'Nenhum cadastro está nesta situação agora — o que, nesta situação, é boa notícia. Limpe o filtro para ver a lista inteira.'
                : 'A página pedida passou do fim da lista. Volte ao começo para ver os cadastros.'}
          </TableEmpty>
        ) : (
          saldos.map((s, i) => (
            <TR
              key={s.id}
              href={`/erp/produtos/${s.id}`}
              rotulo={s.nome}
              className={animar ? 'animate-enter' : undefined}
              style={animar ? { animationDelay: atrasoDaLinha(i) } : undefined}
            >
              <TD rotulo={rotulo.singular} truncar>
                <span className="flex min-w-0 items-center gap-2">
                  <span className={cn('truncate', s.ativo ? 'text-content' : 'text-content-muted')}>
                    {s.nome}
                  </span>
                  {!s.ativo && (
                    <Badge tamanho="xs" className="shrink-0">
                      Fora de venda
                    </Badge>
                  )}
                </span>
              </TD>

              <TD rotulo="Categoria" truncar className="text-content-muted">
                {s.categoria ?? <SemValor>sem categoria</SemValor>}
              </TD>

              <TD numerico rotulo="Saldo">
                {formatQuantity(s.saldo, s.unidade)}
              </TD>

              <TD numerico rotulo="Mínimo">
                {s.minimo === null ? (
                  <SemValor>sem mínimo definido</SemValor>
                ) : (
                  formatQuantity(s.minimo, s.unidade)
                )}
              </TD>

              <TD rotulo="Situação">
                <Situacao situacao={s.situacao} />
              </TD>

              {podeMovimentar && (
                <TD acoes rotulo="Ações">
                  {/*
                   * `-my-1` devolve à linha os 44px da densidade: o alvo de
                   * toque continua com 32px, mas deixa de empurrar a altura
                   * da linha para 52px e desalinhar esta lista de todas as
                   * outras do sistema.
                   */}
                  <span className="-my-1 flex justify-end gap-1">
                    <Tooltip conteudo="Registrar entrada">
                      <Link
                        href={`/erp/estoque?produto=${s.id}&tipo=in#registrar`}
                        aria-label={`Registrar entrada de ${s.nome}`}
                        className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
                      >
                        <ArrowDownLeft aria-hidden />
                      </Link>
                    </Tooltip>
                    <Tooltip conteudo="Contar o que está na prateleira">
                      <Link
                        href={`/erp/estoque?produto=${s.id}&tipo=adjustment#registrar`}
                        aria-label={`Contar ${s.nome}`}
                        className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
                      >
                        <Scale aria-hidden />
                      </Link>
                    </Tooltip>
                  </span>
                </TD>
              )}
            </TR>
          ))
        )}
      </TBody>
    </Table>
  );
}
