import { formatCents } from '@tivexy/core';
import { Ban, Banknote, Divide, Receipt, ShoppingCart, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { FilterBar } from '@/components/page/filter-bar';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { Stat, StatGrid } from '@/components/ui/stat';
import { TBody, TD, TH, THead, TR, Table, TableEmpty, hrefDeOrdem } from '@/components/ui/table';
import { atrasoDaLinha } from '@/lib/utils';

import type { Periodo, SituacaoDeVenda } from './state';

export interface VendaListada {
  id: string;
  numero: number;
  quando: string;
  cliente: string | null;
  formas: string[];
  totalCentavos: number;
  cancelada: boolean;
}

export interface ResumoDeVendas {
  vendas: number;
  totalCentavos: number;
  descontoCentavos: number;
  canceladas: number;
}

/** O que está no endereço e precisa sobreviver a ordenar, filtrar e paginar. */
export type ParametrosDaLista = Readonly<Record<string, string>>;

/**
 * Os números do período: quantas, quanto, o tíquete médio e o que foi cancelado.
 *
 * Os quatro vêm de `erp_sales_summary()`, que soma no banco o período inteiro —
 * não a página que está na tela. Nenhum deles traz variação contra o período
 * anterior porque **não existe segunda janela apurada**: a página faz uma
 * chamada só. Um chip de 0% aqui seria invenção (CLAUDE.md), e "sem base para
 * comparar" em quatro cartões, para sempre, seria ruído. Quando houver a
 * janela anterior, o slot `variacao` do `<Stat>` já está esperando.
 */
export function SalesSummary({
  resumo,
  rotuloPlural,
}: {
  resumo: ResumoDeVendas;
  rotuloPlural: string;
}) {
  /* Sem venda não há tíquete — é ausência de divisor, não falha de leitura. */
  const ticket = resumo.vendas === 0 ? null : Math.round(resumo.totalCentavos / resumo.vendas);

  return (
    <StatGrid colunas={4}>
      <Stat
        rotulo={rotuloPlural}
        valor={resumo.vendas}
        Icone={ShoppingCart}
        nota="no período, sem os cancelamentos"
      />
      <Stat
        rotulo="Total"
        valor={resumo.totalCentavos}
        formato="moeda"
        Icone={Banknote}
        nota={
          resumo.descontoCentavos > 0
            ? `${formatCents(resumo.descontoCentavos)} em desconto`
            : 'sem desconto'
        }
      />
      <Stat
        rotulo="Tíquete médio"
        valor={ticket}
        formato="moeda"
        Icone={Divide}
        semValor="sem venda no período"
        nota="total ÷ quantidade"
      />
      <Stat
        rotulo="Cancelamentos"
        valor={resumo.canceladas}
        Icone={Ban}
        tom="warning"
        nota="fora do total"
      />
    </StatGrid>
  );
}

const PERIODOS_NA_TELA = [
  { chave: 'hoje', rotulo: 'Hoje' },
  { chave: '7d', rotulo: '7 dias' },
  { chave: '30d', rotulo: '30 dias' },
  { chave: 'tudo', rotulo: 'Tudo' },
] as const satisfies readonly { chave: Periodo; rotulo: string }[];

/**
 * Período, situação e número — tudo por GET, tudo no endereço.
 *
 * O período é `<Segmented>` e não um `<select>`: são quatro opções fixas que se
 * trocam o tempo todo no balcão, e um clique vale menos que abrir uma lista.
 * Situação e número ficam na `FilterBar`, que é o único layout de filtro da
 * casa — antes eram quatro grades diferentes no ERP.
 */
export function SalesFilters({
  periodo,
  situacao,
  numero,
  ordem,
}: {
  periodo: Periodo;
  situacao: SituacaoDeVenda;
  numero: string;
  ordem: string;
}) {
  /* Trocar o período nunca deve manter a página 5 de outro recorte. */
  const linkDoPeriodo = (chave: Periodo): string => {
    const query = new URLSearchParams();
    if (chave !== '30d') query.set('periodo', chave);
    if (situacao !== 'todas') query.set('situacao', situacao);
    if (numero !== '') query.set('numero', numero);
    if (ordem !== '') query.set('ordem', ordem);
    const texto = query.toString();
    return texto === '' ? '/erp/vendas' : `/erp/vendas?${texto}`;
  };

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <Segmented
        como="link"
        rotulo="Período"
        ativa={periodo}
        className="shrink-0"
        itens={PERIODOS_NA_TELA.map((p) => ({ ...p, href: linkDoPeriodo(p.chave) }))}
      />
      <FilterBar
        className="min-w-0 flex-1"
        /* A lupa do `SearchBox` chega ao ERP, que até aqui não tinha nenhuma. */
        busca={{
          nome: 'numero',
          rotulo: 'Número do registro',
          placeholder: 'Procurar pelo número',
          valor: numero,
        }}
        /*
         * `periodo` e `ordem` como ocultos: o GET reescreve a query inteira, e
         * filtrar por situação não pode devolver a pessoa para os 30 dias
         * padrão nem desfazer a coluna que ela mandou ordenar.
         */
        ocultos={{ periodo, ordem }}
        filtros={
          <Select name="situacao" aria-label="Situação" defaultValue={situacao} className="md:w-44">
            <option value="todas">Qualquer situação</option>
            <option value="concluidas">Em vigor</option>
            <option value="canceladas">Cancelamentos</option>
          </Select>
        }
      />
    </div>
  );
}

