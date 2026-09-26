'use client';

import { Plus } from 'lucide-react';
import { useActionState, useCallback, useMemo, useRef, useState } from 'react';

import { Field, describedBy, idDoCampo, useEscopo } from '@/components/form/field';
import { FormError, FormSuccess, FormWarning } from '@/components/form/messages';
import { Submit } from '@/components/form/submit';
import { Button } from '@/components/ui/button';
import { Combobox, type OpcaoDoCombobox } from '@/components/ui/combobox';
import { Dialog } from '@/components/ui/dialog';
import { Input, Select, Textarea } from '@/components/ui/input';
import type { TipoDeAlvo } from '@/lib/crm/activity-input';

import { criarAtividade } from './actions';
import { ATIVIDADE_INICIAL, type AtividadeFormState, type Opcao, type OpcoesDeAlvo } from './state';

/**
 * Quantas opções a lista do "Sobre" mostra de uma vez.
 *
 * Não é o teto da consulta — esse é do servidor e chega em `alvosTruncados`. É
 * quanto cabe numa lista rolável sem virar rolagem infinita; o que sobra é
 * anunciado como linha desabilitada, nunca omitido em silêncio.
 */
const OPCOES_VISIVEIS = 40;

/** Chave da linha "e mais N": existe para ser contada, não para ser escolhida. */
const CHAVE_DO_RESTO = '__resto__';

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

interface Props {
  singular: string;
  tipos: readonly Opcao[];
  membros: readonly Opcao[];
  /** Hoje no fuso do tenant: o dia sugerido. */
  hoje: string;
  /**
   * Na agenda, o campo "Sobre" oferece tudo. Na página de uma pessoa, o alvo já
   * é ela — e o campo vira um texto, não uma escolha.
   */
  alvos?: OpcoesDeAlvo;
  rotulosDosAlvos?: Readonly<Record<TipoDeAlvo, string>>;
  /**
   * Os tipos de alvo cuja lista bateu no teto da consulta do servidor.
   *
   * Sem este aviso, a partir do registro 201 a empresa certa simplesmente não
   * está na lista e o formulário salva com o vínculo errado sem dizer nada.
   */
  alvosTruncados?: readonly TipoDeAlvo[];
  alvoFixo?: { valor: string; nome: string };
  /** A ação primária da tela é uma só (seção 7): dentro de um cartão, esta não é. */
  variante?: 'brand' | 'outline';
}

/**
 * Agendar uma atividade, num diálogo.
 *
 * Era um bloco recolhido que, ao abrir, empurrava a agenda inteira para baixo —
 * quem agenda perde de vista exatamente o que estava consultando. No `<dialog>`
 * nativo o foco fica preso, Escape fecha e o foco volta ao gatilho de graça.
 *
 * O diálogo NÃO fecha ao salvar: agendar várias seguidas é o gesto real desta
 * tela, e o formulário volta limpo com o foco no primeiro campo. A confirmação
 * fica dentro dele, onde o olho já está.
 *
 * Os ids dos campos são escopados (`useEscopo`): em `/crm/contatos/[id]` este
 * formulário divide a página com o de edição do contato, e os dois geravam
 * `id="notas"` e `id="responsavel"` — clicar no rótulo de um focava o campo do
 * outro.
 */
