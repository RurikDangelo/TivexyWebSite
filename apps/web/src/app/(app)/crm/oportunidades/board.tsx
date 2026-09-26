'use client';

import { type CrmStageKind, boardTotals, formatCents, stageTotals } from '@tivexy/core';
import {
  CalendarClock,
  CircleDot,
  GripVertical,
  Hourglass,
  MoveRight,
  SearchX,
  Trophy,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { type DragEvent, useOptimistic, useState, useTransition } from 'react';

import { FormError } from '@/components/form/messages';
import { SANGRIA_DO_GUTTER } from '@/components/page/page';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { DropdownItem, DropdownLabel, DropdownMenu } from '@/components/ui/dropdown-menu';
import { Segmented } from '@/components/ui/segmented';
import { Stat, StatGrid } from '@/components/ui/stat';
import { Tooltip } from '@/components/ui/tooltip';
import { contagem, dias, formatDayMonth } from '@/lib/format';
import { atrasoDaLinha, cn } from '@/lib/utils';

import { moverOportunidade } from './actions';
import {
  type CartaoDeNegocio,
  type CorteDoQuadro,
  type EtapaDoQuadro,
  JANELA_FECHADAS_DIAS,
  LIMITE_ABERTAS,
  LIMITE_FECHADAS,
  PARADO_A_PARTIR_DE,
} from './state';

interface Movimento {
  id: string;
  para: string;
}

const TIPO: Record<CrmStageKind, { rotulo: string; Icone: typeof Trophy; classe: string }> = {
  open: { rotulo: 'Em aberto', Icone: CircleDot, classe: 'text-content-accent' },
  won: { rotulo: 'Ganho', Icone: Trophy, classe: 'text-success' },
  lost: { rotulo: 'Perdido', Icone: XCircle, classe: 'text-content-muted' },
};

type Recorte = 'tudo' | 'minhas';

/**
 * O funil em colunas.
 *
 * **Duas formas de mover, e a segunda não é enfeite.** Arrastar é o gesto
 * natural com mouse, e não existe para quem usa teclado, leitor de tela ou o
 * dedo — o arrastar do HTML não funciona em toque. O menu "Mover" de cada
 * cartão é o mesmo movimento, pela mesma função, alcançável por qualquer um.
 *
 * O cartão muda de coluna na hora (`useOptimistic`) e volta sozinho se o
 * servidor recusar: o estado otimista só vale durante a transição, e depois
 * dela a tela é a que o banco devolveu. Os totais saem do mesmo estado, então
 * a soma da coluna acompanha o cartão.
 */
export function Board({
  etapas,
  negocios,
  podeMover,
  hoje,
  eu,
  singular,
  plural,
  corte,
}: {
  etapas: readonly EtapaDoQuadro[];
  negocios: readonly CartaoDeNegocio[];
  podeMover: boolean;
  /** Hoje no fuso do tenant, `AAAA-MM-DD`. */
  hoje: string;
  /** Quem está olhando, para o filtro de responsável. */
  eu: string | null;
  /** O nome do recurso no vocabulário do tenant — "tratamento", na clínica. */
  singular: string;
  plural: string;
  /** Se a leitura bateu no teto. Decide entre "este é o total" e "isto é o que deu para somar". */
  corte: CorteDoQuadro;
}) {
  const [otimistas, aplicar] = useOptimistic(
    negocios as CartaoDeNegocio[],
    (atual: CartaoDeNegocio[], m: Movimento) =>
      atual.map((n) => (n.id === m.id ? { ...n, etapaId: m.para, diasParado: 0 } : n)),
  );
  const [, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [anuncio, setAnuncio] = useState('');
  const [alvo, setAlvo] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [recorte, setRecorte] = useState<Recorte>('tudo');
  /** O último cartão movido, para ele pulsar onde caiu em vez de reaparecer do nada. */
  const [destacado, setDestacado] = useState<string | null>(null);

  const soMinhas = recorte === 'minhas';
  const visiveis = soMinhas ? otimistas.filter((n) => n.responsavelId === eu) : otimistas;
  const somaveis = visiveis.map((n) => ({ stageId: n.etapaId, valueCents: n.valorCentavos }));
  const porEtapa = stageTotals(etapas, somaveis);
  const totais = boardTotals(etapas, somaveis);
  const nome = new Map(etapas.map((e) => [e.id, e.name]));

  function mover(negocio: CartaoDeNegocio, para: string) {
    if (!podeMover || negocio.etapaId === para) return;
    const de = negocio.etapaId;
    setErro(null);
    iniciar(async () => {
      /*
       * O destaque entra JUNTO com o movimento otimista, não depois da resposta.
       * O cartão troca de `<ul>`, o React o remonta, e é nessa montagem que o
       * pulso precisa já estar na classe — senão não há animação nenhuma.
       *
       * Por que pulso e não View Transition: a API do navegador precisa de uma
       * escrita síncrona no DOM dentro do callback, e `useOptimistic` só aplica
       * dentro de uma transição, onde `flushSync` é proibido. O `<ViewTransition>`
       * do React ainda não existe no pacote estável (19.2.8). Trocar o
       * `animate-enter` — que partia de `opacity: 0` com até 240ms de atraso e
       * fazia o cartão sumir meio segundo — pelo pulso é a correção que a seção 8
       * pede, e essa é a que muda o que se vê.
       */
      setDestacado(negocio.id);
      aplicar({ id: negocio.id, para });
      const r = await moverOportunidade(negocio.id, de, para);
      if (r.erro === null) {
        setAnuncio(`"${negocio.titulo}" foi para ${nome.get(para) ?? 'a nova etapa'}.`);
      } else {
        setErro(r.erro);
        setDestacado(null);
        setAnuncio(`Não foi possível mover "${negocio.titulo}".`);
      }
    });
  }

  function soltar(e: DragEvent, etapaId: string) {
    e.preventDefault();
    setAlvo(null);
    const negocio = otimistas.find((n) => n.id === e.dataTransfer.getData('text/plain'));
    if (negocio !== undefined) mover(negocio, etapaId);
  }

  return (
    <div className="flex flex-col gap-4">
      <p aria-live="polite" className="sr-only">
        {anuncio}
      </p>

      <StatGrid colunas={3}>
        <Stat
          rotulo="Em aberto"
          valor={totais.open.cents}
          formato="moeda"
          Icone={CircleDot}
          nota={contagem(totais.open.count, singular, plural)}
          parcial={corte.abertas ? `soma das ${LIMITE_ABERTAS} mais recentes` : undefined}
          contar
          animar
          atraso={atrasoDaLinha(0)}
        />
        <Stat
          rotulo={`Ganhos · ${JANELA_FECHADAS_DIAS} dias`}
          valor={totais.won.cents}
          formato="moeda"
          Icone={Trophy}
          tom="success"
          nota={contagem(totais.won.count, singular, plural)}
          parcial={corte.fechadas ? `soma das ${LIMITE_FECHADAS} mais recentes` : undefined}
          contar
          animar
          atraso={atrasoDaLinha(1)}
        />
        <Stat
          rotulo={`Perdas · ${JANELA_FECHADAS_DIAS} dias`}
          valor={totais.lost.cents}
          formato="moeda"
          Icone={XCircle}
          /*
           * Perda fechada não é falha do sistema: é o desfecho normal de um
           * funil. Pintar de vermelho ensinaria a ignorar o vermelho de verdade.
           */
          nota={contagem(totais.lost.count, singular, plural)}
          parcial={corte.fechadas ? `soma das ${LIMITE_FECHADAS} mais recentes` : undefined}
          contar
          animar
          atraso={atrasoDaLinha(2)}
        />
      </StatGrid>

      {eu !== null && (
        <Segmented
          como="botao"
          rotulo={`Filtrar ${plural}`}
          itens={[
            { chave: 'tudo', rotulo: 'Tudo' },
            { chave: 'minhas', rotulo: 'Sou responsável' },
          ]}
          ativa={recorte}
          /* Seta em vez de `setRecorte` direto: o `SetStateAction` do React entraria na inferência da chave. */
          aoTrocar={(chave) => setRecorte(chave)}
        />
      )}

      {erro !== null && <FormError>{erro}</FormError>}

      {/*
       * `relative` não é estética. Texto `sr-only` é `position: absolute`, e um
       * elemento absoluto só é cortado pelo contêiner que rola se ele for o
       * bloco de contenção. Sem isto, o rótulo de leitor de tela de uma coluna
       * fora da tela escapava e esticava a página inteira na horizontal.
       *
       * A sangria vem do mesmo literal que o `<Page variant="quadro">` usa: a
       * faixa rolável tem de chegar à borda da janela, e dois donos discordando
       * do gutter é como o desalinhamento nasce.
       */}
      <div className={cn('relative overflow-x-auto pb-2', SANGRIA_DO_GUTTER)}>
        <ol aria-label="Etapas do funil" className="flex flex-col gap-3 md:flex-row md:items-start">
          {etapas.map((etapa) => {
            const cartoes = visiveis.filter((n) => n.etapaId === etapa.id);
            const semFiltro = otimistas.filter((n) => n.etapaId === etapa.id).length;
            const t = porEtapa.get(etapa.id) ?? { count: 0, cents: 0 };
            const { Icone, classe, rotulo } = TIPO[etapa.kind];
            const terminal = etapa.kind !== 'open';
            const parcial = terminal ? corte.fechadas : corte.abertas;
            const recebendo = alvo === etapa.id && arrastando !== null;

            return (
              <li
                key={etapa.id}
                aria-labelledby={`etapa-${etapa.id}`}
                onDragOver={(e) => {
                  if (!podeMover || arrastando === null) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (alvo !== etapa.id) setAlvo(etapa.id);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setAlvo(null);
                }}
                onDrop={(e) => soltar(e, etapa.id)}
                className={cn(
                  'flex min-w-0 flex-col rounded-card border bg-surface-sunken',
                  'transition-[background-color,border-color,box-shadow] transition-base',
                  /*
                   * Quadro a partir de `md`, não de `lg`: entre 768 e 1023px —
                   * o tablet de balcão — as etapas viravam uma pilha vertical
                   * de blocos largos e o `overflow-x-auto` do pai não servia
                   * para nada.
                   */
                  'md:w-[19.5rem] md:shrink-0',
                  /* Enquanto há um cartão no ar, toda coluna se declara alvo possível. */
                  arrastando !== null && !recebendo && 'border-dashed border-line',
                  recebendo
                    ? 'border-line-accent bg-surface-accent-soft shadow-raised'
                    : arrastando === null && 'border-line-subtle',
                )}
              >
                <header className="flex flex-col gap-1 rounded-t-card border-b border-line-subtle bg-surface-panel px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <Icone className={cn('size-4 shrink-0', classe)} aria-hidden />
                    <h2
                      id={`etapa-${etapa.id}`}
                      className="min-w-0 flex-1 truncate text-label text-content"
                    >
                      {etapa.name}
                      {terminal && <span className="sr-only"> ({rotulo})</span>}
                    </h2>
                    <Badge tone="neutral" tamanho="xs" Icone={null}>
                      <span className="tabular-nums">{t.count}</span>
                      <span className="sr-only"> {t.count === 1 ? 'cartão' : 'cartões'}</span>
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    {/* O total da coluna é o segundo degrau da hierarquia: 22px contra os 32px da faixa. */}
                    <p className="text-metric-sm tabular-nums text-content">
                      {formatCents(t.cents)}
                    </p>
                    {terminal && (
                      <span className="text-caption text-content-subtle">
                        últimos {JANELA_FECHADAS_DIAS} dias
                      </span>
                    )}
                    {parcial && (
                      <Tooltip
                        conteudo={`A leitura parou em ${terminal ? LIMITE_FECHADAS : LIMITE_ABERTAS} registros. Esta soma é do que foi lido, não do funil inteiro.`}
                      >
                        <span>
                          <Badge tone="warning" tamanho="xs">
                            parcial
                          </Badge>
                        </span>
                      </Tooltip>
                    )}
                  </div>
                </header>

                {cartoes.length === 0 ? (
                  <ColunaVazia
                    filtrada={soMinhas && semFiltro > 0}
                    podeMover={podeMover}
                    plural={plural}
                  />
                ) : (
                  /*
                   * Teto em proporção da janela, não em pixels descontados do
                   * cabeçalho: uma etapa com 80 cartões deixaria o quadro com
                   * 6000px de altura e os outros cabeçalhos fora da tela. 70dvh
                   * sobrevive a qualquer mudança na altura do topo.
                   */
                  <ul className="flex flex-col gap-2 overflow-y-auto overscroll-contain p-2 md:max-h-[70dvh]">
                    {cartoes.map((negocio) => (
                      <Cartao
                        key={negocio.id}
                        negocio={negocio}
                        aberta={etapa.kind === 'open'}
                        hoje={hoje}
                        podeMover={podeMover}
                        arrastando={arrastando === negocio.id}
                        destacado={destacado === negocio.id}
                        etapas={etapas}
                        onArrastar={setArrastando}
                        onMover={(para) => mover(negocio, para)}
                      />
                    ))}
                    {recebendo && (
                      /* O vão de destino: o cartão não cai num lugar que ninguém apontou. */
                      <li
                        aria-hidden
                        className="h-14 shrink-0 rounded-card border-2 border-dashed border-line-accent"
                      />
                    )}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

/**
 * A coluna sem cartão — e as duas ausências são diferentes.
 *
 * "Ainda não passou ninguém por aqui" e "o filtro escondeu o que tem" pedem
 * ações opostas: uma é trazer um negócio, a outra é afrouxar o recorte.
 */
function ColunaVazia({
  filtrada,
  podeMover,
  plural,
}: {
  filtrada: boolean;
  podeMover: boolean;
  plural: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-3 py-8 text-center">
      <span className="flex size-9 items-center justify-center rounded-pill bg-surface-muted">
        {filtrada ? (
          <SearchX className="size-4 text-content-subtle" aria-hidden />
        ) : (
          <MoveRight className="size-4 text-content-subtle" aria-hidden />
        )}
      </span>
      <p className="text-caption text-content-muted">
        {filtrada ? `Há ${plural} aqui, mas nenhum sob sua responsabilidade.` : 'Nada nesta etapa.'}
      </p>
      {!filtrada && podeMover && (
        /*
         * Não promete arrastar. O arrastar do HTML não funciona em toque, e
         * esta frase aparecia igual no tablet, onde o gesto simplesmente não
         * existe. O menu de cada cartão funciona em todo lugar.
         */
        <p className="text-caption text-content-subtle">
          Use o menu <span className="font-medium text-content-muted">Mover</span> de um cartão para
          trazer um para cá.
        </p>
      )}
    </div>
  );
}

function Cartao({
  negocio,
  aberta,
  hoje,
  podeMover,
  arrastando,
  destacado,
  etapas,
  onArrastar,
  onMover,
}: {
  negocio: CartaoDeNegocio;
  aberta: boolean;
  hoje: string;
  podeMover: boolean;
  arrastando: boolean;
  destacado: boolean;
  etapas: readonly EtapaDoQuadro[];
  onArrastar: (id: string | null) => void;
  onMover: (para: string) => void;
}) {
  const vencida = aberta && negocio.previsao !== null && negocio.previsao < hoje;
  const parada = aberta && negocio.diasParado >= PARADO_A_PARTIR_DE;
  const destinos = etapas.filter((e) => e.id !== negocio.etapaId);
  const contexto = [negocio.conta, negocio.pessoa].filter(Boolean).join(' · ');

  return (
    <li
      draggable={podeMover}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', negocio.id);
        e.dataTransfer.effectAllowed = 'move';
        onArrastar(negocio.id);
      }}
      onDragEnd={() => onArrastar(null)}
      className={cn(
        'group flex flex-col gap-1.5 rounded-card border border-line-subtle bg-surface-panel p-2.5',
        'shadow-card transition-[box-shadow,opacity,border-color] transition-base',
        'hover:border-line hover:shadow-raised focus-within:border-line-accent',
        podeMover && 'md:cursor-grab md:active:cursor-grabbing',
        /* O que está no ar sai do plano, mas continua legível: some por completo e o gesto perde a referência. */
        arrastando && 'opacity-40 shadow-flat ring-2 ring-line-accent',
        /* Pulso de confirmação onde o cartão caiu (seção 8, regra 4). */
        destacado && 'animate-highlight',
      )}
    >
      <div className="flex items-start gap-2">
        <Link
          href={`/crm/oportunidades/${negocio.id}`}
          className="min-w-0 flex-1 text-label text-content hover:underline"
        >
          {negocio.titulo}
        </Link>
        {podeMover && (
          <GripVertical
            className="mt-0.5 hidden size-4 shrink-0 text-content-subtle opacity-0 transition-opacity transition-base group-hover:opacity-100 md:block"
            aria-hidden
          />
        )}
      </div>

      <div className="flex min-w-0 items-baseline gap-2">
        <p className="shrink-0 text-num font-semibold text-content">
          {formatCents(negocio.valorCentavos)}
        </p>
        {contexto !== '' && (
          <p className="min-w-0 truncate text-caption text-content-muted">{contexto}</p>
        )}
      </div>

      {(negocio.previsao !== null || parada || negocio.responsavel !== null) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {negocio.previsao !== null &&
            (vencida ? (
              <Badge tone="danger" tamanho="xs">
                Vencida · {formatDayMonth(negocio.previsao)}
              </Badge>
            ) : (
              <Badge tone="neutral" tamanho="xs" Icone={CalendarClock}>
                {formatDayMonth(negocio.previsao)}
              </Badge>
            ))}
          {parada &&
            (negocio.diasParado >= 30 ? (
              <Badge tone="warning" tamanho="xs">
                Parada há {dias(negocio.diasParado)}
              </Badge>
            ) : (
              <Badge tone="neutral" tamanho="xs" Icone={Hourglass}>
                {dias(negocio.diasParado)} sem mudança
              </Badge>
            ))}
          {negocio.responsavel !== null && (
            /* O `<span>` é o gatilho da dica: `Avatar` não repassa `aria-describedby`. */
            <Tooltip conteudo={`Responsável: ${negocio.responsavel}`} className="ml-auto">
              <span>
                <Avatar
                  nome={negocio.responsavel}
                  rotulo={`Responsável: ${negocio.responsavel}`}
                  tamanho="xs"
                />
              </span>
            </Tooltip>
          )}
        </div>
      )}

      {podeMover && destinos.length > 0 && (
        <div className="-mb-0.5 flex border-t border-line-subtle pt-1.5">
          {/*
           * Era um `<details>` inline: abrir empurrava todos os cartões abaixo
           * para baixo, não fechava com Escape nem com clique fora, e o
           * fechamento mexia no DOM por trás do React. O menu vive num portal.
           */}
          <DropdownMenu
            rotulo={`Mover ${negocio.titulo}`}
            alinhamento="inicio"
            gatilho={
              <>
                <MoveRight className="size-3.5" aria-hidden />
                Mover
              </>
            }
            classNameGatilho="px-1.5 text-caption text-content-muted hover:bg-surface-muted hover:text-content"
          >
            <DropdownLabel>Mover para</DropdownLabel>
            {destinos.map((destino) => (
              <DropdownItem
                key={destino.id}
                Icone={TIPO[destino.kind].Icone}
                onSelect={() => onMover(destino.id)}
              >
                {destino.name}
              </DropdownItem>
            ))}
          </DropdownMenu>
        </div>
      )}
    </li>
  );
}
