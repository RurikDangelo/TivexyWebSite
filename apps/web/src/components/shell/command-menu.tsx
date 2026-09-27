'use client';

import type { Viewer } from '@tivexy/core';
import {
  ArrowRight,
  CornerDownLeft,
  Database,
  Lock,
  Search,
  SearchX,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as TeclaReact,
} from 'react';

import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { SectionLabel } from '@/components/ui/section-label';
import {
  statusLabel,
  visibleNavigation,
  type NavHref,
  type VisibleItem,
} from '@/config/navigation';
import type { Terms } from '@/lib/terms/vocabulary';
import { cn } from '@/lib/utils';

/*
 * Paleta de comandos (P10) — Ctrl+K, Cmd+K e `/`.
 *
 * ## O que ela é, e o que ela NÃO é
 *
 * Ela navega entre telas. Só isso. Não existe busca de registro no servidor:
 * nenhuma consulta procura um contato, um produto ou uma venda pelo nome fora
 * da tela que já os lista. Uma paleta que devolvesse "Maria Silva — contato"
 * estaria inventando uma funcionalidade que não foi construída, e é o que o
 * CLAUDE.md proíbe em uma frase.
 *
 * A saída honesta não é esconder a lacuna: é nomeá-la. O rodapé do diálogo
 * carrega, sempre visível, a seção "Busca em registros — ainda não
 * implementada" e oferece o que de fato existe — a busca da tela em que a
 * pessoa está. Quando o servidor ganhar busca cruzada, é aquele rodapé que
 * vira uma lista de resultados.
 *
 * Pela mesma razão o gatilho do header diz "Ir para uma tela", e não "Buscar
 * em tudo…" como o desenho da seção 2 sugeriu: o botão descreve o que
 * acontece ao clicar nele.
 *
 * ## Como ela se monta
 *
 * Um componente só, que desenha o gatilho e o diálogo. A casca (Onda 2) põe
 * `<CommandMenu viewer terms />` na zona central do header e pronto — não há
 * provider para montar nem estado para levantar, porque quem abre a paleta é
 * ou o próprio botão ou um atalho global.
 *
 * `visibleNavigation()` é a autoridade sobre o que aparece, exatamente como na
 * sidebar: a mesma regra de rota, o mesmo vocabulário do tenant, e nenhuma
 * segunda lista de quem pode o quê. Ela roda no cliente porque `viewer` e
 * `terms` são dados simples e já atravessam a fronteira hoje (`sidebar-nav`).
 */

/** O que a busca de uma tela aceita, para a oferta do rodapé não prometer demais. */
interface BuscaDaTela {
  /** Nome do parâmetro na URL — é o `name` do campo daquela tela. */
  parametro: string;
  /** O que aquela busca de fato procura. Entra na frase, em minúsculas. */
  procuraPor: string;
  /**
   * Termos que a tela ignoraria em silêncio. Vendas filtra por número e
   * descarta qualquer outra coisa: oferecer "buscar maria em Vendas" seria
   * mandar a pessoa para uma lista que não mudou.
   */
  aceita?: RegExp;
}

/*
 * As telas que hoje têm busca própria, e o parâmetro de cada uma.
 *
 * Escrita à mão porque é a única lista que existe: o parâmetro não é derivável
 * do menu nem de `routeRules` — ele mora no `name` do campo de cada tela. As
 * chaves são `NavHref`, então um caminho que saia do menu para de compilar. O
 * que o tipo não pega é uma tela GANHAR busca e ninguém vir aqui; a
 * verificação é `grep -rn 'params\.q\|name="q"' apps/web/src/app`, que tem de
 * bater com esta lista.
 */
const BUSCA_POR_TELA: Partial<Record<NavHref, BuscaDaTela>> = {
  '/crm/leads': { parametro: 'q', procuraPor: 'nome, e-mail, telefone ou origem' },
  '/crm/contatos': { parametro: 'q', procuraPor: 'nome, e-mail ou CPF' },
  '/crm/empresas': { parametro: 'q', procuraPor: 'nome, site ou CNPJ' },
  '/erp/produtos': { parametro: 'q', procuraPor: 'nome, código ou código de barras' },
  '/erp/vendas': { parametro: 'numero', procuraPor: 'número da venda', aceita: /^\d{1,12}$/ },
  '/erp/estoque': { parametro: 'q', procuraPor: 'nome ou código' },
  '/erp/financeiro': { parametro: 'q', procuraPor: 'descrição, de quem ou categoria' },
  '/equipe': { parametro: 'q', procuraPor: 'nome ou e-mail' },
};

