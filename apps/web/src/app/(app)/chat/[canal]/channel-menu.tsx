'use client';

import { DoorOpen, LogIn, MoreHorizontal, Pencil, UserMinus, UserPlus, Users } from 'lucide-react';
import { useActionState, useEffect, useRef, useState } from 'react';

import { Field, describedBy } from '@/components/form/field';
import { FormError, FormFeedback } from '@/components/form/messages';
import { Submit } from '@/components/form/submit';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertDialog, Dialog } from '@/components/ui/dialog';
import { DropdownItem, DropdownMenu, DropdownSeparator } from '@/components/ui/dropdown-menu';
import { Input, Select, Textarea } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import {
  adicionarParticipante,
  editarCanal,
  entrarNoCanal,
  removerParticipante,
  sairDoCanal,
} from '@/lib/chat/actions';
import type { CanalAberto, ParticipanteDoCanal } from '@/lib/chat/model';
import { ACAO_INICIAL, CANAL_INICIAL } from '@/lib/chat/state';
import type { Member } from '@/lib/members';

/**
 * O menu do canal: editar o cadastro, ver quem participa, entrar e sair.
 *
 * ## O que "sair" significa, e por que depende do tipo de canal
 *
 * São duas coisas diferentes com o mesmo nome, e a tela **não** pode fingir
 * que são uma só:
 *
 *   * **restrito** — sair devolve o acesso. Depois disso o canal some da
 *     lista, o histórico fica fora de alcance, e voltar depende de outra
 *     pessoa adicionar. O banco ainda recusa a saída do último participante:
 *     um canal restrito sem ninguém é invisível para a empresa inteira e não
 *     tem volta;
 *   * **público** — sair não tira acesso nenhum: o canal continua lá, porque
 *     é da empresa. O que sai é o marcador de leitura, então tudo volta a
 *     contar como não lido. Abrir o canal de novo recria o marcador.
 *
 * A confirmação escreve exatamente isso, em vez de um "tem certeza?" que
 * serviria para os dois e não explicaria nenhum.
 */

export interface MenuDoCanalProps {
  canal: CanalAberto;
  participantes: readonly ParticipanteDoCanal[];
  /** Pessoas ativas da empresa que ainda não estão no canal. */
  candidatos: readonly Member[];
  /** Criador ou moderador — é quem `chat_update_channel` deixa renomear. */
  podeEditar: boolean;
  /** `core.users.write`: quem `chat_remove_member` deixa tirar os outros. */
  moderador: boolean;
}

export function MenuDoCanal({
  canal,
  participantes,
  candidatos,
  podeEditar,
  moderador,
}: MenuDoCanalProps) {
  const [editando, setEditando] = useState(false);
  const [vendoParticipantes, setVendoParticipantes] = useState(false);
  const [saindo, setSaindo] = useState(false);

  const [entrada, acaoDeEntrar] = useActionState(entrarNoCanal, ACAO_INICIAL);
  const [saida, acaoDeSair] = useActionState(sairDoCanal, ACAO_INICIAL);
  const { mostrar } = useToast();

  useRetorno(entrada, mostrar);
  useRetorno(saida, mostrar);

  return (
    <>
      <DropdownMenu
        alinhamento="fim"
        rotulo={`Ações do canal ${canal.nome}`}
        gatilho={
          <>
            <MoreHorizontal aria-hidden />
            <span className="sr-only">Ações do canal {canal.nome}</span>
          </>
        }
        classNameGatilho="grid size-8 place-items-center rounded-control text-content-muted transition-base hover:bg-surface-muted hover:text-content [&_svg]:size-4"
      >
        <DropdownItem onSelect={() => setVendoParticipantes(true)} Icone={Users}>
          Quem participa ({participantes.length})
        </DropdownItem>

        {podeEditar && (
          <DropdownItem onSelect={() => setEditando(true)} Icone={Pencil}>
            Editar canal
          </DropdownItem>
        )}

        <DropdownSeparator />

        {canal.participo ? (
          <DropdownItem
            onSelect={() => setSaindo(true)}
            Icone={DoorOpen}
            destrutivo={canal.restrito}
          >
            Sair do canal
          </DropdownItem>
        ) : (
          /*
           * "Entrar" só existe em canal que a pessoa alcança e no qual ainda
           * não tem linha — na prática, um canal público que ela nunca abriu.
           * Em canal restrito, quem não participa não enxerga o canal, então
           * este item nunca chega a ser desenhado lá.
           */
          <form action={acaoDeEntrar}>
            <input type="hidden" name="canal" value={canal.id} />
            <DropdownItem type="submit" Icone={LogIn}>
              Entrar no canal
            </DropdownItem>
          </form>
        )}
      </DropdownMenu>

      {podeEditar && (
        <DialogoDeEdicao aberto={editando} aoFechar={() => setEditando(false)} canal={canal} />
      )}

      <DialogoDeParticipantes
        aberto={vendoParticipantes}
        aoFechar={() => setVendoParticipantes(false)}
        canal={canal}
        participantes={participantes}
        candidatos={candidatos}
        moderador={moderador}
      />

      <AlertDialog
        aberto={saindo}
        aoFechar={() => setSaindo(false)}
        severidade={canal.restrito ? 'danger' : 'warning'}
        titulo={canal.restrito ? `Sair de ${canal.nome}?` : `Parar de acompanhar ${canal.nome}?`}
        descricao={
          canal.restrito
            ? 'Este canal é restrito: sair devolve o acesso. O histórico deixa de aparecer para você, e só volta se alguém que ficou adicionar você de novo.'
            : 'Este canal é público e continuará na sua lista — ele é da empresa. O que sai é o seu marcador de leitura: tudo volta a contar como não lido, e abrir o canal de novo recria o marcador.'
        }
        confirmarRotulo={canal.restrito ? 'Sair do canal' : 'Parar de acompanhar'}
        confirmarAction={acaoDeSair}
        exigirTexto={canal.restrito ? canal.nome : undefined}
      >
        <input type="hidden" name="canal" value={canal.id} />
        <input type="hidden" name="restrito" value={canal.restrito ? 'sim' : 'nao'} />
      </AlertDialog>
    </>
  );
}

