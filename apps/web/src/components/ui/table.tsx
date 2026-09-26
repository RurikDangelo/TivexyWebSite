import { ArrowDown, ArrowUp, ChevronsUpDown, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

import { cn } from '@/lib/utils';

/*
 * Tabela — primitivo P2 do DESIGN_SYSTEM (seção 7).
 *
 * Substitui os onze contêineres `<ul className="overflow-hidden rounded-lg
 * border …">` copiados pelo ERP e pelo CRM. Três decisões estruturais, todas
 * tomadas aqui para não voltarem a ser tomadas em cada tela:
 *
 * 1. `overflow-clip`, nunca `overflow-hidden`, na moldura. Os dois recortam os
 *    cantos arredondados, mas `hidden` transforma a moldura em contêiner de
 *    rolagem — e um `<thead sticky>` dentro dele passa a grudar numa caixa que
 *    nunca rola, ou seja, não gruda em nada. `clip` recorta sem criar
 *    contêiner de rolagem, então o cabeçalho continua grudando na página, sob
 *    o header do app (`--header-h`).
 *
 * 2. O recorte ainda cortaria o anel de `:focus-visible`, que a regra base
 *    desenha 2px PARA FORA do elemento. A correção é uma linha só, na moldura:
 *    dentro da tabela o anel é desenhado para dentro (`outline-offset` negativo).
 *    É o defeito que hoje se repete nas onze cópias.
 *
 * 3. Densidade e modo mobile viram CSS num lugar só — no próprio `<table>`,
 *    como regras de descendente ligadas a `data-densidade` e `data-mobile`.
 *    A alternativa seria contexto de React, que obrigaria `'use client'` e
 *    arrastaria a página inteira para o cliente (risco R5). Consequência a
 *    conhecer: essas regras têm especificidade maior que uma utilitária solta,
 *    então `className="py-4"` numa célula não vence a densidade. Trocar
 *    densidade é papel da prop, e é isso que se quer.
 *
 * Ordenação é `<Link>` com `?ordem=`, não estado: mantém o contrato GET, deixa
 * a ordem no endereço (compartilhável, recarregável) e mantém tudo Server
 * Component.
 */

export type DensidadeDaTabela = 'densa' | 'larga';
export type ModoMobile = 'blocos' | 'rolar';
export type MolduraDaTabela = 'painel' | 'nenhuma';
export type AlinhamentoDaCelula = 'inicio' | 'fim';

/*
 * `border-separate` em vez de `border-collapse`: no modelo colapsado a borda do
 * cabeçalho é pintada pela tabela, não pela célula, e some quando o `<thead>`
 * gruda. Com o modelo separado (e espaçamento zero, que o deixa idêntico ao
 * olho) cada célula carrega o próprio fio e o cabeçalho leva o dele junto.
 */
const BASE_DA_TABELA = 'w-full border-separate border-spacing-0 text-body text-content-default';

const REGRAS_DE_DENSIDADE = [
  /*
   * Altura na `<tr>` é mínima, não fixa: a régua é 36px/44px (seção 5), mas uma
   * célula com duas linhas cresce em vez de vazar.
   */
  'data-[densidade=densa]:[&_tr]:h-9',
  'data-[densidade=densa]:[&_[data-celula]]:px-3',
  'data-[densidade=densa]:[&_[data-celula]]:py-2',
  'data-[densidade=larga]:[&_tr]:h-11',
  'data-[densidade=larga]:[&_[data-celula]]:px-4',
  'data-[densidade=larga]:[&_[data-celula]]:py-2.5',
];

const REGRAS_DE_FIO = [
  /*
   * O fio vive na célula (ver `BASE_DA_TABELA`). A última linha da tabela não
   * tem fio porque a moldura já fecha — mas a última do corpo mantém o dela
   * quando existe um `<tfoot>`, que é o que separa registro de total.
   */
  '[&_[data-celula]]:border-b',
  '[&_[data-celula]]:border-line-subtle',
  '[&>tbody:last-child>tr:last-child>[data-celula]]:border-b-0',
  '[&>tfoot>tr:last-child>[data-celula]]:border-b-0',
];

const REGRAS_DE_CABECALHO_FIXO = [
  /*
   * Onde o cabeçalho para depende de quem rola. Em `blocos` não há contêiner de
   * rolagem, então ele para sob o header do app. Em `rolar` a caixa de rolagem
   * é a própria moldura, e ali o topo é zero.
   */
  'data-[mobile=blocos]:[&_[data-fixo]]:top-[var(--header-h)]',
  'data-[mobile=rolar]:[&_[data-fixo]]:top-0',
];

const REGRAS_DO_MODO_BLOCOS = [
  /*
   * Abaixo de `md` a linha deixa de ser linha e vira um bloco rotulado. Rolagem
   * horizontal no celular esconde coluna: o dado existe e ninguém acha.
   *
   * Trocar o `display` de uma tabela apaga a semântica implícita no navegador —
   * é por isso que cada componente daqui declara `role` explícito. Sem os
   * papéis, o leitor de tela perderia a associação célula↔cabeçalho justamente
   * no aparelho onde o cabeçalho não está visível.
   */
  'max-md:data-[mobile=blocos]:block',
  'max-md:data-[mobile=blocos]:[&_thead]:hidden',
  'max-md:data-[mobile=blocos]:[&_tbody]:block',
  'max-md:data-[mobile=blocos]:[&_tfoot]:block',
  'max-md:data-[mobile=blocos]:[&_tr]:block',
  'max-md:data-[mobile=blocos]:[&_tr]:h-auto',
  'max-md:data-[mobile=blocos]:[&_tr]:px-4',
  'max-md:data-[mobile=blocos]:[&_tr]:py-3',
  'max-md:data-[mobile=blocos]:[&_td]:block',
  /* O fio passa da célula para a linha: no bloco, o que separa é o registro. */
  'max-md:data-[mobile=blocos]:[&_[data-celula]]:border-b-0',
  'max-md:data-[mobile=blocos]:[&_tr]:border-b',
  'max-md:data-[mobile=blocos]:[&_tr]:border-line-subtle',
  'max-md:data-[mobile=blocos]:[&>tbody:last-child>tr:last-child]:border-b-0',
  'max-md:data-[mobile=blocos]:[&>tfoot>tr:last-child]:border-b-0',
  /*
   * Rótulo à esquerda, valor à direita — inclusive na coluna numérica. O
   * `justify-between` é condicionado a existir rótulo: numa célula sem rótulo
   * ele afastaria ícone e texto para cantos opostos do bloco.
   */
  'max-md:data-[mobile=blocos]:[&_[data-celula]]:flex',
  'max-md:data-[mobile=blocos]:[&_[data-celula]]:items-baseline',
  'max-md:data-[mobile=blocos]:[&_[data-celula]:has([data-rotulo])]:justify-between',
  'max-md:data-[mobile=blocos]:[&_[data-celula]]:gap-3',
  'max-md:data-[mobile=blocos]:[&_[data-celula]]:px-0',
  'max-md:data-[mobile=blocos]:[&_[data-celula]]:py-0.5',
  'max-md:data-[mobile=blocos]:[&_[data-celula]]:text-start',
  /* Truncar e colunas que se espremem são regra de tabela; no bloco o texto quebra. */
  'max-md:data-[mobile=blocos]:[&_[data-celula]]:w-auto',
  'max-md:data-[mobile=blocos]:[&_[data-celula]]:max-w-none',
  'max-md:data-[mobile=blocos]:[&_[data-celula]]:overflow-visible',
  'max-md:data-[mobile=blocos]:[&_[data-celula]]:whitespace-normal',
  'max-md:data-[mobile=blocos]:[&_[data-rotulo]]:block',
];

export interface TableProps extends ComponentProps<'table'> {
  /** 36px por linha (`densa`) ou 44px (`larga`). Ver seção 5. */
  densidade?: DensidadeDaTabela;
  /** Abaixo de `md`: cada linha vira um bloco rotulado, ou a tabela rola na horizontal. */
  mobile?: ModoMobile;
  /** `nenhuma` quando a tabela já está dentro de um Card — evita moldura sobre moldura. */
  moldura?: MolduraDaTabela;
  /** Nome acessível da tabela. Vira um `<caption>` visível só para leitor de tela. */
  rotulo?: string;
  /** Classe da moldura (altura máxima, margem). `className` vai para o `<table>`. */
  classNameMoldura?: string;
}

export function Table({
  densidade = 'larga',
  mobile = 'blocos',
  moldura = 'painel',
  rotulo,
  className,
  classNameMoldura,
  children,
  ...props
}: TableProps) {
  const tabela = (
    <table
      role="table"
      data-densidade={densidade}
      data-mobile={mobile}
      className={cn(
        BASE_DA_TABELA,
        REGRAS_DE_DENSIDADE,
        REGRAS_DE_FIO,
        REGRAS_DE_CABECALHO_FIXO,
        REGRAS_DO_MODO_BLOCOS,
        className,
      )}
      {...props}
    >
      {rotulo !== undefined && <caption className="sr-only">{rotulo}</caption>}
      {children}
    </table>
  );

  return (
    <div
      className={cn(
        /*
         * A correção do anel de foco, em um lugar só: para dentro, nunca para
         * fora. O recorte dos cantos (aqui ou na caixa de rolagem) cortaria o
         * anel da primeira e da última linha — o defeito que as onze listas
         * copiadas têm hoje.
         */
        '[&_:focus-visible]:outline-offset-[-2px]',
        moldura === 'painel' &&
          'overflow-clip rounded-card border border-line-subtle bg-surface-panel shadow-card',
        classNameMoldura,
      )}
    >
      {mobile === 'rolar' ? (
        /*
         * Região de rolagem alcançável pelo teclado (WCAG 2.1.1): sem
         * `tabIndex`, quem não usa ponteiro não chega às colunas da direita.
         */
        <div
          tabIndex={0}
          role={rotulo !== undefined ? 'region' : undefined}
          aria-label={rotulo}
          className="overflow-x-auto rounded-[inherit]"
        >
          {tabela}
        </div>
      ) : (
        tabela
      )}
    </div>
  );
}

export interface THeadProps extends ComponentProps<'thead'> {
  /** Cabeçalho que acompanha a rolagem. O topo sai das regras da tabela. */
  sticky?: boolean;
}

export function THead({ sticky = false, className, ...props }: THeadProps) {
  return (
    <thead
      role="rowgroup"
      data-fixo={sticky ? '' : undefined}
      className={cn(sticky && 'sticky z-[var(--z-sticky)]', className)}
      {...props}
    />
  );
}

export function TBody({ className, ...props }: ComponentProps<'tbody'>) {
  return <tbody role="rowgroup" className={className} {...props} />;
}

/** Rodapé de totais. Fundo afundado porque resumo não é registro — não se lê na mesma varredura. */
export function TFoot({ className, ...props }: ComponentProps<'tfoot'>) {
  return (
    <tfoot
      role="rowgroup"
      className={cn('[&_[data-celula]]:bg-surface-sunken', className)}
      {...props}
    />
  );
}

/*
 * Linha navegável: `href` e `rotulo` andam juntos. O tipo obriga, porque o link
 * que cobre a linha não tem texto próprio — sem `rotulo` o leitor de tela
 * anunciaria a URL.
 */
type LinhaNavegavel = { href: string; rotulo: string };
type LinhaEstatica = { href?: undefined; rotulo?: undefined };

export type TRProps = ComponentProps<'tr'> & {
  /** Linha do registro aberto ou selecionado. */
  ativo?: boolean;
} & (LinhaNavegavel | LinhaEstatica);

export function TR({ className, ativo = false, href, rotulo, children, ...props }: TRProps) {
  return (
    <tr
      role="row"
      aria-current={ativo ? 'true' : undefined}
      className={cn(
        'transition-colors transition-base',
        /* `relative` é o bloco de contenção da célula sobreposta logo abaixo. */
        href !== undefined && 'relative',
        ativo && 'bg-surface-accent-soft',
        /* O foco do link sobreposto acende a linha inteira; só o anel dele seria pequeno demais para o olho achar. */
        href !== undefined &&
          !ativo &&
          'hover:bg-surface-subtle has-[a:focus-visible]:bg-surface-subtle',
        className,
      )}
      {...props}
    >
      {children}
      {href !== undefined && (
        /*
         * Linha inteira clicável com UM só ponto de foco. Um `<a>` não pode ser
         * filho de `<tr>` (o parser do navegador o expulsaria da tabela e a
         * hidratação quebraria), então o link mora numa célula sobreposta.
         *
         * `role="presentation"` na célula para a linha não ganhar uma coluna
         * fantasma que o `<thead>` não tem; o link dentro dela mantém o papel.
         * Célula com controle próprio (botões de ação) usa `<TD acoes>`, que
         * sobe acima desta sobreposição.
         */
        <td role="presentation" className="absolute inset-0 p-0">
          <Link href={href} aria-label={rotulo} className="absolute inset-0" />
        </td>
      )}
    </tr>
  );
}

/** Estado de ordenação de uma coluna, derivado do `?ordem=` que veio na URL. */
export interface OrdemDaColuna {
  /** Nome da coluna no parâmetro, sem sinal: `nome`, `valor`, `criado_em`. */
  chave: string;
  /** O `?ordem=` vigente. `-chave` é descendente; `null` é a ordem padrão da consulta. */
  atual: string | null;
  /** Para onde o clique leva. Use `hrefDeOrdem` para montá-lo. */
  href: string;
}

/**
 * O próximo valor de `?ordem=` ao clicar em `chave`.
 *
 * Dois estados, não três: um terceiro clique que "desliga" a ordem devolveria a
 * lista à ordem padrão da consulta, que o usuário não tem como prever — e a
 * coluna ficaria com três significados para o mesmo alvo.
 */
export function proximaOrdem(chave: string, atual: string | null | undefined): string {
  return atual === chave ? `-${chave}` : chave;
}

/**
 * O endereço do cabeçalho ordenável, preservando busca e filtros.
 *
 * `pagina` é descartada de propósito: trocar a ordem e continuar na página 5
 * mostra um recorte que não é nem o antigo nem o novo.
 */
export function hrefDeOrdem(
  params: Readonly<Record<string, string | null | undefined>>,
  chave: string,
  atual: string | null | undefined,
): string {
  const query = new URLSearchParams();
  for (const [nome, valor] of Object.entries(params)) {
    if (nome === 'pagina' || nome === 'ordem') continue;
    if (valor !== null && valor !== undefined && valor !== '') query.set(nome, valor);
  }
  query.set('ordem', proximaOrdem(chave, atual));
  return `?${query.toString()}`;
}

function estadoDaOrdem(ordem: OrdemDaColuna): 'ascending' | 'descending' | 'none' {
  if (ordem.atual === ordem.chave) return 'ascending';
  if (ordem.atual === `-${ordem.chave}`) return 'descending';
  return 'none';
}

export interface THProps extends Omit<ComponentProps<'th'>, 'scope'> {
  escopo?: 'col' | 'row';
  /** Presente: o cabeçalho vira link de ordenação e ganha `aria-sort`. */
  ordem?: OrdemDaColuna;
  alinhamento?: AlinhamentoDaCelula;
}

export function TH({
  className,
  escopo = 'col',
  ordem,
  alinhamento = 'inicio',
  children,
  ...props
}: THProps) {
  const estado = ordem === undefined ? undefined : estadoDaOrdem(ordem);
  const Seta = estado === 'ascending' ? ArrowUp : estado === 'descending' ? ArrowDown : null;

  return (
    <th
      role={escopo === 'row' ? 'rowheader' : 'columnheader'}
      scope={escopo}
      data-celula=""
      aria-sort={estado}
      className={cn(
        'group/th bg-surface-sunken text-eyebrow uppercase text-content-muted',
        alinhamento === 'fim' ? 'text-end' : 'text-start',
        className,
      )}
      {...props}
    >
      {ordem === undefined ? (
        children
      ) : (
        <Link
          href={ordem.href}
          className={cn(
            /* 24px de alvo mesmo na densidade densa; a margem negativa devolve o alinhamento com a coluna. */
            '-mx-1 inline-flex min-h-6 items-center gap-1.5 rounded-control px-1 transition-colors transition-base hover:text-content',
            alinhamento === 'fim' && 'flex-row-reverse',
          )}
        >
          {children}
          {Seta === null ? (
            /* A seta neutra só aparece no ponteiro ou no foco: senão toda coluna parece ordenada. */
            <ChevronsUpDown
              className="size-3 shrink-0 opacity-0 transition-opacity transition-base group-hover/th:opacity-60 group-focus-within/th:opacity-60"
              aria-hidden
            />
          ) : (
            <Seta className="size-3 shrink-0 text-content-accent" aria-hidden />
          )}
        </Link>
      )}
    </th>
  );
}

export interface TDProps extends ComponentProps<'td'> {
  /** Coluna de número: alinha à direita e usa dígito de largura fixa. */
  numerico?: boolean;
  /** Corta com reticências em vez de esticar a coluna. */
  truncar?: boolean;
  /** Rótulo da coluna, mostrado só no modo blocos — é o que faz o bloco ser lido. */
  rotulo?: string;
  /** Célula dos controles da linha: encolhe a coluna e sobe acima do link da linha. */
  acoes?: boolean;
  alinhamento?: AlinhamentoDaCelula;
}

export function TD({
  className,
  numerico = false,
  truncar = false,
  rotulo,
  acoes = false,
  alinhamento,
  children,
  ...props
}: TDProps) {
  const alinha = alinhamento ?? (numerico || acoes ? 'fim' : 'inicio');

  return (
    <td
      role="cell"
      data-celula=""
      className={cn(
        'align-middle',
        alinha === 'fim' ? 'text-end' : 'text-start',
        numerico && 'text-num whitespace-nowrap',
        /*
         * `max-w-0` é o que faz `truncate` funcionar em tabela de layout
         * automático: sem um teto, a célula nunca fica menor que o conteúdo e
         * as reticências nunca aparecem.
         */
        truncar && 'max-w-0 truncate',
        /* Acima da célula sobreposta que leva o link da linha — senão o botão não recebe o clique. */
        acoes && 'relative z-10 w-px whitespace-nowrap',
        className,
      )}
      {...props}
    >
      {rotulo !== undefined && (
        <>
          {/*
           * Rótulo do modo blocos. `aria-hidden` porque a associação
           * célula↔cabeçalho continua existindo pelos `role` explícitos — o
           * leitor de tela já anuncia a coluna, e repetir cansa.
           */}
          <span
            data-rotulo=""
            aria-hidden
            className="hidden text-eyebrow uppercase text-content-subtle"
          >
            {rotulo}
          </span>
          {/* Um único item de flex do lado do valor: sem isto, três spans numa célula se espalhariam. */}
          <span className="min-w-0">{children}</span>
        </>
      )}
      {rotulo === undefined && children}
    </td>
  );
}

export interface TableEmptyProps {
  /** Quantas colunas o `<thead>` tem. Sem isso o vazio não atravessa a tabela. */
  colunas: number;
  icone: LucideIcon;
  titulo: string;
  children?: ReactNode;
  acao?: ReactNode;
}

/**
 * O vazio dentro da própria tabela, para o cabeçalho continuar de pé e a
 * moldura não trocar de forma quando o primeiro registro chegar.
 *
 * Vazio é vazio: nenhuma linha de exemplo, nenhum dado ilustrativo (CLAUDE.md).
 * Quem chama diz o que fazer para deixar de estar vazio.
 */
export function TableEmpty({ colunas, icone: Icone, titulo, children, acao }: TableEmptyProps) {
  return (
    <tr role="row">
      <td role="cell" colSpan={colunas} className="px-6 py-12 text-center">
        <div className="mx-auto flex max-w-md flex-col items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-pill bg-surface-muted">
            <Icone className="size-5 text-content-subtle" aria-hidden />
          </span>
          <div className="space-y-1">
            {/* `<p>`, não `<h2>`: título dentro de célula não deve entrar na árvore de headings da página. */}
            <p className="text-h3 text-content">{titulo}</p>
            {children !== undefined && (
              <div className="text-caption text-content-muted">{children}</div>
            )}
          </div>
          {acao}
        </div>
      </td>
    </tr>
  );
}
