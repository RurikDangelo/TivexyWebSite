'use client';

import { Plus, X } from 'lucide-react';
import { useActionState, useEffect, useRef, useState } from 'react';

import { Field, describedBy } from '@/components/form/field';
import { FormError, FormSuccess } from '@/components/form/messages';
import { Submit } from '@/components/form/submit';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/input';

import { criarContato, editarContato } from './actions';
import { CONTATO_INICIAL, type ContatoFormState, type Opcao } from './state';

export interface ValoresDoContato {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  /** Já formatado para leitura: `529.982.247-25`. */
  documento: string | null;
  cargo: string | null;
  contaId: string | null;
  responsavelId: string | null;
  notas: string | null;
}

interface Props {
  singular: string;
  rotuloConta: string;
  contas: readonly Opcao[];
  membros: readonly Opcao[];
  /** `crm.contact_requires_document`: o campo vira obrigatório, e diz por quê. */
  exigirDocumento: boolean;
}

/**
 * O cadastro de pessoa, recolhido até ser pedido.
 *
 * Só o nome é obrigatório — a menos que a empresa exija documento. Quem anota
 * alguém que acabou de ligar raramente tem tudo, e exigir o resto faria a
 * pessoa inventar valores para conseguir salvar.
 */
export function NewContactForm(props: Props) {
  const [aberto, setAberto] = useState(false);
  const [estado, acao] = useActionState(criarContato, CONTATO_INICIAL);
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
        <Button onClick={() => setAberto(true)}>
          <Plus aria-hidden />
          Cadastrar {props.singular}
        </Button>
        {estado.salvo !== null && <FormSuccess>{`${estado.salvo} entrou na lista.`}</FormSuccess>}
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
        {estado.salvo !== null && <FormSuccess>{`${estado.salvo} entrou na lista.`}</FormSuccess>}
      </div>
    </form>
  );
}

export function EditContactForm(props: Props & { inicial: ValoresDoContato }) {
  const [estado, acao] = useActionState(editarContato, CONTATO_INICIAL);

  return (
    <form action={acao} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={props.inicial.id} />
      <Campos {...props} estado={estado} inicial={props.inicial} />
      <div className="flex flex-wrap items-center gap-3">
        <Submit>Salvar alterações</Submit>
        {estado.salvo !== null && <FormSuccess>Alterações salvas.</FormSuccess>}
      </div>
    </form>
  );
}

function Campos({
  contas,
  membros,
  rotuloConta,
  exigirDocumento,
  estado,
  inicial,
  primeiro,
}: Props & {
  estado: ContatoFormState;
  inicial?: ValoresDoContato;
  primeiro?: React.RefObject<HTMLInputElement | null>;
}) {
  const e = estado.campos;
  const dicaDocumento = exigirDocumento
    ? 'Esta empresa exige documento no cadastro.'
    : 'CPF, ou CNPJ — inclusive o novo, com letras.';

  return (
    <div className="flex flex-col gap-4">
      {estado.erro !== null && <FormError>{estado.erro}</FormError>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field nome="nome" rotulo="Nome" obrigatorio erro={e.nome}>
          <Input
            ref={primeiro}
            id="nome"
            name="nome"
            required
            maxLength={160}
            autoComplete="off"
            defaultValue={inicial?.nome}
            placeholder="Maria Souza"
            aria-invalid={e.nome !== undefined}
            aria-describedby={describedBy('nome', e.nome)}
          />
        </Field>

        <Field
          nome="documento"
          rotulo="CPF ou CNPJ"
          obrigatorio={exigirDocumento}
          erro={e.documento}
          dica={dicaDocumento}
        >
          <Input
            id="documento"
            name="documento"
            required={exigirDocumento}
            maxLength={20}
            autoComplete="off"
            defaultValue={inicial?.documento ?? ''}
            placeholder="529.982.247-25"
            aria-invalid={e.documento !== undefined}
            aria-describedby={describedBy('documento', e.documento, dicaDocumento)}
          />
        </Field>

        <Field nome="email" rotulo="E-mail" erro={e.email}>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="off"
            defaultValue={inicial?.email ?? ''}
            placeholder="maria@exemplo.com.br"
            aria-invalid={e.email !== undefined}
            aria-describedby={describedBy('email', e.email)}
          />
        </Field>

        <Field nome="telefone" rotulo="Telefone" erro={e.telefone}>
          <Input
            id="telefone"
            name="telefone"
            type="tel"
            autoComplete="off"
            defaultValue={inicial?.telefone ?? ''}
            placeholder="(11) 90000-0000"
            aria-invalid={e.telefone !== undefined}
            aria-describedby={describedBy('telefone', e.telefone)}
          />
        </Field>

        <Field nome="cargo" rotulo="Cargo ou função" erro={e.cargo}>
          <Input
            id="cargo"
            name="cargo"
            maxLength={120}
            defaultValue={inicial?.cargo ?? ''}
            placeholder="Compras"
            aria-invalid={e.cargo !== undefined}
            aria-describedby={describedBy('cargo', e.cargo)}
          />
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

        <Field nome="responsavel" rotulo="Responsável">
          <Select id="responsavel" name="responsavel" defaultValue={inicial?.responsavelId ?? ''}>
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
