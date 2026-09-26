'use client';

import { CHAT_MESSAGE_MAX_LENGTH } from '@tivexy/core';
import { CornerUpLeft, SendHorizontal, X } from 'lucide-react';
import Link from 'next/link';
import { useActionState, useEffect, useId, useRef, useState } from 'react';

import { FormError } from '@/components/form/messages';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { enviarMensagem } from '@/lib/chat/actions';
import type { TrechoCitado } from '@/lib/chat/model';
import { MENSAGEM_INICIAL } from '@/lib/chat/state';

/**
 * O campo de escrever.
 *
 * ## O texto não se perde
 *
 * Quem guarda o que foi digitado é o `useState` daqui, e ele só é zerado
 * quando a `rodada` do servidor avança — isto é, quando a mensagem entrou de
 * verdade. Erro de rede, recusa do banco, sessão vencida: em todos, o texto
 * continua no campo, e a pessoa tenta de novo em vez de reescrever. É por isso
 * que o estado da ação não carrega o corpo: se carregasse, a resposta do
 * servidor reescreveria por cima do que ela digitou enquanto esperava.
 *
 * ## Enter envia
 *
 * E está escrito embaixo do campo, não só programado. Enter sem modificador
 * envia; Shift+Enter quebra linha. Durante a composição por IME (acentuação em
 * teclado internacional, teclado de celular com sugestão) o Enter confirma a
 * palavra e não pode enviar — daí a checagem de `isComposing`, sem a qual
 * escrever "não" manda a mensagem no meio.
 */

export interface ComposerProps {
  canalId: string;
  /** Nome do canal, para o rótulo do campo dizer para onde a fala vai. */
  canalNome: string;
  /** A mensagem sendo respondida, vinda de `?responder=`. */
  respondendo: TrechoCitado | null;
  /** O endereço sem o `?responder=`, para o X da citação. */
  hrefSemResposta: string;
}

export function Composer({ canalId, canalNome, respondendo, hrefSemResposta }: ComposerProps) {
  const [estado, acao] = useActionState(enviarMensagem, MENSAGEM_INICIAL);
  const [texto, setTexto] = useState('');
  const campo = useRef<HTMLTextAreaElement>(null);
  const formulario = useRef<HTMLFormElement>(null);
  const idDaAjuda = useId();
  const idDoCampo = useId();

  /*
   * A rodada avançando é o único sinal de que ESTA mensagem entrou. Aí, e só
   * aí, o campo esvazia e o foco volta para ele — quem acabou de mandar quase
   * sempre vai mandar outra, e procurar o campo com o mouse a cada linha é o
   * que faz um chat parecer um formulário.
   */
  const rodadaVista = useRef(estado.rodada);
  useEffect(() => {
    if (estado.rodada === rodadaVista.current) return;
    rodadaVista.current = estado.rodada;
    setTexto('');
    campo.current?.focus();
  }, [estado.rodada]);

  /* Escolher "responder" numa mensagem tem de deixar o cursor pronto para digitar. */
  useEffect(() => {
    if (respondendo !== null) campo.current?.focus();
  }, [respondendo]);

  const vazio = texto.trim() === '';
  const restantes = CHAT_MESSAGE_MAX_LENGTH - texto.length;
  /* O contador só aparece perto do limite: sempre visível, ele vira ruído. */
  const mostrarContador = restantes <= 300;

  return (
    <div className="shrink-0 border-t border-line-subtle bg-surface-panel p-3">
      {respondendo !== null && (
        <div className="mb-2 flex items-start gap-2 rounded-control border border-line-subtle bg-surface-sunken px-3 py-2">
          <CornerUpLeft className="mt-0.5 size-3.5 shrink-0 text-content-subtle" aria-hidden />
          <p className="min-w-0 flex-1 text-caption text-content-muted">
            <span className="text-content-default">
              Respondendo {respondendo.autorNome ?? 'alguém que saiu da equipe'}
            </span>
            <span className="block truncate">
              {respondendo.apagada ? 'mensagem apagada' : respondendo.trecho}
            </span>
          </p>
          <Link
            href={hrefSemResposta}
            scroll={false}
            aria-label="Cancelar a resposta e escrever uma mensagem nova"
            className="grid size-6 shrink-0 place-items-center rounded-control text-content-subtle transition-base hover:bg-surface-muted hover:text-content focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <X className="size-3.5" aria-hidden />
          </Link>
        </div>
      )}

      {estado.erro !== null && (
        /*
         * O erro fica ACIMA do campo, e o campo continua preenchido logo
         * abaixo: as duas coisas na mesma olhada, para que a mensagem "não
         * enviou" não seja lida como "sumiu".
         */
        <FormError className="mb-2">{estado.erro}</FormError>
      )}

      <form ref={formulario} action={acao} className="flex items-end gap-2">
        <input type="hidden" name="canal" value={canalId} />
        {respondendo !== null && <input type="hidden" name="responde_a" value={respondendo.id} />}

        <label htmlFor={idDoCampo} className="sr-only">
          Escrever no canal {canalNome}
        </label>
        <Textarea
          id={idDoCampo}
          ref={campo}
          name="corpo"
          rows={2}
          value={texto}
          maxLength={CHAT_MESSAGE_MAX_LENGTH}
          onChange={(evento) => setTexto(evento.target.value)}
          onKeyDown={(evento) => {
            if (evento.key !== 'Enter') return;
            if (evento.shiftKey || evento.altKey || evento.ctrlKey || evento.metaKey) return;
            /* IME aberto: o Enter está confirmando a palavra, não enviando. */
            if (evento.nativeEvent.isComposing) return;
            evento.preventDefault();
            if (texto.trim() === '') return;
            formulario.current?.requestSubmit();
          }}
          aria-describedby={idDaAjuda}
          placeholder={`Escrever em ${canalNome}…`}
          className="min-h-20 resize-y"
        />

        {/*
         * Um botão de enviar de verdade, além do Enter: o atalho é para quem o
         * conhece, e num toque de celular não existe Enter que envie sem
         * quebrar linha em metade dos teclados.
         */}
        <Button type="submit" size="icon" disabled={vazio} aria-label="Enviar mensagem">
          <SendHorizontal aria-hidden />
        </Button>
      </form>

      <p
        id={idDaAjuda}
        className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-caption text-content-subtle"
      >
        <span>
          <kbd className="rounded border border-line-subtle bg-surface-sunken px-1 font-mono text-micro">
            Enter
          </kbd>{' '}
          envia ·{' '}
          <kbd className="rounded border border-line-subtle bg-surface-sunken px-1 font-mono text-micro">
            Shift
          </kbd>
          +
          <kbd className="rounded border border-line-subtle bg-surface-sunken px-1 font-mono text-micro">
            Enter
          </kbd>{' '}
          quebra linha. Mensagem interna — não vai para cliente nenhum.
        </span>
        {mostrarContador && (
          <span
            /* `polite` e não `assertive`: o contador não pode atropelar a digitação. */
            aria-live="polite"
            className={restantes < 0 ? 'text-danger' : undefined}
          >
            {restantes.toLocaleString('pt-BR')} caracteres restantes
          </span>
        )}
      </p>
    </div>
  );
}