/*
 * Leitura por caminho vindo do `usePathname()`, que é `string`. O alargamento
 * é seguro na direção que importa: a escrita do objeto acima continua sendo
 * conferida contra `NavHref`, e é ela que erra.
 */
function buscaDaTela(href: string): BuscaDaTela | undefined {
  return (BUSCA_POR_TELA as Readonly<Record<string, BuscaDaTela | undefined>>)[href];
}

/**
 * Minúsculas sem acento: quem digita "producao" espera achar "Produção", e
 * quem digita no celular quase nunca acentua.
 */
function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR').trim();
}

interface TelaDaPaleta {
  item: VisibleItem;
  grupo: string | null;
  rotuloNorm: string;
  /** Grupo e caminho, para "erp" achar as telas do ERP e "/crm" as do CRM. */
  contextoNorm: string;
}

/** Fora do encaixe. Finito é resultado; infinito é descarte. */
const SEM_ENCAIXE = Number.POSITIVE_INFINITY;

/**
 * Menor é melhor. A ordem existe para que a primeira linha seja a que a pessoa
 * quis: "con" tem de abrir Contatos antes de Configurações, e "venda" tem de
 * abrir Vendas antes de Formas de pagamento.
 */
function pontuar(tela: TelaDaPaleta, termo: string): number {
  const posicao = tela.rotuloNorm.indexOf(termo);
  if (posicao === 0) return 0;
  /* Começo de palavra vale mais que meio de palavra: "geral" → "Visão geral". */
  if (posicao > 0) return tela.rotuloNorm[posicao - 1] === ' ' ? 1 : 2;
  return tela.contextoNorm.includes(termo) ? 3 : SEM_ENCAIXE;
}

interface ItemNaLista {
  tela: TelaDaPaleta;
  /** Índice na lista inteira. É o que o `aria-activedescendant` endereça. */
  indice: number;
}

interface SecaoDaPaleta {
  /** `null` no grupo solto do topo do menu, que também não tem cabeçalho lá. */
  rotulo: string | null;
  itens: readonly ItemNaLista[];
}

/**
 * A lista pronta para desenhar.
 *
 * Tipada à mão porque os dois caminhos do `useMemo` — agrupado e filtrado —
 * devolvem formas equivalentes mas não idênticas, e a união inferida faria o
 * `.map()` do JSX deixar de ser chamável.
 */
interface ListaDaPaleta {
  secoes: readonly SecaoDaPaleta[];
  /** As mesmas telas em uma dimensão, na ordem da tela. É o que as setas percorrem. */
  planas: readonly TelaDaPaleta[];
}

/*
 * O atalho que o gatilho mostra depende do teclado de quem lê, e isso só
 * existe no cliente. `useSyncExternalStore` é o caminho sem piscada e sem
 * divergência de hidratação: o servidor pinta "Ctrl K", e a hidratação
 * corrige para "⌘ K". Um `useEffect` com `setState` faria a renderização em
 * cascata que o lint da casa proíbe, e por um valor que nunca muda depois.
 *
 * Ninguém troca de teclado no meio da sessão: assinar é não fazer nada.
 */
const ASSINAR_TECLADO = () => () => undefined;
const TECLADO_DO_MAC = () => /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
const TECLADO_NO_SERVIDOR = () => false;

export interface CommandMenuProps {
  viewer: Viewer;
  /** O vocabulário do tenant: a paleta acha "Pacientes" se o nicho renomeou. */
  terms: Terms;
  /** Classe do gatilho no header — largura, ordem na grade. */
  className?: string;
}

