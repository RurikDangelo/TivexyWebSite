'use client';

import { Plus, X } from 'lucide-react';
import { useActionState, useEffect, useRef, useState } from 'react';

import { Field, describedBy } from '@/components/form/field';
import { FormError, FormSuccess } from '@/components/form/messages';
import { Submit } from '@/components/form/submit';
import { Button } from '@/components/ui/button';
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
 * O cadastro de oportunidade, recolhido até ser pedido.
 *
 * Abre no lugar, sem trocar de página: quem está no funil quer continuar
 * vendo o funil. Depois de salvar, limpa e devolve o foco ao título — quem
 * cadastra uma costuma cadastrar três.
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

  if (!aberto) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => setAberto(true)} disabled={props.etapas.length === 0}>
          <Plus aria-hidden />
          Cadastrar {props.singular}
        </Button>
        {estado.salvo !== null && <FormSuccess>{`${estado.salvo} entrou no funil.`}</FormSuccess>}
      </div>
    );
  }

  return (
    <form
      ref={formulario}
      action={acao}
      className="animate-enter rounded-lg border border-line-subtle bg-surface-raised p-4 shadow-xs"
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="font-medium text-content">Cadastrar {props.singular}</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Fechar cadastro"
          onClick={() => setAberto(false)}
        >
          <X aria-hidden />
        </Button>
      </div>

      <Campos {...props} estado={estado} primeiro={primeiro} />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Submit>Cadastrar</Submit>
        <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
          Cancelar
        </Button>
        {estado.salvo !== null && <FormSuccess>{`${estado.salvo} entrou no funil.`}</FormSuccess>}
      </div>
    </form>
  );
}

/** A edição, na página da oportunidade: sempre aberta, já preenchida. */
export function EditDealForm(props: Props & { inicial: ValoresDoNegocio }) {
  const [estado, acao] = useActionState(editarOportunidade, NEGOCIO_INICIAL);

  return (
    <form action={acao} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={props.inicial.id} />
      <Campos {...props} estado={estado} />
      <div className="flex flex-wrap items-center gap-3">
        <Submit>Salvar alterações</Submit>
        {estado.salvo !== null && <FormSuccess>Alterações salvas.</FormSuccess>}
      </div>
    </form>
  );
}

function Campos({
  etapas,
  contas,
  pessoas,
  membros,
  rotuloConta,
  rotuloPessoa,
  estado,
  inicial,
  primeiro,
}: Props & {
  estado: typeof NEGOCIO_INICIAL;
  inicial?: ValoresDoNegocio;
  primeiro?: React.RefObject<HTMLInputElement | null>;
}) {
  const e = estado.campos;

  return (
    <div className="flex flex-col gap-4">
      {estado.erro !== null && <FormError>{estado.erro}</FormError>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field nome="titulo" rotulo="Título" obrigatorio erro={e.titulo} className="sm:col-span-2">
          <Input
            ref={primeiro}
            id="titulo"
            name="titulo"
            required
            maxLength={200}
            defaultValue={inicial?.titulo}
            placeholder="Implante superior"
            aria-invalid={e.titulo !== undefined}
            aria-describedby={describedBy('titulo', e.titulo)}
          />
        </Field>

        <Field nome="valor" rotulo="Valor (R$)" erro={e.valor} dica="Em branco conta como zero.">
          <Input
            id="valor"
            name="valor"
            inputMode="decimal"
            defaultValue={inicial?.valor}
            placeholder="4.500,00"
            aria-invalid={e.valor !== undefined}
            aria-describedby={describedBy('valor', e.valor, 'Em branco conta como zero.')}
          />
        </Field>

        <Field nome="etapa" rotulo="Etapa" obrigatorio erro={e.etapa}>
          <Select
            id="etapa"
            name="etapa"
            required
            defaultValue={inicial?.etapaId ?? etapas[0]?.id}
            aria-invalid={e.etapa !== undefined}
            aria-describedby={describedBy('etapa', e.etapa)}
          >
            {etapas.map((etapa) => (
              <option key={etapa.id} value={etapa.id}>
                {etapa.nome}
              </option>
            ))}
          </Select>
        </Field>

        <Field nome="conta" rotulo={rotuloConta}>
          <Select id="conta" name="conta" defaultValue={inicial?.contaId ?? ''}>
            <option value="">Nenhuma</option>
            {contas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
        </Field>

        <Field nome="pessoa" rotulo={rotuloPessoa}>
          <Select id="pessoa" name="pessoa" defaultValue={inicial?.pessoaId ?? ''}>
            <option value="">Nenhuma</option>
            {pessoas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </Select>
        </Field>

        <Field nome="previsao" rotulo="Data prevista" erro={e.previsao}>
          <Input
            id="previsao"
            name="previsao"
            type="date"
            defaultValue={inicial?.previsao ?? ''}
            aria-invalid={e.previsao !== undefined}
            aria-describedby={describedBy('previsao', e.previsao)}
          />
        </Field>

        <Field nome="responsavel" rotulo="Responsável">
          <Select id="responsavel" name="responsavel" defaultValue={inicial?.responsavelId ?? ''}>
            {/* No cadastro, em branco é quem cadastra — ver a action. Na edição, é ninguém. */}
            <option value="">{inicial === undefined ? 'Você' : 'Ninguém'}</option>
            {membros.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </Select>
        </Field>

        <Field nome="notas" rotulo="Notas" erro={e.notas} className="sm:col-span-2">
          <Textarea
            id="notas"
            name="notas"
            maxLength={5000}
            defaultValue={inicial?.notas ?? ''}
            aria-invalid={e.notas !== undefined}
            aria-describedby={describedBy('notas', e.notas)}
          />
        </Field>
      </div>
    </div>
  );
}
