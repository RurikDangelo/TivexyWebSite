'use client';

import { Pencil, Plus } from 'lucide-react';
import { useActionState, useEffect, useRef, useState } from 'react';

import { Field, describedBy, idDoCampo } from '@/components/form/field';
import { FormError, FormSuccess } from '@/components/form/messages';
import { Submit } from '@/components/form/submit';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input, Select, Textarea } from '@/components/ui/input';

import { criarOportunidade, editarOportunidade } from './actions';
import { NEGOCIO_INICIAL, type Opcao } from './state';

export interface ValoresDoNegocio {
  id: string;
  titulo: string;
  /** Já no formato que a pessoa digita: `4.500,00`. */
  valor: string;
  etapaId: string;
  contaId: string | null;
  pessoaId: string | null;
  responsavelId: string | null;
  previsao: string | null;
  notas: string | null;
}

interface Props {
  singular: string;
  /** As etapas oferecidas. No cadastro, só as abertas; na edição, todas as do funil. */
  etapas: readonly Opcao[];
  contas: readonly Opcao[];
  pessoas: readonly Opcao[];
  membros: readonly Opcao[];
  /** Como o nicho chama conta e pessoa, no singular e com maiúscula. */
  rotuloConta: string;
  rotuloPessoa: string;
}

/**
 * Escopos de id.
 *
 * Os dois formulários desta pasta convivem com o `<NewActivityForm>` do painel
 * de atividades na mesma página de detalhe, e os três têm campo `notas` e
 * `responsavel`. Sem prefixo, o `<label>` aponta para o primeiro elemento que
 * casar e clicar no rótulo foca o campo do outro formulário.
 */
const ESCOPO_NOVO = 'novo-negocio';
const ESCOPO_EDICAO = 'negocio';

/**
 * O cadastro de oportunidade, em diálogo.
 *
 * Era um bloco que abria no meio da página e empurrava o quadro inteiro para
 * baixo — justamente na tela onde a posição das colunas é a informação. O
 * diálogo mantém o funil no lugar, e continua sem trocar de página.
 *
 * Depois de salvar, limpa e devolve o foco ao título sem fechar: quem cadastra
 * uma costuma cadastrar três.
 */
