'use client';

import { useActionState, useEffect, useRef } from 'react';

import { Field, describedBy } from '@/components/form/field';
import { FormError, FormFeedback } from '@/components/form/messages';
import { Submit } from '@/components/form/submit';
import { Input } from '@/components/ui/input';

import { salvarPerfil, trocarSenha } from './actions';
import { CONTA_INICIAL } from './state';

const DICA_DO_NOME = 'Como a equipe vê você.';
const DICA_DA_SENHA = 'Ao menos 8 caracteres.';

export function PerfilForm({ nome }: { nome: string }) {
  const [estado, acao] = useActionState(salvarPerfil, CONTA_INICIAL);
  const e = estado.campos;
  return (
    <form action={acao} className="flex flex-col gap-4">
      <Field nome="nome" rotulo="Nome" obrigatorio erro={e.nome} dica={DICA_DO_NOME}>
        <Input
          id="nome"
          name="nome"
          required
          maxLength={120}
          autoComplete="name"
          defaultValue={nome}
          aria-invalid={e.nome !== undefined}
          aria-describedby={describedBy('nome', e.nome, DICA_DO_NOME)}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Submit>Salvar nome</Submit>
        <FormFeedback estado={estado} />
      </div>
    </form>
  );
}

export function SenhaForm() {
  const [estado, acao] = useActionState(trocarSenha, CONTA_INICIAL);
  const formulario = useRef<HTMLFormElement>(null);
  const e = estado.campos;

  /* Senha não fica no formulário depois de trocada — nem a atual, nem a nova. */
  useEffect(() => {
    if (estado.ok !== null) formulario.current?.reset();
  }, [estado.ok]);

  return (
    <form ref={formulario} action={acao} className="flex flex-col gap-4">
      {estado.erro !== null && <FormError>{estado.erro}</FormError>}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field nome="atual" rotulo="Senha atual" obrigatorio erro={e.atual}>
          <Input
            id="atual"
            name="atual"
            type="password"
            required
            autoComplete="current-password"
            aria-invalid={e.atual !== undefined}
            aria-describedby={describedBy('atual', e.atual)}
          />
        </Field>
        <Field nome="nova" rotulo="Senha nova" obrigatorio erro={e.nova} dica={DICA_DA_SENHA}>
          <Input
            id="nova"
            name="nova"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            aria-invalid={e.nova !== undefined}
            aria-describedby={describedBy('nova', e.nova, DICA_DA_SENHA)}
          />
        </Field>
        <Field nome="confirmacao" rotulo="Repita a nova" obrigatorio>
          <Input
            id="confirmacao"
            name="confirmacao"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Submit pendente="Trocando…">Trocar senha</Submit>
        {/* Só o sucesso: o erro já está acima, antes dos campos a que se refere. */}
        <FormFeedback estado={{ ok: estado.ok }} />
      </div>
    </form>
  );
}