/** O que a tabela diz quando não há linha. Quem monta é a página, que sabe o porquê. */
export interface VazioDaLista {
  icone: LucideIcon;
  titulo: string;
  frase: ReactNode;
  acao?: ReactNode;
}

const COLUNAS = 5;

/**
 * As vendas do período, em tabela.
 *
 * Tabela e não lista de cartões: é o que dá cabeçalho, ordenação por coluna e
 * alinhamento de dígito entre linhas. Na densidade larga cabem 15-18 registros
 * em 1080p, contra os 8 das linhas de ~92px que isto substitui.
 *
 * Cancelada continua visível e não depende de cor para se distinguir: selo com
 * ícone e palavra, mais o total riscado.
 */
export function SaleRows({
  vendas,
  rotuloSingular,
  ordem,
  params,
  animar,
  vazio,
}: {
  vendas: readonly VendaListada[];
  rotuloSingular: string;
  /** O `?ordem=` vigente, para o `aria-sort` e a seta do cabeçalho. */
  ordem: string | null;
  params: ParametrosDaLista;
  /** Coreografia de entrada só na primeira visita à rota (seção 8, regra 3). */
  animar: boolean;
  vazio: VazioDaLista;
}) {
  const coluna = (chave: string) => ({
    chave,
    atual: ordem,
    href: hrefDeOrdem(params, chave, ordem),
  });

  /* Legenda no vocabulário neutro: "Venda" + "s" erraria o plural de metade dos nichos. */
  return (
    <Table rotulo="Registros do período" densidade="larga">
      <THead sticky>
        <TR>
          <TH ordem={coluna('numero')}>Nº</TH>
          <TH ordem={coluna('quando')}>Quando</TH>
          <TH>Cliente</TH>
          <TH className="hidden xl:table-cell">Pagamento</TH>
          <TH ordem={coluna('total')} alinhamento="fim">
            Total
          </TH>
        </TR>
      </THead>
      <TBody>
        {vendas.length === 0 ? (
          <TableEmpty
            colunas={COLUNAS}
            icone={vazio.icone}
            titulo={vazio.titulo}
            acao={vazio.acao}
          >
            {vazio.frase}
          </TableEmpty>
        ) : (
          vendas.map((v, i) => (
            <TR
              key={v.id}
              href={`/erp/vendas/${v.id}`}
              rotulo={`${rotuloSingular} nº ${v.numero}`}
              className={animar ? 'animate-enter' : undefined}
              style={animar ? { animationDelay: atrasoDaLinha(i) } : undefined}
            >
              <TD rotulo="Nº" numerico alinhamento="inicio">
                <span className="inline-flex items-center gap-2">
                  {v.cancelada ? (
                    <Ban className="size-4 shrink-0 text-content-subtle" aria-hidden />
                  ) : (
                    <Receipt className="size-4 shrink-0 text-content-subtle" aria-hidden />
                  )}
                  <span className="font-medium text-content">{v.numero}</span>
                  {v.cancelada && (
                    <Badge tone="danger" tamanho="xs">
                      Cancelamento
                    </Badge>
                  )}
                </span>
              </TD>
              <TD rotulo="Quando" className="whitespace-nowrap text-content-muted">
                {v.quando}
              </TD>
              <TD rotulo="Cliente" truncar>
                {v.cliente ?? <span className="text-content-subtle">Sem identificação</span>}
              </TD>
              <TD rotulo="Pagamento" truncar className="hidden text-content-muted xl:table-cell">
                {v.formas.length === 0 ? (
                  <span className="text-content-subtle">—</span>
                ) : (
                  v.formas.join(' + ')
                )}
              </TD>
              <TD
                rotulo="Total"
                numerico
                className={v.cancelada ? 'text-content-subtle line-through' : 'text-content'}
              >
                {formatCents(v.totalCentavos)}
              </TD>
            </TR>
          ))
        )}
      </TBody>
    </Table>
  );
}