export function NewActivityForm(props: Props) {
  const [aberto, setAberto] = useState(false);
  const escopo = useEscopo();
  const formulario = useRef<HTMLFormElement>(null);
  const primeiro = useRef<HTMLInputElement>(null);
  /* O Combobox é controlado: `form.reset()` não o alcança, e limpá-lo é daqui. */
  const [alvo, setAlvo] = useState<OpcaoDoCombobox | null>(null);

  /*
   * A limpeza mora dentro da ação, não num `useEffect` que observa
   * `estado.salvo`. Duas razões: o efeito dispararia de novo se duas atividades
   * de mesmo assunto fossem salvas em sequência com um render no meio, e
   * `setState` dentro de efeito encadeia renders. Aqui ela acontece uma vez por
   * envio bem-sucedido, que é exatamente o gatilho real.
   */
  const [estado, acao] = useActionState(
    async (anterior: AtividadeFormState, dados: FormData): Promise<AtividadeFormState> => {
      const proximo = await criarAtividade(anterior, dados);
      if (proximo.salvo !== null) {
        formulario.current?.reset();
        setAlvo(null);
        primeiro.current?.focus();
      }
      return proximo;
    },
    ATIVIDADE_INICIAL,
  );
  const e = estado.campos;

  const opcoesDoAlvo = useMemo<readonly OpcaoDoCombobox[]>(() => {
    if (props.alvos === undefined) return [];
    return (Object.entries(props.alvos) as [TipoDeAlvo, readonly Opcao[]][]).flatMap(
      ([tipo, opcoes]) =>
        opcoes.map((o) => ({
          valor: `${tipo}:${o.id}`,
          rotulo: o.nome,
          /* O tipo à direita substitui o `<optgroup>`: numa lista filtrada por texto não há grupo contíguo para agrupar. */
          detalhe: props.rotulosDosAlvos?.[tipo] ?? tipo,
        })),
    );
  }, [props.alvos, props.rotulosDosAlvos]);

  const buscar = useCallback(
    (texto: string): readonly OpcaoDoCombobox[] => {
      const termo = normalizar(texto.trim());
      const achados =
        termo === ''
          ? opcoesDoAlvo
          : opcoesDoAlvo.filter((o) => normalizar(o.rotulo).includes(termo));

      if (achados.length <= OPCOES_VISIVEIS) return achados;
      const resto = achados.length - OPCOES_VISIVEIS;
      return [
        ...achados.slice(0, OPCOES_VISIVEIS),
        {
          valor: CHAVE_DO_RESTO,
          rotulo: `e mais ${resto} — escreva mais para filtrar`,
          desabilitado: true,
        },
      ];
    },
    [opcoesDoAlvo],
  );

  const truncados = props.alvosTruncados ?? [];
  const nomesTruncados = truncados
    .map((tipo) => (props.rotulosDosAlvos?.[tipo] ?? tipo).toLocaleLowerCase('pt-BR'))
    .join(', ');

  return (
    <>
      <Button variant={props.variante ?? 'brand'} onClick={() => setAberto(true)}>
        <Plus aria-hidden />
        Agendar {props.singular}
      </Button>

      <Dialog
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        titulo={`Agendar ${props.singular}`}
        descricao={
          props.alvoFixo === undefined
            ? 'O dia vem preenchido com hoje. Hora em branco quer dizer "o dia todo".'
            : `Sobre ${props.alvoFixo.nome}.`
        }
        tamanho="lg"
      >
        <form ref={formulario} action={acao} className="flex flex-col gap-4">
          {estado.erro !== null && <FormError>{estado.erro}</FormError>}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              nome="assunto"
              rotulo="Assunto"
              obrigatorio
              erro={e.assunto}
              escopo={escopo}
              className="sm:col-span-2"
            >
              <Input
                ref={primeiro}
                id={idDoCampo('assunto', escopo)}
                name="assunto"
                required
                maxLength={200}
                autoComplete="off"
                placeholder="Ligar para confirmar o orçamento"
                aria-invalid={e.assunto !== undefined}
                aria-describedby={describedBy('assunto', e.assunto, undefined, escopo)}
              />
            </Field>

            {props.alvoFixo !== undefined ? (
              <input type="hidden" name="alvo" value={props.alvoFixo.valor} />
            ) : (
              <Field
                nome="alvo"
                rotulo="Sobre"
                obrigatorio
                erro={e.alvo}
                escopo={escopo}
                className="sm:col-span-2"
              >
                <Combobox
                  id={idDoCampo('alvo', escopo)}
                  nome="alvo"
                  rotulo="Sobre"
                  placeholder="Pessoa, conta, lead ou negociação"
                  obrigatorio
                  valor={alvo}
                  aoEscolher={setAlvo}
                  buscar={buscar}
                  inicialRotulo="Nenhum registro disponível para vincular."
                  aria-invalid={e.alvo !== undefined}
                  aria-describedby={describedBy('alvo', e.alvo, undefined, escopo)}
                />
              </Field>
            )}

            {truncados.length > 0 && (
              <FormWarning className="sm:col-span-2">
                {`A lista de ${nomesTruncados} para nas primeiras 200 e pode não conter o registro que você procura. Nesse caso, agende pela página do próprio registro.`}
              </FormWarning>
            )}

            <Field nome="data" rotulo="Dia" erro={e.data} escopo={escopo}>
              <Input
                id={idDoCampo('data', escopo)}
                name="data"
                type="date"
                defaultValue={props.hoje}
                aria-invalid={e.data !== undefined}
                aria-describedby={describedBy('data', e.data, undefined, escopo)}
              />
            </Field>

            <Field
              nome="hora"
              rotulo="Hora"
              erro={e.hora}
              dica="Em branco: o dia todo."
              escopo={escopo}
            >
              <Input
                id={idDoCampo('hora', escopo)}
                name="hora"
                type="time"
                aria-invalid={e.hora !== undefined}
                aria-describedby={describedBy('hora', e.hora, 'Em branco: o dia todo.', escopo)}
              />
            </Field>

            {props.tipos.length > 0 && (
              <Field nome="tipo" rotulo="Tipo" escopo={escopo}>
                <Select id={idDoCampo('tipo', escopo)} name="tipo" defaultValue="">
                  <option value="">Sem tipo</option>
                  {props.tipos.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome}
                    </option>
                  ))}
                </Select>
              </Field>
            )}

            <Field nome="responsavel" rotulo="Responsável" escopo={escopo}>
              <Select id={idDoCampo('responsavel', escopo)} name="responsavel" defaultValue="">
                <option value="">Você</option>
                {props.membros.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              nome="notas"
              rotulo="Notas"
              erro={e.notas}
              escopo={escopo}
              className="sm:col-span-2"
            >
              <Textarea
                id={idDoCampo('notas', escopo)}
                name="notas"
                maxLength={5000}
                aria-invalid={e.notas !== undefined}
                aria-describedby={describedBy('notas', e.notas, undefined, escopo)}
              />
            </Field>
          </div>

          {/*
           * A linha de ação mora DENTRO do `<form>`, e não no `rodape` do
           * Dialog: `useFormStatus` só enxerga o formulário de dentro dele, e é
           * ele que impede a mesma atividade entrar duas vezes no duplo clique.
           */}
          <div className="flex flex-wrap items-center gap-2 border-t border-line-subtle pt-4">
            <Submit pendente="Agendando…">Agendar</Submit>
            <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
              Fechar
            </Button>
            {estado.salvo !== null && (
              <FormSuccess>{`${estado.salvo} entrou na agenda.`}</FormSuccess>
            )}
          </div>
        </form>
      </Dialog>
    </>
  );
}