export function NewDealForm(props: Props) {
  const [aberto, setAberto] = useState(false);
  const [estado, acao] = useActionState(criarOportunidade, NEGOCIO_INICIAL);
  const formulario = useRef<HTMLFormElement>(null);
  const primeiro = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (estado.salvo === null) return;
    formulario.current?.reset();
    primeiro.current?.focus();
  }, [estado.salvo]);

  return (
    <>
      <Button onClick={() => setAberto(true)} disabled={props.etapas.length === 0}>
        <Plus aria-hidden />
        Cadastrar {props.singular}
      </Button>

      <Dialog
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        titulo={`Cadastrar ${props.singular}`}
        descricao="Entra no funil na etapa escolhida. Só título e etapa são obrigatórios."
        tamanho="lg"
      >
        <form ref={formulario} action={acao} className="flex flex-col gap-4">
          <Campos {...props} escopo={ESCOPO_NOVO} estado={estado} primeiro={primeiro} />
          {estado.salvo !== null && <FormSuccess>{`${estado.salvo} entrou no funil.`}</FormSuccess>}
          {/*
           * Os botões ficam dentro do `<form>`, e não no rodapé do diálogo:
           * `useFormStatus` só enxerga o formulário acima dele na árvore, e é
           * essa trava que impede o clique duplo virar dois cadastros.
           */}
          <div className="flex flex-wrap items-center gap-2">
            <Submit>Cadastrar</Submit>
            <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
              Fechar
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

/**
 * O cadastro na página da oportunidade: leitura primeiro, edição sob demanda.
 *
 * O formulário sempre aberto fazia da página de detalhe um formulário: as
 * notas, que são o único texto do registro, só existiam como valor de um
 * `<textarea>`. Agora elas se leem como texto, e o formulário aparece quando
 * alguém decide mudar alguma coisa.
 */
export function EditDealForm(props: Props & { inicial: ValoresDoNegocio }) {
  const [estado, acao] = useActionState(editarOportunidade, NEGOCIO_INICIAL);
  const [editando, setEditando] = useState(false);

  if (!editando) {
    return (
      <div className="flex flex-col items-start gap-3">
        <NotasEmLeitura notas={props.inicial.notas} />
        <Button variant="outline" size="sm" onClick={() => setEditando(true)}>
          <Pencil aria-hidden />
          Editar cadastro
        </Button>
      </div>
    );
  }

  return (
    <form action={acao} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={props.inicial.id} />
      <Campos {...props} escopo={ESCOPO_EDICAO} estado={estado} />
      <div className="flex flex-wrap items-center gap-2">
        <Submit>Salvar alterações</Submit>
        <Button type="button" variant="ghost" onClick={() => setEditando(false)}>
          Cancelar
        </Button>
        {estado.salvo !== null && <FormSuccess>Alterações salvas.</FormSuccess>}
      </div>
    </form>
  );
}

/**
 * As notas como texto.
 *
 * `max-w-prose` no parágrafo, nunca no contêiner: a coluna da página serve
 * também ao painel de atividades, que quer a largura toda. Quem tem medida de
 * leitura é o texto corrido.
 */
export function NotasEmLeitura({ notas }: { notas: string | null }) {
  if (notas === null || notas.trim() === '') {
    return (
      <p className="text-body text-content-subtle">
        Sem notas. É aqui que fica o combinado com o cliente — o que ele pediu, o que falta decidir.
      </p>
    );
  }

  return (
    <p className="max-w-prose whitespace-pre-wrap text-body text-pretty text-content-default">
      {notas}
    </p>
  );
}

function Campos({
  etapas,
  contas,
  pessoas,
  membros,
  rotuloConta,
  rotuloPessoa,
  escopo,
  estado,
  inicial,
  primeiro,
}: Props & {
  escopo: string;
  estado: typeof NEGOCIO_INICIAL;
  inicial?: ValoresDoNegocio;
  primeiro?: React.RefObject<HTMLInputElement | null>;
}) {
  const e = estado.campos;
  const id = (nome: string) => idDoCampo(nome, escopo);

  return (
    <div className="flex flex-col gap-4">
      {estado.erro !== null && <FormError>{estado.erro}</FormError>}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          nome="titulo"
          escopo={escopo}
          rotulo="Título"
          obrigatorio
          erro={e.titulo}
          className="sm:col-span-2"
        >
          <Input
            ref={primeiro}
            id={id('titulo')}
            name="titulo"
            required
            maxLength={200}
            defaultValue={inicial?.titulo}
            placeholder="Implante superior"
            aria-invalid={e.titulo !== undefined}
            aria-describedby={describedBy('titulo', e.titulo, undefined, escopo)}
          />
        </Field>

        <Field
          nome="valor"
          escopo={escopo}
          rotulo="Valor (R$)"
          erro={e.valor}
          dica="Em branco conta como zero."
        >
          <Input
            id={id('valor')}
            name="valor"
            inputMode="decimal"
            defaultValue={inicial?.valor}
            placeholder="4.500,00"
            aria-invalid={e.valor !== undefined}
            aria-describedby={describedBy('valor', e.valor, 'Em branco conta como zero.', escopo)}
          />
        </Field>

        <Field nome="etapa" escopo={escopo} rotulo="Etapa" obrigatorio erro={e.etapa}>
          <Select
            id={id('etapa')}
            name="etapa"
            required
            defaultValue={inicial?.etapaId ?? etapas[0]?.id}
            aria-invalid={e.etapa !== undefined}
            aria-describedby={describedBy('etapa', e.etapa, undefined, escopo)}
          >
            {etapas.map((etapa) => (
              <option key={etapa.id} value={etapa.id}>
                {etapa.nome}
              </option>
            ))}
          </Select>
        </Field>

        <Field nome="conta" escopo={escopo} rotulo={rotuloConta}>
          <Select id={id('conta')} name="conta" defaultValue={inicial?.contaId ?? ''}>
            <option value="">Nenhuma</option>
            {contas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
        </Field>

        <Field nome="pessoa" escopo={escopo} rotulo={rotuloPessoa}>
          <Select id={id('pessoa')} name="pessoa" defaultValue={inicial?.pessoaId ?? ''}>
            <option value="">Nenhuma</option>
            {pessoas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </Select>
        </Field>

        <Field nome="previsao" escopo={escopo} rotulo="Data prevista" erro={e.previsao}>
          <Input
            id={id('previsao')}
            name="previsao"
            type="date"
            defaultValue={inicial?.previsao ?? ''}
            aria-invalid={e.previsao !== undefined}
            aria-describedby={describedBy('previsao', e.previsao, undefined, escopo)}
          />
        </Field>

        <Field nome="responsavel" escopo={escopo} rotulo="Responsável">
          <Select
            id={id('responsavel')}
            name="responsavel"
            defaultValue={inicial?.responsavelId ?? ''}
          >
            {/* No cadastro, em branco é quem cadastra — ver a action. Na edição, é ninguém. */}
            <option value="">{inicial === undefined ? 'Você' : 'Ninguém'}</option>
            {membros.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </Select>
        </Field>

        <Field nome="notas" escopo={escopo} rotulo="Notas" erro={e.notas} className="sm:col-span-2">
          <Textarea
            id={id('notas')}
            name="notas"
            maxLength={5000}
            defaultValue={inicial?.notas ?? ''}
            aria-invalid={e.notas !== undefined}
            aria-describedby={describedBy('notas', e.notas, undefined, escopo)}
          />
        </Field>
      </div>
    </div>
  );
}