export function CommandMenu({ viewer, terms, className }: CommandMenuProps) {
  const idBase = useId();
  const idLista = `${idBase}-lista`;

  const router = useRouter();
  const pathname = usePathname();

  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState('');
  const [indiceAtivo, setIndiceAtivo] = useState(0);

  const noMac = useSyncExternalStore(ASSINAR_TECLADO, TECLADO_DO_MAC, TECLADO_NO_SERVIDOR);

  const refCampo = useRef<HTMLInputElement>(null);
  const refLista = useRef<HTMLDivElement>(null);

  const telas = useMemo<readonly TelaDaPaleta[]>(
    () =>
      visibleNavigation(viewer, terms).flatMap((grupo) =>
        grupo.items.map((item) => ({
          item,
          grupo: grupo.label,
          rotuloNorm: normalizar(item.label),
          contextoNorm: normalizar(`${grupo.label ?? ''} ${item.href}`),
        })),
      ),
    [viewer, terms],
  );

  const termo = normalizar(texto);

  const { secoes, planas } = useMemo<ListaDaPaleta>(() => {
    const ordenadas: readonly TelaDaPaleta[] =
      termo === ''
        ? telas
        : telas
            .map((tela) => ({ tela, ponto: pontuar(tela, termo) }))
            .filter((linha) => linha.ponto !== SEM_ENCAIXE)
            /* `sort` é estável desde o ES2019: empate mantém a ordem do menu. */
            .sort((a, b) => a.ponto - b.ponto)
            .map((linha) => linha.tela);

    const lista: ItemNaLista[] = ordenadas.map((tela, indice) => ({ tela, indice }));

    /*
     * Filtrando, a lista está ordenada por relevância e os grupos se
     * intercalam — mantê-los seria desenhar um cabeçalho de seção por item, e
     * o cabeçalho é justamente o que mostra a ordem do menu. Sem termo, os
     * grupos são a orientação: é o menu, na ordem do menu. Na lista filtrada
     * quem diz a origem de cada linha é o nome do grupo à direita dela.
     */
    if (termo !== '') {
      const filtradas: SecaoDaPaleta[] = lista.length === 0 ? [] : [{ rotulo: null, itens: lista }];
      return { secoes: filtradas, planas: ordenadas };
    }

    /* `Map` preserva a ordem de inserção, que aqui é a ordem do menu. */
    const porGrupo = new Map<string, { rotulo: string | null; itens: ItemNaLista[] }>();
    for (const entrada of lista) {
      const rotulo = entrada.tela.grupo;
      const secao = porGrupo.get(rotulo ?? '');
      if (secao === undefined) porGrupo.set(rotulo ?? '', { rotulo, itens: [entrada] });
      else secao.itens.push(entrada);
    }
    return { secoes: [...porGrupo.values()], planas: ordenadas };
  }, [telas, termo]);

  /*
   * O índice guardado pode ter ficado maior que a lista depois de uma tecla.
   * Corrigir na renderização evita o quadro em que o `aria-activedescendant`
   * aponta para um id que não existe mais.
   */
  const ativo = planas.length === 0 ? -1 : Math.min(indiceAtivo, planas.length - 1);

  /*
   * Abrir é sempre começar do zero: reabrir com o termo da vez passada faria a
   * paleta responder a uma pergunta que não foi feita agora. Ajuste durante a
   * renderização, que é o padrão do React para reagir a uma mudança de estado
   * — um efeito custaria uma renderização a mais e uma piscada com a lista
   * velha.
   */
  const [abertoAnterior, setAbertoAnterior] = useState(aberto);
  if (aberto !== abertoAnterior) {
    setAbertoAnterior(aberto);
    if (aberto) {
      setTexto('');
      setIndiceAtivo(0);
    }
  }

  /* Voltar pelo navegador com a paleta aberta deixaria um modal sobre outra tela. */
  const [caminhoAnterior, setCaminhoAnterior] = useState(pathname);
  if (pathname !== caminhoAnterior) {
    setCaminhoAnterior(pathname);
    setAberto(false);
  }

  /*
   * O `<dialog>` só existe depois que o `Dialog` chama `showModal()`, no efeito
   * dele. Efeito de filho roda antes de efeito de pai, então este aqui é o
   * primeiro momento em que o campo é focável. `autoFocus` não serviria: no
   * SSR ele vira atributo e o navegador roubaria o foco no carregamento da
   * página, com a paleta fechada.
   */
  useEffect(() => {
    if (aberto) refCampo.current?.focus();
  }, [aberto]);

  /* Atalhos globais. */
  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.defaultPrevented) return;

      /* Sem Shift: Ctrl+Shift+K é o console do Firefox, e não o nosso atalho. */
      const atalhoDaPaleta =
        (evento.ctrlKey || evento.metaKey) &&
        !evento.altKey &&
        !evento.shiftKey &&
        (evento.key === 'k' || evento.key === 'K');

      if (atalhoDaPaleta) {
        evento.preventDefault();
        setAberto((estava) => !estava);
        return;
      }

      /*
       * A barra abre só quando ela não seria um caractere. Sem esta guarda,
       * digitar um endereço de site num campo de empresa abriria a paleta e
       * comeria a tecla.
       */
      if (evento.key === '/' && !evento.ctrlKey && !evento.metaKey && !evento.altKey && !aberto) {
        if (digitando(evento.target)) return;
        evento.preventDefault();
        setAberto(true);
      }
    };

    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aberto]);

  /* Quem anda é o `aria-activedescendant`; o painel não rola atrás dele sozinho. */
  useEffect(() => {
    if (!aberto || ativo < 0) return;
    const opcoes = refLista.current?.querySelectorAll<HTMLElement>('[role="option"]');
    opcoes?.item(ativo)?.scrollIntoView({ block: 'nearest' });
  }, [aberto, ativo]);

  /* A tela em que a pessoa está: o item de menu mais específico que cobre a URL. */
  const telaAtual = useMemo(() => {
    let achada: TelaDaPaleta | undefined;
    for (const tela of telas) {
      const href = tela.item.href;
      if (pathname !== href && !pathname.startsWith(`${href}/`)) continue;
      if (achada === undefined || href.length > achada.item.href.length) achada = tela;
    }
    return achada;
  }, [telas, pathname]);

  const buscaAtual = telaAtual === undefined ? undefined : buscaDaTela(telaAtual.item.href);
  const termoCru = texto.trim();

  /* A oferta do rodapé só existe quando levaria de fato a um resultado. */
  const hrefDaBuscaAtual =
    telaAtual !== undefined &&
    buscaAtual !== undefined &&
    termoCru !== '' &&
    (buscaAtual.aceita === undefined || buscaAtual.aceita.test(termoCru))
      ? /* Sem herdar a query atual: a paleta começa uma busca, não refina a que está na tela. */
        `${telaAtual.item.href}?${new URLSearchParams({ [buscaAtual.parametro]: termoCru }).toString()}`
      : null;

  function irPara(tela: TelaDaPaleta) {
    if (tela.item.status !== 'ready') return;
    setAberto(false);
    router.push(tela.item.href);
  }

  function mover(passo: number) {
    if (planas.length === 0) return;
    const base = ativo < 0 ? (passo > 0 ? 0 : planas.length - 1) : ativo + passo;
    setIndiceAtivo(((base % planas.length) + planas.length) % planas.length);
  }

  function aoTeclarNoCampo(evento: TeclaReact<HTMLInputElement>) {
    switch (evento.key) {
      case 'ArrowDown':
        evento.preventDefault();
        mover(1);
        return;

      case 'ArrowUp':
        evento.preventDefault();
        mover(-1);
        return;

      case 'Enter': {
        const escolhida = ativo < 0 ? undefined : planas.at(ativo);
        if (escolhida !== undefined) {
          evento.preventDefault();
          irPara(escolhida);
          return;
        }
        /*
         * Nenhuma tela casou com o termo, e a tela atual tem busca: Enter leva
         * para ela. É a única ação disponível, está visível no rodapé, e sem
         * isto a paleta terminaria em beco sem saída — que é exatamente a
         * sensação de "produto quebrado" que o redesenho veio tirar.
         */
        if (hrefDaBuscaAtual === null) return;
        evento.preventDefault();
        setAberto(false);
        router.push(hrefDaBuscaAtual);
        return;
      }

      default:
        /*
         * Escape é do `<dialog>` nativo, e Home/End ficam com o cursor de
         * texto: aqui isto é um campo de digitação antes de ser uma lista.
         */
        return;
    }
  }

  /* Sem nenhuma tela autorizada não há para onde ir, e um gatilho que abre uma
   * lista vazia é pior do que gatilho nenhum. */
  if (telas.length === 0) return null;

  /*
   * Só se anuncia o que mudou por causa da digitação. Abrir a paleta e ouvir
   * "dezesseis telas" antes de digitar qualquer coisa é ruído.
   */
  const contagem =
    planas.length === 0
      ? 'Nenhuma tela encontrada.'
      : planas.length === 1
        ? '1 tela encontrada.'
        : `${planas.length} telas encontradas.`;

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-label="Ir para uma tela"
        className={cn(
          'flex h-9 shrink-0 items-center gap-2 rounded-control border border-line-subtle',
          /* `transition-base` só traz duração e curva; a propriedade é daqui. */
          'bg-surface-sunken px-2.5 text-content-muted transition-colors transition-base',
          'hover:border-line hover:text-content',
          /* Em telas estreitas o header não comporta uma barra: vira ícone. */
          'sm:w-full sm:max-w-xl sm:px-3',
          className,
        )}
      >
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="hidden flex-1 truncate text-left text-body sm:block" aria-hidden>
          Ir para uma tela
        </span>
        <kbd
          aria-hidden
          className="hidden shrink-0 rounded-control border border-line-subtle bg-surface px-1.5 py-0.5 text-micro text-content-subtle md:inline-block"
        >
          {noMac ? '⌘ K' : 'Ctrl K'}
        </kbd>
      </button>

      <Dialog
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        tamanho="lg"
        titulo="Ir para uma tela"
        rodape={
          <BuscaEmRegistros
            tela={telaAtual}
            busca={buscaAtual}
            termo={termoCru}
            href={hrefDaBuscaAtual}
            aoSair={() => setAberto(false)}
          />
        }
      >
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-content-subtle"
            />
            <Input
              ref={refCampo}
              type="text"
              role="combobox"
              autoComplete="off"
              spellCheck={false}
              value={texto}
              onChange={(evento) => {
                setTexto(evento.target.value);
                setIndiceAtivo(0);
              }}
              onKeyDown={aoTeclarNoCampo}
              placeholder="Nome da tela — contatos, vendas, estoque…"
              aria-label="Buscar uma tela pelo nome"
              aria-expanded
              aria-controls={idLista}
              aria-autocomplete="list"
              aria-activedescendant={ativo < 0 ? undefined : `${idLista}-opcao-${ativo}`}
              className="pl-9"
            />
          </div>

          {/* A lista rola sozinha: o campo não pode sair de vista enquanto se digita. */}
          <div
            ref={refLista}
            id={idLista}
            role="listbox"
            aria-label="Telas"
            className="-mx-1 max-h-[min(22rem,45dvh)] overflow-y-auto overscroll-contain px-1"
          >
            {secoes.map((secao, posicao) => {
              const idRotulo = `${idBase}-secao-${posicao}`;
              const linhas = secao.itens.map(({ tela, indice }) => (
                <Opcao
                  key={tela.item.href}
                  id={`${idLista}-opcao-${indice}`}
                  tela={tela}
                  ativa={indice === ativo}
                  mostrarGrupo={termo !== ''}
                  aoApontar={() => setIndiceAtivo(indice)}
                  aoEscolher={() => irPara(tela)}
                />
              ));

              /*
               * Grupo sem nome não vira `role="group"`: um grupo sem nome
               * acessível é ruído na navegação por leitor de tela. Com
               * `presentation` o `<div>` some da árvore e as opções passam a
               * pertencer direto ao `listbox`, que é o que elas são.
               */
              return secao.rotulo === null ? (
                <div key={idRotulo} role="presentation" className="mt-2 first:mt-0">
                  {linhas}
                </div>
              ) : (
                <div
                  key={idRotulo}
                  role="group"
                  aria-labelledby={idRotulo}
                  className="mt-2 first:mt-0"
                >
                  <SectionLabel id={idRotulo} className="px-2 pb-1">
                    {secao.rotulo}
                  </SectionLabel>
                  {linhas}
                </div>
              );
            })}
          </div>

          {planas.length === 0 && (
            <p className="flex items-center gap-2 px-2 py-3 text-caption text-content-muted">
              <SearchX aria-hidden className="size-4 shrink-0" />
              Nenhuma tela com “{termoCru}”.
            </p>
          )}

          <span role="status" aria-live="polite" className="sr-only">
            {aberto && termo !== '' ? contagem : ''}
          </span>
        </div>
      </Dialog>
    </>
  );
}

