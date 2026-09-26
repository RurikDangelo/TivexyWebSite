import { type ChatMessage, groupMessages, relativeTime } from '@tivexy/core';
import { AtSign, CornerUpLeft, MessageSquareDashed, Trash2 } from 'lucide-react';

import { EmptyState } from '@/components/page/empty-state';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { dividirPorDia } from '@/lib/chat/dia';
import type { ConversaLida, MensagemNaTela } from '@/lib/chat/model';
import { formatInstant } from '@/lib/format';
import { cn } from '@/lib/utils';

import { AcoesDaMensagem } from './message-actions';
import { AoFimDaConversa } from './scroll-to-end';

/**
 * A conversa: dias, blocos de fala e mensagens.
 *
 * Duas divisões, nesta ordem e não na outra:
 *
 *   1. por **dia**, com a régua de data — `dividirPorDia`, no fuso da empresa;
 *   2. dentro de cada dia, por **autor** — `groupMessages` do Core, que junta
 *      mensagens seguidas da mesma pessoa numa janela de cinco minutos.
 *
 * Inverter a ordem faria um bloco atravessar a meia-noite e ficar todo de um
 * lado da régua "Hoje", com falas de ontem debaixo dela.
 *
 * ## A região `aria-live`
 *
 * A lista é `polite`: o leitor de tela espera a pausa de quem estiver falando
 * antes de anunciar o que chegou. `assertive` interromperia a leitura da
 * mensagem anterior a cada busca de 20 segundos, que é exatamente o contrário
 * do que se quer num chat. `aria-relevant="additions"` limita o anúncio ao que
 * é novo — sem ele, uma revalidação que reordena qualquer coisa faria o leitor
 * reler a conversa inteira.
 */

export interface ConversaProps {
  conversa: ConversaLida;
  fuso: string;
  /** `AAAA-MM-DD` no fuso da empresa — a base das réguas "Hoje" e "Ontem". */
  hoje: string;
  /** O relógio do servidor, um só para a lista inteira. */
  agora: Date;
  /** Endereço desta tela, para montar `?responder=<id>`. */
  caminho: string;
  /** `true` quando quem olha modera (`core.users.write`). */
  moderador: boolean;
  canalNome: string;
}

/**
 * A mensagem da tela vestida de `ChatMessage`, para o Core agrupar.
 *
 * O Core fala em `authorId`/`createdAt` e a tela fala em `autorId`/`criadaEm`
 * — e é bom que falem: um é contrato compartilhado entre aplicações, o outro é
 * vocabulário desta interface. A ponte fica aqui, explícita, em vez de o
 * modelo da tela nascer com os dois nomes para cada coisa.
 *
 * `tela` viaja junto porque `groupMessages` é genérico em `T extends
 * ChatMessage`: o que entra sai, e assim não é preciso reencontrar a mensagem
 * pelo id depois de agrupar.
 */
interface ParaAgrupar extends ChatMessage {
  tela: MensagemNaTela;
}

function paraAgrupar(mensagem: MensagemNaTela): ParaAgrupar {
  return {
    id: mensagem.id,
    authorId: mensagem.autorId,
    createdAt: mensagem.criadaEm,
    editedAt: mensagem.editadaEm,
    deletedAt: mensagem.apagadaEm,
    /* Resposta abre bloco próprio no Core — por isso o campo importa aqui. */
    replyToId: mensagem.respondeA?.id ?? null,
    tela: mensagem,
  };
}

/** Como o autor é chamado quando não há nome. Ausência também é informação. */
function nomeDoAutor(mensagem: MensagemNaTela): string {
  if (mensagem.autorNome !== null) return mensagem.autorNome;
  /* `author_id` nulo é a FK que zerou: a pessoa saiu da empresa de vez. */
  return mensagem.autorId === null ? 'Alguém que saiu da equipe' : 'Sem acesso ativo';
}

