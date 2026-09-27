'use client';

import { useActionState, useState } from 'react';

import { Field, describedBy, idDoCampo } from '@/components/form/field';
import { FormError } from '@/components/form/messages';
import { Submit } from '@/components/form/submit';
import { Progress } from '@/components/ui/progress';
import { SENHA_MINIMA } from '@/lib/auth/password';

import { definirSenha } from '../actions';
import { ESTADO_INICIAL } from '../form-state';
import { PasswordInput } from '../password-input';

/**
 * A senha nova, depois do link de recuperação ou do convite.
 *
 * `autoComplete="new-password"` nos dois campos: é o que faz o gerenciador
 * oferecer uma senha gerada em vez de repetir a antiga.
 *
 * O mínimo de 8 caracteres é conferido de novo no servidor. Checar só aqui
 * seria checar no lado que a pessoa controla — `conferirSenhaNova()` é a regra,
 * e `SENHA_MINIMA` é importada dela para que a dica na tela não possa divergir
 * do número que o servidor exige.
 */

const ESCOPO = 'senha-nova';
const ERRO_ID = `${ESCOPO}-falha`;
const DICA = `Ao menos ${SENHA_MINIMA} caracteres.`;

/* Tom nunca sozinho: cada nível carrega a palavra que o leitor de tela anuncia. */
const NIVEIS = [
  { rotulo: 'Curta demais', tom: 'danger' },
  { rotulo: 'Fraca', tom: 'danger' },
  { rotulo: 'Razoável', tom: 'warning' },
  { rotulo: 'Forte', tom: 'success' },
] as const;

const CLASSES_DE_CARACTERE = [/[a-z]/, /[A-Z]/, /\d/, /[^\p{L}\p{N}]/u];

/**
 * Une ids de descrição num `aria-describedby`.
 *
 * `describedBy()` do `Field` só conhece os ids que o próprio `Field` desenha
 * (dica e erro de campo). A faixa de erro daqui é do formulário inteiro e mora
 * fora dele — sem juntar as duas listas, ligar o erro apagaria a dica.
 */
function juntarDescricoes(...ids: readonly (string | undefined)[]): string | undefined {
  const lista = ids.filter((id): id is string => id !== undefined && id !== '');
  return lista.length > 0 ? lista.join(' ') : undefined;
}

/**
 * Uma estimativa, e rotulada como tal na tela.
 *
 * Não é medida de entropia nem consulta a lista de senhas vazadas — é
 * comprimento e variedade de classes de caractere, que é o que dá para calcular
 * aqui sem biblioteca e sem mandar a senha para lugar nenhum. Por isso o rótulo
 * na tela diz "força estimada": prometer mais do que isso seria a tela afirmando
 * algo que o cálculo não sustenta.
 *
 * O piso é o mesmo do servidor: abaixo de `SENHA_MINIMA` o nível é 0, porque
 * nenhuma variedade salva uma senha que a ação vai recusar.
 */
function forcaDaSenha(senha: string): number {
  if (senha.length < SENHA_MINIMA) return 0;
  const variedade = CLASSES_DE_CARACTERE.filter((classe) => classe.test(senha)).length;
  return 1 + (variedade >= 3 ? 1 : 0) + (senha.length >= 12 ? 1 : 0);
}

export function PasswordForm() {
  const [estado, acao] = useActionState(definirSenha, ESTADO_INICIAL);
  /*
   * Controlado só para medir a força. O envio continua sendo do `FormData` —
   * quem lê o valor é `definirSenha`, não este estado.
   */
  const [senha, setSenha] = useState('');
  const invalido = estado.erro !== null;
  const nivel = forcaDaSenha(senha);
  const { rotulo, tom } = NIVEIS[nivel];

  return (
    <form action={acao} className="flex flex-col gap-4">
      {invalido && (
        /* O `<div>` carrega o id porque `FormError` não expõe `id`; ver login-form.tsx. */
        <div id={ERRO_ID}>
          <FormError>{estado.erro}</FormError>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Field nome="senha" rotulo="Senha nova" obrigatorio dica={DICA} escopo={ESCOPO}>
          <PasswordInput
            id={idDoCampo('senha', ESCOPO)}
            name="senha"
            size="lg"
            autoComplete="new-password"
            minLength={SENHA_MINIMA}
            required
            autoFocus
            value={senha}
            onChange={(evento) => setSenha(evento.target.value)}
            aria-invalid={invalido}
            /*
             * A dica só passou a ser anunciada agora: era um `<p>` solto, sem
             * id e sem ligação com o campo, e quem usa leitor de tela só
             * descobria a regra depois de errar.
             */
            aria-describedby={juntarDescricoes(
              invalido ? ERRO_ID : undefined,
              describedBy('senha', undefined, DICA, ESCOPO),
            )}
          />
        </Field>

        {senha.length > 0 && (
          <div className="flex items-center gap-3">
            <Progress
              valor={nivel}
              maximo={NIVEIS.length - 1}
              tom={tom}
              densidade="densa"
              semantica="medida"
              rotulo="Força estimada da senha"
              descricaoDoValor={rotulo}
              /* Enche a cada tecla; reanimar a barra a cada caractere seria tremor, não movimento. */
              animar={false}
              className="max-w-40"
            />
            <p className="text-caption text-content-muted">
              Força estimada: <span className="text-content">{rotulo}</span>
            </p>
          </div>
        )}
      </div>

      <Field nome="confirmacao" rotulo="Repita a senha" obrigatorio escopo={ESCOPO}>
        <PasswordInput
          id={idDoCampo('confirmacao', ESCOPO)}
          name="confirmacao"
          size="lg"
          autoComplete="new-password"
          minLength={SENHA_MINIMA}
          required
          aria-invalid={invalido}
          aria-describedby={invalido ? ERRO_ID : undefined}
        />
      </Field>

      <Submit className="w-full" size="lg" pendente="Gravando…">
        Salvar e entrar
      </Submit>
    </form>
  );
}
