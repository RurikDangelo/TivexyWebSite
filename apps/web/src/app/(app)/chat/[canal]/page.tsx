import { can, todayIn } from '@tivexy/core';
import { Hash, Lock } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { requireAccess } from '@/lib/auth/require';
import type { TrechoCitado } from '@/lib/chat/model';
import { lerCanal, lerConversa, lerParticipantes } from '@/lib/chat/read';
import { isUuid } from '@/lib/ids';
import { tenantMembers } from '@/lib/members';
import { tenantTimeZone } from '@/lib/settings/current';

import { MenuDoCanal } from './channel-menu';
import { Composer } from './composer';
import { Conversa } from './conversation';
import { MarcarComoLido } from './mark-read';

export const metadata: Metadata = { title: 'Canal do chat' };

/**
 * Um canal do chat interno: cabeçalho, conversa e campo de escrever.
 *
 * ## Por que "responder" mora no endereço
 *
 * `?responder=<id>` em vez de estado de cliente. A conversa é Server
 * Component; o campo de escrever é cliente. Compartilhar estado entre os dois
 * exigiria subir a conversa inteira para o navegador — oitenta mensagens,
 * cada ação virando `'use client'` — para guardar um id. No endereço, a
 * escolha sobrevive a recarregar, cabe num link e não custa um byte de
 * JavaScript.
 *
 * ## Por que o canal inexistente é 404, e não "sem permissão"
 *
 * `chat_channel_visible()` responde igual para "não existe" e para "existe e é
 * restrito e não é seu". Dizer "sem permissão" aqui confirmaria a existência
 * de um canal privado para quem só chutou o endereço — é a mesma discrição que
 * `requireAccess` pratica com tenant alheio.
 */
export default async function CanalPage({ params, searchParams }: PageProps<'/chat/[canal]'>) {
  const { choice, viewer } = await requireAccess('/chat');
  if (choice.kind !== 'resolved' || viewer.userId === null) return null;

  const { canal: canalId } = await params;
  if (!isUuid(canalId)) notFound();

  const fuso = await tenantTimeZone();
  const canal = await lerCanal(choice.tenant.id, canalId, viewer.userId);
  if (canal === null) notFound();

  /* Um relógio só para a tela inteira: ver `lerConversa`. */
  const agora = new Date();
  const moderador = can(viewer, 'core.users.write');

  const [conversa, participantes, equipe, parametros] = await Promise.all([
    lerConversa(choice.tenant.id, canal, { userId: viewer.userId, moderador }, agora),
    lerParticipantes(choice.tenant.id, canal.id, viewer.userId),
    tenantMembers(choice.tenant.id),
    searchParams,
  ]);

  const dentro = new Set(participantes.map((p) => p.userId));
  const candidatos = equipe.filter((pessoa) => !dentro.has(pessoa.userId));

  /*
   * Só se responde ao que está na tela. Um id fora da janela carregada viraria
   * uma citação vazia acima do campo — e uma promessa de contexto que a
   * conversa não mostra.
   */
  const pedido = typeof parametros.responder === 'string' ? parametros.responder : null;
  const alvo = pedido === null ? undefined : conversa.mensagens.find((m) => m.id === pedido);
  const respondendo: TrechoCitado | null =
    alvo === undefined || alvo.apagadaEm !== null
      ? null
      : {
          id: alvo.id,
          autorNome: alvo.autorNome,
          trecho: alvo.corpo.slice(0, 140),
          apagada: false,
        };

  const caminho = `/chat/${canal.id}`;
  const podeEditar = moderador || canal.criadoPor === viewer.userId;
  const Simbolo = canal.restrito ? Lock : Hash;

  return (
    <>
      <header className="flex shrink-0 items-start gap-3 border-b border-line-subtle px-4 py-3">
        <Simbolo className="mt-1 size-4 shrink-0 text-content-subtle" aria-hidden />

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-2">
            {/* `h2` porque o `h1` da tela é o "Chat da equipe" do PageHeader. */}
            <h2 className="text-h2 break-words text-content">{canal.nome}</h2>

            {/*
             * Selo com a palavra, e a explicação em texto visível ao lado —
             * não em `<Tooltip>`. Um selo é um `<span>`, que não recebe foco:
             * a dica só chegaria a quem usa ponteiro, e a informação aqui é
             * "quem lê o que eu escrever", que ninguém pode perder.
             */}
            {canal.restrito ? (
              <Badge tone="warning" tamanho="xs" Icone={Lock}>
                Restrito
              </Badge>
            ) : (
              <Badge tone="neutral" tamanho="xs" Icone={null}>
                Aberto à empresa
              </Badge>
            )}

            <span className="text-caption text-content-subtle">
              {canal.restrito
                ? 'só quem participa lê'
                : 'toda pessoa ativa desta empresa lê e escreve'}{' '}
              ·{' '}
              {participantes.length === 1
                ? '1 participante'
                : `${participantes.length} participantes`}
            </span>
          </div>

          {canal.descricao !== null && (
            <p className="text-caption break-words text-pretty text-content-muted">
              {canal.descricao}
            </p>
          )}
        </div>

        <MenuDoCanal
          canal={canal}
          participantes={participantes}
          candidatos={candidatos}
          podeEditar={podeEditar}
          moderador={moderador}
        />
      </header>

      <Conversa
        conversa={conversa}
        fuso={fuso}
        hoje={todayIn(fuso, agora)}
        agora={agora}
        caminho={caminho}
        moderador={moderador}
        canalNome={canal.nome}
      />

      <Composer
        canalId={canal.id}
        canalNome={canal.nome}
        respondendo={respondendo}
        hrefSemResposta={caminho}
      />

      {/*
       * Depois da conversa no documento, de propósito: o marcador só anda
       * quando o que ele marca chegou a ser renderizado.
       */}
      <MarcarComoLido
        canalId={canal.id}
        ateMensagem={conversa.mensagens[conversa.mensagens.length - 1]?.id ?? null}
      />
    </>
  );
}