export function Conversa({
  conversa,
  fuso,
  hoje,
  agora,
  caminho,
  moderador,
  canalNome,
}: ConversaProps) {
  const { mensagens, truncada, falhou, primeiraNaoLida } = conversa;

  if (falhou) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <EmptyState estado="erro" titulo="Não consegui ler esta conversa" moldura={false}>
          A leitura das mensagens falhou agora. Não dá para saber se há algo novo — e nada foi
          marcado como lido. Use o botão Atualizar, acima.
        </EmptyState>
      </div>
    );
  }

  if (mensagens.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <EmptyState icone={MessageSquareDashed} titulo="Ninguém falou aqui ainda" moldura={false}>
          Este canal existe e está vazio — o que é o esperado num canal recém-criado. A primeira
          mensagem é sua: escreva abaixo o que <strong>{canalNome}</strong> deve tratar.
        </EmptyState>
      </div>
    );
  }

  const dias = dividirPorDia(mensagens, fuso, hoje);
  const ultima = mensagens[mensagens.length - 1]?.id ?? null;

  return (
    <div
      data-rolagem-da-conversa
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3"
    >
      {truncada && (
        /*
         * A conversa foi cortada, e isso se diz. Sumir com o começo sem avisar
         * é mentir por omissão — quem procura o que combinou em julho ficaria
         * rolando para sempre num fim que não existe.
         */
        <p className="mb-3 rounded-control border border-line-subtle bg-surface-sunken px-3 py-2 text-caption text-content-muted">
          Mostrando as últimas {mensagens.length} mensagens deste canal. Carregar as anteriores
          ainda não existe — é tela por construir, não impedimento de terceiro.
        </p>
      )}

      <ol
        aria-live="polite"
        aria-relevant="additions"
        aria-label={`Mensagens de ${canalNome}`}
        className="flex flex-col gap-1"
      >
        {dias.map((dia) => (
          <li key={dia.dia}>
            {/*
             * A régua de data é `<h2>` em texto acessível e linha no desenho.
             * Sem cabeçalho, quem navega por títulos não tem como pular de um
             * dia para outro numa conversa de duas semanas.
             */}
            <h2 className="sticky top-0 z-[var(--z-sticky)] my-2 flex items-center gap-3 bg-surface-panel py-1">
              <span className="h-px flex-1 bg-line-subtle" aria-hidden />
              <time
                dateTime={dia.dia}
                className="rounded-pill bg-surface-sunken px-2.5 py-0.5 text-eyebrow text-content-muted"
              >
                {dia.rotulo}
              </time>
              <span className="h-px flex-1 bg-line-subtle" aria-hidden />
            </h2>

            <ol className="flex flex-col gap-2">
              {groupMessages(dia.mensagens.map(paraAgrupar)).map((bloco) => (
                <li key={bloco.messages[0]?.id}>
                  <BlocoDeFala
                    mensagens={bloco.messages.map((m) => m.tela)}
                    fuso={fuso}
                    agora={agora}
                    caminho={caminho}
                    moderador={moderador}
                    primeiraNaoLida={primeiraNaoLida}
                  />
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>

      <AoFimDaConversa ultimaMensagem={ultima} />
    </div>
  );
}

/**
 * Um bloco: a mesma pessoa, seguida, na mesma janela de tempo.
 *
 * Avatar e nome aparecem uma vez. Repeti-los em cinco mensagens de vinte
 * segundos transforma uma fala numa planilha — e é por isso que o Core tem
 * `groupMessages`, em vez de a tela desenhar linha por linha.
 */
function BlocoDeFala({
  mensagens,
  fuso,
  agora,
  caminho,
  moderador,
  primeiraNaoLida,
}: {
  mensagens: readonly MensagemNaTela[];
  fuso: string;
  agora: Date;
  caminho: string;
  moderador: boolean;
  primeiraNaoLida: string | null;
}) {
  const primeira = mensagens[0];
  if (primeira === undefined) return null;

  const nome = nomeDoAutor(primeira);
  const anonimo = primeira.autorNome === null;

  return (
    <div className="flex gap-2.5">
      <Avatar
        nome={nome}
        tamanho="sm"
        tom={primeira.souEuQuemEscreveu ? 'brand' : anonimo ? 'neutral' : 'accent'}
        className="mt-1"
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span
            className={cn(
              'text-label text-content',
              anonimo && 'font-normal text-content-subtle italic',
            )}
          >
            {nome}
          </span>
          {primeira.souEuQuemEscreveu && (
            <span className="text-caption text-content-subtle">você</span>
          )}
          <time
            dateTime={primeira.criadaEm}
            title={formatInstant(primeira.criadaEm, fuso)}
            className="text-caption text-content-subtle"
          >
            {relativeTime(primeira.criadaEm, agora, fuso)}
          </time>
        </p>

        <div className="flex flex-col">
          {mensagens.map((mensagem) => (
            <Mensagem
              key={mensagem.id}
              mensagem={mensagem}
              autorNome={nome}
              fuso={fuso}
              agora={agora}
              caminho={caminho}
              moderador={moderador}
              novaAPartirDaqui={mensagem.id === primeiraNaoLida}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function Mensagem({
  mensagem,
  autorNome,
  fuso,
  agora,
  caminho,
  moderador,
  novaAPartirDaqui,
}: {
  mensagem: MensagemNaTela;
  autorNome: string;
  fuso: string;
  agora: Date;
  caminho: string;
  moderador: boolean;
  novaAPartirDaqui: boolean;
}) {
  const apagada = mensagem.apagadaEm !== null;
  /*
   * Apagada não tem menu: editar o banco recusa, apagar de novo é o mesmo
   * pedido, e responder a um espaço em branco não diz nada a ninguém. Um menu
   * com três itens que não fazem nada é pior que nenhum menu.
   */
  const temAcoes = !apagada;

  return (
    <>
      {novaAPartirDaqui && (
        /*
         * A régua do que chegou desde a última visita. `role="separator"` com
         * nome acessível para que quem não vê a linha vermelha ainda saiba
         * onde parou de ler.
         */
        <p
          role="separator"
          aria-label="Novas mensagens a partir daqui"
          className="my-1.5 flex items-center gap-2"
        >
          <span className="h-px flex-1 bg-danger" aria-hidden />
          <span className="text-micro text-danger uppercase">Novas</span>
        </p>
      )}

      <div
        id={`mensagem-${mensagem.id}`}
        className={cn(
          'group/mensagem flex items-start gap-2 rounded-control px-2 py-1 -mx-2 transition-base',
          'hover:bg-surface-subtle',
          mensagem.mencionaVoce && 'bg-surface-accent-soft hover:bg-surface-accent-soft',
        )}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {mensagem.respondeA !== null && (
            <a
              href={`#mensagem-${mensagem.respondeA.id}`}
              className="flex min-w-0 items-center gap-1.5 rounded-control text-caption text-content-subtle transition-base hover:text-content-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <CornerUpLeft className="size-3 shrink-0" aria-hidden />
              <span className="shrink-0">
                {mensagem.respondeA.autorNome ?? 'alguém que saiu da equipe'}:
              </span>
              <span className="truncate italic">
                {mensagem.respondeA.apagada
                  ? 'mensagem apagada'
                  : mensagem.respondeA.trecho === ''
                    ? 'mensagem fora deste trecho da conversa'
                    : mensagem.respondeA.trecho}
              </span>
            </a>
          )}

          {apagada ? (
            /*
             * Apagada NÃO some. A linha fica porque as respostas seguintes
             * apontam para ela — e porque a conversa é registro de o que a
             * equipe combinou. O corpo, esse foi esvaziado no banco: não há
             * texto escondido aqui esperando um `view-source`.
             */
            <p className="flex items-center gap-1.5 text-body text-content-subtle italic">
              <Trash2 className="size-3.5 shrink-0" aria-hidden />
              mensagem apagada
              <time
                dateTime={mensagem.apagadaEm ?? undefined}
                className="text-caption not-italic"
                title={
                  mensagem.apagadaEm === null ? undefined : formatInstant(mensagem.apagadaEm, fuso)
                }
              >
                · {relativeTime(mensagem.apagadaEm ?? mensagem.criadaEm, agora, fuso)}
              </time>
            </p>
          ) : (
            <p className="text-body break-words whitespace-pre-wrap text-content-default">
              {mensagem.corpo}
              {mensagem.editadaEm !== null && (
                <span
                  className="ml-1.5 text-caption text-content-subtle"
                  title={`Editada em ${formatInstant(mensagem.editadaEm, fuso)}`}
                >
                  (editada)
                </span>
              )}
            </p>
          )}

          {mensagem.mencionaVoce && !apagada && (
            <span>
              <Badge tone="brand" tamanho="xs" Icone={AtSign}>
                mencionou você
              </Badge>
            </span>
          )}
        </div>

        {/*
         * O horário de cada mensagem dentro do bloco. Só o do topo do bloco é
         * visível o tempo todo; os outros aparecem no ponteiro — mas continuam
         * no HTML e no leitor de tela, porque `opacity` não esconde de
         * tecnologia assistiva. Quem navega por teclado não perde a hora.
         */}
        <time
          dateTime={mensagem.criadaEm}
          className="mt-0.5 shrink-0 text-micro text-content-subtle opacity-0 transition-base group-hover/mensagem:opacity-100"
        >
          {formatInstant(mensagem.criadaEm, fuso)}
        </time>

        {temAcoes && (
          <AcoesDaMensagem
            mensagemId={mensagem.id}
            autorNome={autorNome}
            resumo={mensagem.corpo.slice(0, 200)}
            corpo={mensagem.corpo}
            possoEditar={mensagem.possoEditar}
            possoApagar={mensagem.possoApagar}
            moderando={moderador && !mensagem.souEuQuemEscreveu}
            hrefResponder={`${caminho}?responder=${mensagem.id}`}
          />
        )}
      </div>
    </>
  );
}