/** Uma tela na lista. */
function Opcao({
  id,
  tela,
  ativa,
  mostrarGrupo,
  aoApontar,
  aoEscolher,
}: {
  id: string;
  tela: TelaDaPaleta;
  ativa: boolean;
  /** Filtrando, o grupo some do cabeçalho e precisa reaparecer na linha. */
  mostrarGrupo: boolean;
  aoApontar: () => void;
  aoEscolher: () => void;
}) {
  const { item } = tela;
  const Icone: LucideIcon = item.icon;
  const pronta = item.status === 'ready';
  const bloqueada = item.status === 'blocked';

  return (
    <div
      id={id}
      role="option"
      aria-selected={ativa}
      aria-disabled={pronta ? undefined : true}
      /*
       * `mousemove`, não `mouseenter`: rolar a lista com as setas passa linhas
       * por baixo de um cursor parado, e com `mouseenter` o ponteiro roubaria
       * a seleção de volta a cada tecla.
       */
      onMouseMove={aoApontar}
      /* Sem isto o clique tira o foco do campo antes de chegar aqui. */
      onMouseDown={(evento) => evento.preventDefault()}
      onClick={aoEscolher}
      className={cn(
        'flex min-h-9 items-center gap-2.5 rounded-control px-2 py-1.5 text-body',
        'text-content-default transition-colors transition-base',
        pronta ? 'cursor-pointer' : 'cursor-not-allowed text-content-subtle',
        ativa && pronta && 'bg-surface-muted text-content',
      )}
    >
      <Icone aria-hidden className={cn('size-4 shrink-0', !pronta && 'opacity-60')} />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>

      {mostrarGrupo && tela.grupo !== null && (
        <span className="shrink-0 text-caption text-content-subtle">{tela.grupo}</span>
      )}

      {pronta ? (
        /* A dica do Enter só na linha em que Enter faz alguma coisa. */
        ativa && <CornerDownLeft aria-hidden className="size-3.5 shrink-0 text-content-subtle" />
      ) : (
        <>
          {bloqueada && <Lock aria-hidden className="size-3.5 shrink-0 opacity-60" />}
          <span className="shrink-0 text-caption">({statusLabel[item.status]})</span>
        </>
      )}
    </div>
  );
}

