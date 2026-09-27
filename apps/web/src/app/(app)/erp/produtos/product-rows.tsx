import { type ProductUnit, type StockStatus, formatCents, formatQuantity } from '@tivexy/core';
import {
  AlertTriangle,
  Ban,
  CircleCheck,
  CircleMinus,
  type LucideIcon,
  PackageX,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { TBody, TD, TH, THead, TR, Table, hrefDeOrdem } from '@/components/ui/table';
import { SITUACAO_DO_ESTOQUE, formatMargin } from '@/lib/erp/labels';
import { atrasoDaLinha, cn } from '@/lib/utils';

export interface ProdutoListado {
  id: string;
  nome: string;
  categoria: string | null;
  sku: string | null;
  unidade: ProductUnit;
  precoCentavos: number;
  margem: number | null;
  ativo: boolean;
  /** `null`: o tenant não tem estoque, ou o produto não controla. */
  estoque: { saldo: number; situacao: StockStatus } | null;
}

/** O ícone de cada situação — a cor nunca vai sozinha: o rótulo está ao lado. */
export const ICONE_DO_ESTOQUE: Readonly<
  Record<StockStatus, { Icone: LucideIcon; classe: string }>
> = {
  untracked: { Icone: CircleMinus, classe: 'text-content-subtle' },
  negative: { Icone: AlertTriangle, classe: 'text-danger' },
  out: { Icone: PackageX, classe: 'text-warning' },
  low: { Icone: AlertTriangle, classe: 'text-warning' },
  ok: { Icone: CircleCheck, classe: 'text-success' },
};

export function SituacaoDoEstoque({
  saldo,
  situacao,
  unidade,
  className,
}: {
  saldo: number;
  situacao: StockStatus;
  unidade: ProductUnit;
  className?: string;
}) {
  const { Icone, classe } = ICONE_DO_ESTOQUE[situacao];
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <Icone className={cn('size-3.5 shrink-0', classe)} aria-hidden />
      <span className="tabular-nums">{formatQuantity(saldo, unidade)}</span>
      {situacao !== 'ok' && (
        <span
          className={cn(
            'text-caption',
            situacao === 'negative' ? 'text-danger' : 'text-content-muted',
          )}
        >
          {SITUACAO_DO_ESTOQUE[situacao].rotulo.toLowerCase()}
        </span>
      )}
    </span>
  );
}

/** Célula sem valor. O travessão é desenho; quem ouve a página precisa da palavra. */
function SemValor({ motivo }: { motivo: string }) {
  return (
    <span className="text-content-subtle">
      <span aria-hidden>—</span>
      <span className="sr-only">{motivo}</span>
    </span>
  );
}

export interface OrdenacaoDaLista {
  /**
   * O `?ordem=` em vigor — `nome` quando o endereço não pede nada, porque é
   * essa a ordem que a consulta usa. Mostrar a coluna sem seta enquanto a lista
   * está ordenada por ela seria a tela mentindo sobre si mesma.
   */
  atual: string;
  /** Busca e filtros vigentes: trocar a ordem não pode perdê-los. */
  params: Readonly<Record<string, string | null | undefined>>;
}

export interface ProductRowsProps {
  produtos: readonly ProdutoListado[];
  /** A coluna de saldo só existe com o módulo de estoque E com a leitura de saldo íntegra. */
  comEstoque: boolean;
  ordenacao: OrdenacaoDaLista;
  /**
   * Entrada escalonada. Só na primeira visita à rota (seção 8, regra 3):
   * paginar e filtrar não re-executam a coreografia.
   */
  animar: boolean;
  /** Plural do vocabulário do tenant, para o nome acessível da tabela. */
  plural: string;
}

/**
 * A lista de produtos como tabela.
 *
 * Era um `<ul>` de cartões-linha de ~97px: oito registros por tela em 1080p e
 * quase 5.000px de rolagem por página de 50. Em tabela a linha é de 44px e o
 * que estava empilhado como subtítulo — categoria, código, saldo, margem —
 * vira coluna, alinhada verticalmente e ordenável onde o banco sabe ordenar.
 *
 * Sem `'use client'`: hover e foco são CSS do `<Table>`, e a ordenação é
 * `<Link>` com `?ordem=` — o mesmo contrato GET dos filtros.
 */
