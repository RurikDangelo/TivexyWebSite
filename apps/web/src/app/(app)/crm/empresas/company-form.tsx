'use client';

import { Plus, X } from 'lucide-react';
import { useActionState, useEffect, useRef, useState } from 'react';

import { Field, describedBy } from '@/components/form/field';
import { FormError, FormSuccess } from '@/components/form/messages';
import { Submit } from '@/components/form/submit';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/input';

import { criarConta, editarConta } from './actions';
import { CONTA_INICIAL, type ContaFormState, type Opcao } from './state';

export interface ValoresDaConta {
  id: string;
  nome: string;
  razaoSocial: string | null;
  /** Já formatado para leitura. */
  documento: string | null;
  email: string | null;
  telefone: string | null;
  site: string | null;
  responsavelId: string | null;
  notas: string | null;
}

interface Props {
  singular: string;
  membros: readonly Opcao[];
}

/** O cadastro de conta, recolhido até ser pedido. Só o nome é obrigatório. */
export function NewCompanyForm(props: Props) {
  const [aberto, setAberto] = useState(false);
  const [estado, acao] = useActionState(criarConta, CONTA_INICIAL);
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

export function EditCompanyForm(props: Props & { inicial: ValoresDaConta }) {
  const [estado, acao] = useActionState(editarConta, CONTA_INICIAL);

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
  membros,
  estado,
  inicial,
  primeiro,
}: Props & {
  estado: ContaFormState;
  inicial?: ValoresDaConta;
  primeiro?: React.RefObject<HTMLInputElement | null>;
}) {
  const e = estado.campos;
  const dicaDocumento = 'CNPJ — inclusive o novo, com letras — ou CPF.';

  return (
    <div className="flex flex-col gap-4">
      {estado.erro !== null && <FormError>{estado.erro}</FormError>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field nome="nome" rotulo="Nome" obrigatorio erro={e.nome} dica="Como a equipe chama.">
          <Input
            ref={primeiro}
            id="nome"
            name="nome"
            required
            maxLength={160}
            autoComplete="off"
            defaultValue={inicial?.nome}
            placeholder="Padaria do Bairro"
            aria-invalid={e.nome !== undefined}
            aria-describedby={describedBy('nome', e.nome, 'Como a equipe chama.')}
          />
        </Field>

        <Field nome="razaoSocial" rotulo="Razão social" erro={e.razaoSocial}>
          <Input
            id="razaoSocial"
            name="razaoSocial"
            maxLength={200}
            autoComplete="off"
            defaultValue={inicial?.razaoSocial ?? ''}
            placeholder="Padaria do Bairro Ltda."
            aria-invalid={e.razaoSocial !== undefined}
            aria-describedby={describedBy('razaoSocial', e.razaoSocial)}
          />
        </Field>

        <Field nome="documento" rotulo="CNPJ ou CPF" erro={e.documento} dica={dicaDocumento}>
          <Input
            id="documento"
            name="documento"
            maxLength={20}
            autoComplete="off"
            defaultValue={inicial?.documento ?? ''}
            placeholder="12.ABC.345/01DE-35"
            aria-invalid={e.documento !== undefined}
            aria-describedby={describedBy('documento', e.documento, dicaDocumento)}
          />
        </Field>

        <Field nome="site" rotulo="Site" erro={e.site}>
          <Input
            id="site"
            name="site"
            inputMode="url"
            autoComplete="off"
            defaultValue={inicial?.site ?? ''}
            placeholder="padariadobairro.com.br"
            aria-invalid={e.site !== undefined}
            aria-describedby={describedBy('site', e.site)}
          />
        </Field>

        <Field nome="email" rotulo="E-mail" erro={e.email}>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="off"
            defaultValue={inicial?.email ?? ''}
            placeholder="contato@exemplo.com.br"
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
            placeholder="(11) 3333-4444"
            aria-invalid={e.telefone !== undefined}
            aria-describedby={describedBy('telefone', e.telefone)}
          />
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
