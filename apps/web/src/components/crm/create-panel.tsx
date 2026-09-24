'use client';

import { CheckCircle2, Loader2, Plus, X } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';

/**
 * O painel de cadastro rápido das telas de CRM.
 *
 * Nasceu na tela de leads e saiu de lá quando a terceira tela precisou do
 * mesmo comportamento. O que se compartilha aqui não é aparência — é o
 * conjunto de detalhes que fazem a tela ser usável por quem passa o dia nela,
 * e que são fáceis de esquecer na cópia número três:
 *
 * - **Abre no lugar, sem trocar de página.** Quem está nesta tela está
 *   anotando alguém que acabou de ligar, e perder a lista de vista para
 *   cadastrar um nome é o que faz a pessoa anotar no papel.
 * - **Limpa e devolve o foco depois de salvar.** Quem cadastra um, cadastra
 *   três. Clicar no campo de novo a cada um é atrito que só quem usa o dia
 *   inteiro sente.
 * - **A confirmação sobrevive ao fechamento.** O painel fecha, e "Fulano foi
 *   cadastrado" continua ao lado do botão — senão a pessoa não sabe se deu
 *   certo.
 * - **O botão de salvar desabilita enquanto salva**, com `useFormStatus`, que
 *   é o que impede o clique duplo de virar dois cadastros.
 *
 * O que **não** vem para cá são os campos. Eles são de cada tela, e um painel
 * que tentasse desenhá-los a partir de uma configuração seria o motor de
 * formulário que o ADR-002 adiou de propósito.
 */

function Enviar({ rotulo }: { rotulo: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Salvando…
        </>
      ) : (
        rotulo
      )}
    </Button>
  );
}

/** O mínimo que o painel precisa saber do resultado da ação. */
export interface ResultadoDeCadastro {
  erro: string | null;
  /** O nome de quem acabou de ser cadastrado, ou `null`. */
  criado: string | null;
}

export function PainelDeCadastro({
  titulo,
  acao,
  estado,
  confirmacao,
  rotuloEnviar = 'Cadastrar',
  aoSalvar,
  children,
}: {
  /** O cabeçalho do painel, e o texto do botão que o abre. */
  titulo: string;
  acao: (form: FormData) => void;
  /** O resultado da última submissão, como `useActionState` devolve. */
  estado: ResultadoDeCadastro;
  /** Como anunciar o sucesso. Recebe o nome. */
  confirmacao: (nome: string) => string;
  rotuloEnviar?: string;
  /** Chamado depois da limpeza — para devolver o foco ao primeiro campo. */
  aoSalvar?: () => void;
  children: ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const formulario = useRef<HTMLFormElement>(null);
  const { erro, criado } = estado;

  /*
   * A dependência é o **objeto** de estado, não o nome de quem foi cadastrado.
   *
   * `useActionState` devolve um objeto novo a cada submissão, e o nome não:
   * quem cadastra duas Marias seguidas produz `criado: 'Maria'` das duas
   * vezes. Com o nome na lista de dependências, a segunda não limparia o
   * formulário nem devolveria o foco — e quem está cadastrando em série é
   * exatamente quem sente isso.
   *
   * Depender do objeto faz o efeito rodar também quando a ação volta com erro.
   * Daí a guarda: em erro, `criado` é nulo e nada é limpo — perder o que a
   * pessoa digitou logo depois de o salvamento falhar seria o pior momento
   * possível para limpar o formulário.
   *
   * `aoSalvar` fica fora da lista de propósito: quem chama costuma passar uma
   * função nova a cada render, e incluí-la faria o efeito rodar sempre.
   */
  useEffect(() => {
    if (estado.criado === null) return;
    formulario.current?.reset();
    aoSalvar?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  if (!aberto) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => setAberto(true)}>
          <Plus aria-hidden />
          {titulo}
        </Button>
        {criado !== null && (
          <p role="status" className="flex items-center gap-1.5 text-sm text-success">
            <CheckCircle2 className="size-4" aria-hidden />
            {confirmacao(criado)}
          </p>
        )}
      </div>
    );
  }

  return (
    <form
      ref={formulario}
      action={acao}
      className="rounded-lg border border-line-subtle bg-surface-raised p-4"
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-medium text-content">{titulo}</h2>
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

      {erro !== null && (
        <p role="alert" className="mb-4 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          {erro}
        </p>
      )}

      {criado !== null && (
        <p role="status" className="mb-4 text-sm text-success">
          {confirmacao(criado)}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">{children}</div>

      <div className="mt-4 flex items-center gap-2">
        <Enviar rotulo={rotuloEnviar} />
        <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
