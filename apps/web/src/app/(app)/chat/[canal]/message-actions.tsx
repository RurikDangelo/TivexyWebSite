'use client';

import { CHAT_EDIT_WINDOW_MINUTES, CHAT_MESSAGE_MAX_LENGTH } from '@tivexy/core';
import { CornerUpLeft, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useActionState, useEffect, useRef, useState } from 'react';

import { FormError } from '@/components/form/messages';
import { Submit } from '@/components/form/submit';
import { Button } from '@/components/ui/button';
import { AlertDialog, Dialog } from '@/components/ui/dialog';
import { DropdownItem, DropdownMenu, DropdownSeparator } from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { apagarMensagem, editarMensagem } from '@/lib/chat/actions';
import { ACAO_INICIAL, MENSAGEM_INICIAL } from '@/lib/chat/state';

/**
 * O que se pode fazer com uma mensagem: responder, editar, apagar.
 *
 * Quem decide o que aparece é o servidor — `possoEditar` e `possoApagar` vêm
 * de `editBlock()`/`canDeleteMessage()` do Core, as mesmas regras que
 * `chat_edit_message` e `chat_delete_message` aplicam no banco. Este
 * componente não recalcula nada: recalcular no cliente, com o relógio do
 * cliente, é como um botão aparece aos 15min01s e o banco recusa.
 *
 * Mesmo assim o erro do banco chega escrito na tela. Entre abrir este menu e
 * clicar em salvar cabem os quinze minutos da janela, e "salvou mas não
 * salvou" é pior que "a janela passou".
 */

export interface AcoesDaMensagemProps {
  mensagemId: string;
  /** Autor e primeiras palavras, para o diálogo dizer o que está prestes a sumir. */
  resumo: string;
  autorNome: string;
  corpo: string;
  possoEditar: boolean;
  possoApagar: boolean;
  /** `true` quando quem apaga não é quem escreveu — o banco audita esse caso. */
  moderando: boolean;
  /** `?responder=<id>` a partir do endereço atual. */
  hrefResponder: string;
}

export function AcoesDaMensagem({
  mensagemId,
  resumo,
  autorNome,
  corpo,
  possoEditar,
  possoApagar,
  moderando,
  hrefResponder,
}: AcoesDaMensagemProps) {
  const [editando, setEditando] = useState(false);
  const [apagando, setApagando] = useState(false);
  const [apagar, acaoDeApagar] = useActionState(apagarMensagem, ACAO_INICIAL);
  const { mostrar } = useToast();

  /* O retorno de apagar é um toast: a linha some do lugar onde a faixa ficaria. */
  const apagarVisto = useRef(apagar);
  useEffect(() => {
    if (apagar === apagarVisto.current) return;
    apagarVisto.current = apagar;
    if (apagar.erro !== null) mostrar({ tom: 'erro', titulo: apagar.erro });
    else if (apagar.ok !== null) mostrar({ tom: 'sucesso', titulo: apagar.ok });
  }, [apagar, mostrar]);

  return (
    <>
      <DropdownMenu
        alinhamento="fim"
        rotulo={`Ações da mensagem de ${autorNome}`}
        gatilho={
          <>
            <MoreHorizontal aria-hidden />
            <span className="sr-only">Ações da mensagem de {autorNome}</span>
          </>
        }
        /*
         * O gatilho só aparece no hover do grupo ou quando ele mesmo tem foco.
         * `focus-within` é o que mantém o menu alcançável por teclado — sem
         * ele, tabular até um botão invisível é tabular para o nada.
         */
        classNameGatilho="grid size-7 place-items-center rounded-control text-content-subtle opacity-0 transition-base group-hover/mensagem:opacity-100 focus-visible:opacity-100 hover:bg-surface-muted hover:text-content [&_svg]:size-4"
      >
        <DropdownItem href={hrefResponder} Icone={CornerUpLeft}>
          Responder
        </DropdownItem>

        {possoEditar && (
          <DropdownItem onSelect={() => setEditando(true)} Icone={Pencil}>
            Editar
          </DropdownItem>
        )}

        {possoApagar && (
          <>
            <DropdownSeparator />
            <DropdownItem onSelect={() => setApagando(true)} Icone={Trash2} destrutivo>
              Apagar
            </DropdownItem>
          </>
        )}
      </DropdownMenu>

      {possoEditar && (
        <DialogoDeEdicao
          aberto={editando}
          aoFechar={() => setEditando(false)}
          mensagemId={mensagemId}
          corpo={corpo}
        />
      )}

      {possoApagar && (
        <AlertDialog
          aberto={apagando}
          aoFechar={() => setApagando(false)}
          severidade="danger"
          titulo="Apagar esta mensagem?"
          descricao={
            moderando
              ? `A mensagem é de ${autorNome}. Apagar mensagem de outra pessoa fica registrado na auditoria da empresa, com o seu nome.`
              : 'O texto é apagado de verdade — nem você consegue lê-lo depois.'
          }
          confirmarRotulo="Apagar"
          confirmarAction={acaoDeApagar}
        >
          <input type="hidden" name="mensagem" value={mensagemId} />
          <div className="flex flex-col gap-2">
            <p className="rounded-control border border-line-subtle bg-surface-sunken px-3 py-2 text-caption text-content-muted">
              {resumo}
            </p>
            {/*
             * A regra do esquema, dita antes: a linha fica. É o oposto do que
             * a palavra "apagar" costuma prometer, e esconder isso faria
             * alguém apagar achando que some da conversa.
             */}
            <p className="text-caption text-content-muted">
              No lugar dela fica “mensagem apagada”. A linha não some porque as respostas seguintes
              apontam para ela — sumir deixaria a conversa sem pé nem cabeça.
            </p>
          </div>
        </AlertDialog>
      )}
    </>
  );
}

