'use client';

import { ArrowLeft, MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useActionState } from 'react';

import { Field, idDoCampo } from '@/components/form/field';
import { FormError } from '@/components/form/messages';
import { Submit } from '@/components/form/submit';
import { Input } from '@/components/ui/input';

import { recuperar } from '../actions';
import { ESTADO_INICIAL } from '../form-state';

/**
 * Pedido de recuperação de senha.
 *
 * O endereço de retorno do e-mail **não** vem daqui. Ele é montado no servidor,
 * a partir do host da requisição: o mesmo código roda em localhost, em preview
 * da Vercel e em produção, e um link apontando para o ambiente errado leva a
 * pessoa a uma sessão que não é a dela.
 *
 * Mandar a origem num campo escondido funcionaria, e seria pior — um valor a
 * mais vindo do navegador, para responder uma pergunta que o servidor já sabe.
 */

const ESCOPO = 'recuperar';
const ERRO_ID = `${ESCOPO}-falha`;

export function RecoverForm() {
  const [estado, acao] = useActionState(recuperar, ESTADO_INICIAL);

  if (estado.aviso !== undefined) {
    /*
     * O sucesso substitui o formulário em vez de ficar acima dele. A ação
     * responde a mesma coisa tenha o e-mail conta ou não (ver `actions.ts`), e
     * deixar o campo preenchido ao lado da confirmação convida a reenviar —
     * cada reenvio conta contra o limite de taxa do Supabase e não produz um
     * segundo e-mail.
     *
     * Composição de estado concluído, não faixa de aviso: ícone, o que
     * aconteceu, e o que fazer agora.
     */
    return (
      <div className="flex flex-col items-start gap-4">
        <span className="grid size-11 place-items-center rounded-pill bg-success-soft">
          <MailCheck className="size-5 text-success" aria-hidden />
        </span>

        <div className="flex flex-col gap-1">
          {/* `<h2>` sob o `<h1>` do cartão: o estado concluído é uma seção da tela, não outra tela. */}
          <h2 className="text-h2 text-content">Link a caminho</h2>
          <p role="status" className="max-w-prose text-body text-content-muted">
            {estado.aviso}
          </p>
        </div>

        <Link
          href="/entrar"
          className="inline-flex items-center gap-2 rounded-control py-1 text-label text-content-accent underline-offset-4 hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Voltar para a entrada
        </Link>
      </div>
    );
  }

  const invalido = estado.erro !== null;

  return (
    <form action={acao} className="flex flex-col gap-4">
      {invalido && (
        /* O `<div>` carrega o id porque `FormError` não expõe `id`; ver login-form.tsx. */
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

      <Submit className="w-full" size="lg" pendente="Enviando…">
        Enviar link de recuperação
      </Submit>

      <Link
        href="/entrar"
        className="inline-flex items-center justify-center gap-2 rounded-control py-1 text-label text-content-muted underline-offset-4 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Lembrei a senha
      </Link>
    </form>
  );
}
