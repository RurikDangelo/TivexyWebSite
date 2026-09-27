'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { Field, idDoCampo } from '@/components/form/field';
import { FormError } from '@/components/form/messages';
import { Submit } from '@/components/form/submit';
import { Input } from '@/components/ui/input';

import { entrar } from '../actions';
import { ESTADO_INICIAL } from '../form-state';
import { PasswordInput } from '../password-input';

/**
 * O formulário de entrada.
 *
 * `proxima` viaja num campo escondido, e não só na URL: o navegador reenvia o
 * formulário, não a query, quando a ação devolve erro. Sem o campo, errar a
 * senha uma vez perderia o destino e jogaria a pessoa no painel em vez de na
 * página que ela tentou abrir.
 *
 * `autoComplete` nos dois campos porque gerenciador de senha é a defesa real
 * contra senha fraca e reaproveitada — atrapalhá-lo piora a segurança, não
 * melhora.
 */

/** Escopo literal: é o único formulário da tela, e um id legível no DOM sobrevive a um diff. */
const ESCOPO = 'entrar';

/**
 * O id da faixa de erro, para o `aria-describedby` dos dois campos.
 *
 * Os campos ganhavam `aria-invalid` e nada mais: o leitor de tela anunciava
 * "inválido" sem dizer por quê, e o `role="alert"` só resolve enquanto o foco
 * ainda está onde a mensagem apareceu. Como o erro é do formulário inteiro — e
 * tem de ser, para não revelar qual dos dois campos falhou —, os dois apontam
 * para a mesma frase.
 */
const ERRO_ID = `${ESCOPO}-falha`;

export function LoginForm({ proxima }: { proxima: string | null }) {
  const [estado, acao] = useActionState(entrar, ESTADO_INICIAL);
  const invalido = estado.erro !== null;

  return (
    <form action={acao} className="flex flex-col gap-4">
      {proxima !== null && <input type="hidden" name="proxima" value={proxima} />}

      {invalido && (
        /*
         * O `<div>` existe só para carregar o id: `FormError` não expõe `id`, e
         * `components/form/` não é território desta onda. `aria-describedby`
         * aceita qualquer elemento — a descrição é o texto que ele contém.
         */
        <div id={ERRO_ID}>
          <FormError>{estado.erro}</FormError>
        </div>
      )}

      <Field nome="email" rotulo="E-mail" obrigatorio escopo={ESCOPO}>
        <Input
          id={idDoCampo('email', ESCOPO)}
          name="email"
          type="email"
          size="lg"
          autoComplete="username"
          required
          autoFocus
          placeholder="voce@empresa.com.br"
          aria-invalid={invalido}
          aria-describedby={invalido ? ERRO_ID : undefined}
        />
      </Field>

      <Field nome="senha" rotulo="Senha" obrigatorio escopo={ESCOPO}>
        <PasswordInput
          id={idDoCampo('senha', ESCOPO)}
          name="senha"
          size="lg"
          autoComplete="current-password"
          required
          avisarCapsLock
          aria-invalid={invalido}
          aria-describedby={invalido ? ERRO_ID : undefined}
        />
      </Field>

      {/*
       * O link sai da linha do rótulo e vira uma linha própria: o `Field` é dono
       * do par rótulo/controle, e enfiar um segundo elemento naquela linha
       * exigiria abrir uma exceção no primitivo para uma tela só.
       */}
      <div className="flex justify-end">
        <Link
          href="/recuperar"
          className="rounded-control py-1 text-label text-content-accent underline-offset-4 hover:underline"
        >
          Esqueci a senha
        </Link>
      </div>

      <Submit className="w-full" size="lg" pendente="Entrando…">
        Entrar
      </Submit>
    </form>
  );
}