/** Todo retorno de ação do menu vira toast: não há onde pôr uma faixa num menu. */
function useRetorno(
  estado: { erro: string | null; ok: string | null },
  mostrar: ReturnType<typeof useToast>['mostrar'],
) {
  const visto = useRef(estado);
  useEffect(() => {
    if (estado === visto.current) return;
    visto.current = estado;
    if (estado.erro !== null) mostrar({ tom: 'erro', titulo: estado.erro });
    else if (estado.ok !== null) mostrar({ tom: 'sucesso', titulo: estado.ok });
  }, [estado, mostrar]);
}

function DialogoDeEdicao({
  aberto,
  aoFechar,
  canal,
}: {
  aberto: boolean;
  aoFechar: () => void;
  canal: CanalAberto;
}) {
  const [estado, acao] = useActionState(editarCanal, CANAL_INICIAL);
  const { mostrar } = useToast();

  const rodadaVista = useRef(estado.rodada);
  useEffect(() => {
    if (estado.rodada === rodadaVista.current) return;
    rodadaVista.current = estado.rodada;
    mostrar({ tom: 'sucesso', titulo: estado.ok ?? 'Canal atualizado.' });
    aoFechar();
  }, [estado, mostrar, aoFechar]);

  const dicaDoNome = 'Dois canais com o mesmo nome não existem nesta empresa.';

  return (
    <Dialog aberto={aberto} aoFechar={aoFechar} titulo={`Editar ${canal.nome}`}>
      <form action={acao} className="flex flex-col gap-3">
        <input type="hidden" name="canal" value={canal.id} />
        {estado.erro !== null && <FormError>{estado.erro}</FormError>}

        <Field nome="nome" rotulo="Nome do canal" obrigatorio escopo="canal" dica={dicaDoNome}>
          <Input
            id="canal-nome"
            name="nome"
            required
            maxLength={80}
            defaultValue={canal.nome}
            autoComplete="off"
            aria-describedby={describedBy('nome', undefined, dicaDoNome, 'canal')}
          />
        </Field>

        <Field nome="descricao" rotulo="Do que se fala aqui" escopo="canal">
          <Textarea
            id="canal-descricao"
            name="descricao"
            rows={2}
            maxLength={280}
            defaultValue={canal.descricao ?? ''}
          />
        </Field>

        {/*
         * O modo não está no formulário porque o banco não o aceita: trocar
         * `is_private` reescreveria quem viu o quê. Dizer isso é melhor que um
         * campo desabilitado sem explicação.
         */}
        <p className="rounded-control border border-line-subtle bg-surface-sunken px-3 py-2 text-caption text-content-muted">
          {canal.restrito
            ? 'Canal restrito não vira público: o histórico foi escrito na expectativa de não ser lido por todos.'
            : 'Canal público não vira restrito: esconder o que a empresa inteira já leu não esconde nada.'}{' '}
          Quem precisa do outro modo cria outro canal — e fica evidente que é outro lugar.
        </p>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line-subtle pt-3">
          <Button type="button" variant="outline" onClick={aoFechar}>
            Cancelar
          </Button>
          <Submit pendente="Salvando…">Salvar</Submit>
        </div>
      </form>
    </Dialog>
  );
}

