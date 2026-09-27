import type { ReactNode } from 'react';

import { SearchField } from '@/components/page/search-box';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface BuscaDaBarra {
  /** `name` do parâmetro na URL. Padrão `q`. */
  nome?: string;
  /** Rótulo acessível do campo; fica visualmente oculto. */
  rotulo: string;
  placeholder: string;
  /** O termo já aplicado, vindo de `searchParams`. */
  valor: string;
}

export interface FilterBarProps {
  /** Destino do GET. Omitido, é a própria rota. */
  acao?: string;
  busca?: BuscaDaBarra;
  /**
   * Os `<Select>` do filtro, em ordem de importância. Cada controle define a
   * própria largura no breakpoint (`md:w-44` é a medida da casa); sem largura,
   * divide o espaço com os vizinhos.
   */
  filtros?: ReactNode;
  /** Ações da lista (Novo, Exportar). Ficam FORA do formulário — ver abaixo. */
  acoes?: ReactNode;
  /**
   * Parâmetros que precisam sobreviver ao filtro: aba, ordenação.
   *
   * O GET reescreve a query inteira, então o que não estiver no formulário se
   * perde. Perder a página é o certo — filtrar volta para a primeira. Perder a
   * aba não é: `?aba=movimentos` entra aqui.
   */
  ocultos?: Readonly<Record<string, string>>;
  rotuloDeEnvio?: string;
  className?: string;
}

/**
 * A barra de filtros de uma lista, por GET.
 *
 * Um layout só para as quatro grades que divergiram (produtos, estoque, vendas,
 * financeiro): busca flexível, filtros de largura fixa, envio à direita deles e
 * um único ponto de empilhamento.
 *
 * O contrato é `<form method="get">` porque filtro é endereço: "o que está fora
 * de venda em Bebidas" tem que sobreviver ao recarregar e caber num link
 * mandado para quem vai conferir. Nada aqui depende de JavaScript.
 *
 * `md` e não `sm` é o breakpoint: a 640px, busca mais dois selects deixam o
 * campo de texto abaixo de 180px, e uma busca com meia palavra visível não é
 * busca.
 */
export function FilterBar({
  acao,
  busca,
  filtros,
  acoes,
  ocultos,
  rotuloDeEnvio = 'Filtrar',
  className,
}: FilterBarProps) {
  return (
    <div className={cn('flex flex-col gap-3 md:flex-row md:items-center', className)}>
      <form
        method="get"
        action={acao}
        /* Landmark de busca só quando há o que buscar; filtro puro não é busca. */
        role={busca === undefined ? undefined : 'search'}
        className="flex min-w-0 flex-1 flex-col gap-2 md:flex-row md:flex-wrap md:items-center"
      >
        {ocultos !== undefined &&
          Object.entries(ocultos).map(([chave, conteudo]) => (
            <input key={chave} type="hidden" name={chave} value={conteudo} />
          ))}

        {busca !== undefined && (
          <SearchField
            nome={busca.nome}
            valor={busca.valor}
            rotulo={busca.rotulo}
            placeholder={busca.placeholder}
            className="md:min-w-56 md:flex-1"
          />
        )}

        {filtros !== undefined && (
          /*
           * `auto-fit` no lugar de um número de colunas: com um filtro ele
           * ocupa a linha, com dois eles dividem — era a divergência entre as
           * quatro grades, cada uma com a sua proporção inventada.
           *
           * Na linha os filtros não encolhem; se não couberem, quebram para a
           * linha de baixo. Select espremido esconde o texto da opção.
           */
          <div className="grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-2 md:flex md:shrink-0 md:items-center">
            {filtros}
          </div>
        )}

        {/*
         * O botão fica mesmo com JavaScript: é ele que dá submissão implícita
         * ao Enter num formulário de vários campos, e é a única confirmação de
         * que o filtro digitado ainda não foi aplicado.
         */}
        <Button type="submit" variant="outline">
          {rotuloDeEnvio}
        </Button>
      </form>

      {acoes !== undefined && (
        /*
         * Fora do <form> de propósito: "Nova venda" dentro dele seria um
         * `<button>` sem `type` submetendo o filtro, e o landmark de busca
         * passaria a anunciar ações que não são busca.
         */
        <div className="flex shrink-0 items-center gap-2">{acoes}</div>
      )}
    </div>
  );
}