/**
 * O rodapé que não deixa a lacuna passar por funcionalidade.
 *
 * Fica no rodapé, e não no fim da lista, porque não pode rolar para fora da
 * vista: é ele que impede alguém abrir a paleta, digitar o nome de um cliente
 * e concluir que o produto não acha os próprios dados. Ele diz o que não
 * existe, e oferece o que existe.
 */
function BuscaEmRegistros({
  tela,
  busca,
  termo,
  href,
  aoSair,
}: {
  tela: TelaDaPaleta | undefined;
  busca: BuscaDaTela | undefined;
  /** O que foi digitado, cru. Separa "não digitou" de "digitou algo recusado". */
  termo: string;
  /** `null` quando não há oferta — e então o motivo é dito em palavras. */
  href: string | null;
  aoSair: () => void;
}) {
  return (
    <div className="flex w-full flex-col gap-2">
      <SectionLabel Icone={Database}>Busca em registros — ainda não implementada</SectionLabel>

      <p className="text-caption text-content-muted">
        Esta paleta navega entre telas. Procurar um contato, um produto ou uma venda pelo nome
        depende de uma busca no servidor que ainda não existe — quando existir, os resultados
        aparecem aqui.
      </p>

      {href !== null && tela !== undefined && busca !== undefined ? (
        <Link
          href={href}
          /* Fechar na hora: a saída do diálogo roda enquanto a rota carrega. */
          onClick={aoSair}
          className={cn(
            'flex min-h-9 items-center gap-2 rounded-control px-2 py-1.5 text-label',
            'text-content-accent transition-colors transition-base hover:bg-surface-muted',
          )}
        >
          <ArrowRight aria-hidden className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            Buscar “{termo}” em {tela.item.label}
            <span className="text-caption text-content-subtle"> · por {busca.procuraPor}</span>
          </span>
        </Link>
      ) : (
        <p className="text-caption text-content-subtle">{semOferta(tela, busca, termo)}</p>
      )}
    </div>
  );
}