function DialogoDeParticipantes({
  aberto,
  aoFechar,
  canal,
  participantes,
  candidatos,
  moderador,
}: {
  aberto: boolean;
  aoFechar: () => void;
  canal: CanalAberto;
  participantes: readonly ParticipanteDoCanal[];
  candidatos: readonly Member[];
  moderador: boolean;
}) {
  const [adicionar, acaoDeAdicionar] = useActionState(adicionarParticipante, ACAO_INICIAL);
  const [remover, acaoDeRemover] = useActionState(removerParticipante, ACAO_INICIAL);

  return (
    <Dialog
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={`Quem participa de ${canal.nome}`}
      descricao={
        canal.restrito
          ? 'Canal restrito: esta lista é a lista de acesso. Quem não está nela não enxerga o canal nem o histórico.'
          : 'Canal público: toda pessoa ativa da empresa lê e escreve aqui. Esta lista é só de quem já abriu o canal alguma vez — ela não restringe ninguém.'
      }
      tamanho="lg"
    >
      <div className="flex flex-col gap-4">
        <FormFeedback estado={adicionar} />
        <FormFeedback estado={remover} />

        <ul className="flex flex-col divide-y divide-line-subtle rounded-card border border-line-subtle">
          {participantes.length === 0 && (
            <li className="px-3 py-4 text-caption text-content-muted">
              Ninguém abriu este canal ainda.
            </li>
          )}

          {participantes.map((pessoa) => (
            <li key={pessoa.userId} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-body text-content">{pessoa.nome}</span>
                {pessoa.souEu && (
                  <Badge tone="neutral" tamanho="xs">
                    você
                  </Badge>
                )}
              </span>

              {moderador && !pessoa.souEu && (
                <form action={acaoDeRemover}>
                  <input type="hidden" name="canal" value={canal.id} />
                  <input type="hidden" name="pessoa" value={pessoa.userId} />
                  <Submit
                    variant="ghost"
                    size="sm"
                    pendente="Removendo…"
                    aria-label={`Remover ${pessoa.nome} do canal`}
                  >
                    <UserMinus aria-hidden />
                    Remover
                  </Submit>
                </form>
              )}
            </li>
          ))}
        </ul>

        {canal.restrito ? (
          candidatos.length === 0 ? (
            <p className="text-caption text-content-muted">
              Todas as pessoas ativas da empresa já estão neste canal.
            </p>
          ) : (
            <form action={acaoDeAdicionar} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="canal" value={canal.id} />
              <Field
                nome="pessoa"
                rotulo="Adicionar ao canal"
                escopo="participantes"
                className="min-w-48 flex-1"
                dica="Dá acesso ao histórico inteiro — e fica registrado na auditoria da empresa."
              >
                <Select
                  id="participantes-pessoa"
                  name="pessoa"
                  required
                  defaultValue=""
                  aria-describedby={describedBy(
                    'pessoa',
                    undefined,
                    'Dá acesso ao histórico inteiro — e fica registrado na auditoria da empresa.',
                    'participantes',
                  )}
                >
                  <option value="" disabled>
                    Escolha alguém da equipe
                  </option>
                  {candidatos.map((pessoa) => (
                    <option key={pessoa.userId} value={pessoa.userId}>
                      {pessoa.nome}
                    </option>
                  ))}
                </Select>
              </Field>
              <Submit variant="outline" pendente="Adicionando…">
                <UserPlus aria-hidden />
                Adicionar
              </Submit>
            </form>
          )
        ) : (
          <p className="text-caption text-content-muted">
            Não há quem adicionar num canal público: a empresa inteira já alcança este canal. A
            lista acima cresce sozinha conforme as pessoas abrem a conversa.
          </p>
        )}
      </div>
    </Dialog>
  );
}