function DialogoDeEdicao({
  aberto,
  aoFechar,
  mensagemId,
  corpo,
}: {
  aberto: boolean;
  aoFechar: () => void;
  mensagemId: string;
  corpo: string;
}) {
  const [estado, acao] = useActionState(editarMensagem, MENSAGEM_INICIAL);
  const [texto, setTexto] = useState(corpo);
  const { mostrar } = useToast();

  /* Reabrir depois de um cancelamento tem de trazer o texto publicado, não o rascunho abandonado. */
  const [abertoAnterior, setAbertoAnterior] = useState(aberto);
  if (aberto !== abertoAnterior) {
    setAbertoAnterior(aberto);
    setTexto(corpo);
  }

  const rodadaVista = useRef(estado.rodada);
  useEffect(() => {
    if (estado.rodada === rodadaVista.current) return;
    rodadaVista.current = estado.rodada;
    mostrar({ tom: 'sucesso', titulo: estado.ok ?? 'Mensagem editada.' });
    aoFechar();
  }, [estado, mostrar, aoFechar]);

  return (
    <Dialog
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Editar mensagem"
      descricao={`Dá para corrigir a própria mensagem até ${CHAT_EDIT_WINDOW_MINUTES} minutos depois de enviá-la. Quem já leu não é avisado da mudança — a conversa passa a mostrar “editada”.`}
    >
      <form action={acao} className="flex flex-col gap-3">
        <input type="hidden" name="mensagem" value={mensagemId} />
        {estado.erro !== null && <FormError>{estado.erro}</FormError>}

        <label htmlFor={`editar-${mensagemId}`} className="sr-only">
          Texto da mensagem
        </label>
        <Textarea
          id={`editar-${mensagemId}`}
          name="corpo"
          rows={4}
          required
          maxLength={CHAT_MESSAGE_MAX_LENGTH}
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
          autoFocus
        />

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line-subtle pt-3">
          <Button type="button" variant="outline" onClick={aoFechar}>
            Cancelar
          </Button>
          <Submit pendente="Salvando…" disabled={texto.trim() === ''}>
            Salvar
          </Submit>
        </div>
      </form>
    </Dialog>
  );
}