/**
 * Por que não há atalho para a busca da tela atual.
 *
 * Quatro motivos diferentes, quatro frases. "Não dá" sem dizer por que é o que
 * faz alguém tentar de novo esperando outro resultado.
 */
function semOferta(
  tela: TelaDaPaleta | undefined,
  busca: BuscaDaTela | undefined,
  termo: string,
): string {
  if (tela === undefined) return 'A tela atual não tem busca própria.';
  if (busca === undefined) return `${tela.item.label} não tem busca própria.`;
  if (termo === '') return `Digite para buscar em ${tela.item.label} por ${busca.procuraPor}.`;
  /* Digitou, e a tela descartaria o termo em silêncio — ver `BuscaDaTela.aceita`. */
  return `A busca de ${tela.item.label} só aceita ${busca.procuraPor}.`;
}

/**
 * O alvo do evento é um lugar onde a barra vale como caractere.
 *
 * `<select>` fora da lista de propósito: ali a barra é atalho de busca por
 * inicial, não texto, e abrir a paleta por cima disso é o comportamento certo.
 */
function digitando(alvo: EventTarget | null): boolean {
  if (!(alvo instanceof HTMLElement)) return false;
  if (alvo.isContentEditable) return true;
  return alvo instanceof HTMLInputElement || alvo instanceof HTMLTextAreaElement;
}