export function ProductRows({ produtos, comEstoque, ordenacao, animar, plural }: ProductRowsProps) {
  /* A página decide o que entra; sem linha não há tabela, só a moldura vazia que a auditoria achou. */
  if (produtos.length === 0) return null;

  const ordemDe = (chave: 'nome' | 'preco') => ({
    chave,
    atual: ordenacao.atual,
    href: hrefDeOrdem(ordenacao.params, chave, ordenacao.atual),
  });

  return (
    <Table densidade="larga" rotulo={`Lista de ${plural}`}>
      <THead sticky>
        <TR>
          <TH ordem={ordemDe('nome')}>Nome</TH>
          <TH className="hidden lg:table-cell">Categoria</TH>
          <TH className="hidden xl:table-cell">Código</TH>
          {comEstoque && <TH className="hidden md:table-cell">Estoque</TH>}
          <TH ordem={ordemDe('preco')} alinhamento="fim">
            Preço
          </TH>
          <TH alinhamento="fim" className="hidden lg:table-cell">
            Margem
          </TH>
        </TR>
      </THead>

      <TBody>
        {produtos.map((p, i) => (
          <TR
            key={p.id}
            href={`/erp/produtos/${p.id}`}
            rotulo={p.nome}
            className={animar ? 'animate-enter' : undefined}
            style={animar ? { animationDelay: atrasoDaLinha(i) } : undefined}
          >
            {/*
             * Sem `rotulo`: no modo blocos o nome é o título do bloco, e
             * rotulá-lo de "Nome" só repetiria o óbvio acima do valor.
             *
             * `w-2/5` dá ao `truncar` a largura de referência que as reticências
             * exigem, e impede que um nome comprido coma as colunas numéricas.
             */}
            <TD truncar className="w-2/5">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className={cn(
                    'truncate text-label',
                    p.ativo ? 'text-content' : 'text-content-muted',
                  )}
                >
                  {p.nome}
                </span>
                {!p.ativo && (
                  <Badge tamanho="xs" Icone={Ban} className="shrink-0">
                    Fora de venda
                  </Badge>
                )}
              </span>
            </TD>

            <TD truncar rotulo="Categoria" className="hidden lg:table-cell">
              {p.categoria ?? <SemValor motivo="sem categoria" />}
            </TD>

            <TD rotulo="Código" className="hidden font-mono text-caption xl:table-cell">
              {p.sku ?? <SemValor motivo="sem código interno" />}
            </TD>

            {comEstoque && (
              <TD rotulo="Estoque" className="hidden md:table-cell">
                {p.estoque === null ? (
                  <span className="inline-flex items-center gap-1.5 text-caption text-content-subtle">
                    <CircleMinus className="size-3.5 shrink-0" aria-hidden />
                    não controla
                  </span>
                ) : (
                  <SituacaoDoEstoque
                    saldo={p.estoque.saldo}
                    situacao={p.estoque.situacao}
                    unidade={p.unidade}
                  />
                )}
              </TD>
            )}

            <TD numerico rotulo="Preço">
              <span className="text-content">{formatCents(p.precoCentavos)}</span>
              <span className="text-caption text-content-subtle">/{p.unidade}</span>
            </TD>

            <TD numerico rotulo="Margem" className="hidden lg:table-cell">
              {p.margem === null ? (
                <SemValor motivo="sem custo cadastrado" />
              ) : (
                /* Cor nunca sozinha: o sinal do número e o ícone dizem o mesmo que o vermelho. */
                <span
                  className={cn(
                    'inline-flex items-center justify-end gap-1',
                    p.margem < 0 ? 'text-danger' : 'text-content-default',
                  )}
                >
                  {p.margem < 0 && <AlertTriangle className="size-3.5 shrink-0" aria-hidden />}
                  {formatMargin(p.margem)}
                  {p.margem < 0 && <span className="sr-only">abaixo do custo</span>}
                </span>
              )}
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
