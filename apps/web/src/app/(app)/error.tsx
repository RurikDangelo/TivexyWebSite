'use client';

import { RotateCcw, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';

import { Page } from '@/components/page/page';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * A fronteira de erro da área autenticada.
 *
 * O que ela cobre e o que não cobre: React Error Boundary não captura o que
 * estoura no próprio layout que a envolve. Uma falha em `requireSession()`
 * dentro de `(app)/layout.tsx` passa por cima daqui e vai parar em
 * `app/global-error.tsx`. Por isso as duas existem, e por isso esta pode
 * contar com a casca em volta — sidebar, menu e troca de empresa continuam
 * disponíveis enquanto esta tela aparece.
 *
 * Nada de `error.message` na tela. Em produção o Next substitui a mensagem por
 * um texto genérico, e nas rotas onde ela sobrevive costuma ser um detalhe de
 * implementação — inútil para quem usa e revelador demais para quem não
 * deveria ver. O que aparece é o `digest`, que não descreve a falha: só liga o
 * que a pessoa viu ao que ficou no registro do servidor.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // TODO: enviar para a camada de observabilidade quando ela existir.
    console.error(error);
  }, [error]);

  return (
    /* `intersticial` (seção 3): é uma tela de passagem, não de trabalho. */
    <Page variant="intersticial">
      {/*
       * `role="alert"` porque isto aparece depois de uma navegação no cliente:
       * sem ele, quem usa leitor de tela fica esperando por uma tela que já
       * desistiu de carregar. Um evento de entrada por tela (seção 8): anima o
       * bloco, não os filhos.
       */}
      <div role="alert" className="flex animate-enter flex-col items-center gap-5 text-center">
        {/* Cor nunca sozinha (R8): o círculo vermelho vem com o triângulo e com a palavra do título. */}
        <span className="flex size-14 items-center justify-center rounded-pill bg-danger-soft text-danger">
          <TriangleAlert className="size-7" aria-hidden />
        </span>

        <div className="flex flex-col gap-2">
          <h1 className="text-display text-balance text-content">
            Não foi possível carregar esta tela
          </h1>
          <p className="text-body-lg text-pretty text-content-muted">
            A falha já está registrada. Pode ter sido momentânea — uma leitura que caiu no meio — ou
            um defeito nosso.
          </p>
        </div>

        {/*
         * O próximo passo em superfície afundada, como no acesso negado: é
         * instrução, não um segundo alerta.
         *
         * Duas frases porque o `digest` é opcional: sem ele não há o que
         * relatar, e mandar relatar assim mesmo é mandar abrir um chamado que
         * ninguém consegue investigar. O que a tela NÃO diz é se algo foi
         * gravado antes da falha — a fronteira de erro não sabe disso, e
         * tranquilizar sem saber é o tipo de invenção que o CLAUDE.md proíbe.
         */}
        <p className="rounded-card border border-line-subtle bg-surface-sunken px-4 py-3 text-body text-pretty text-content-default">
          Tente de novo: isso refaz só a leitura desta tela, sem recarregar a plataforma inteira. Se
          repetir, saia e volte pelo menu
          {error.digest === undefined
            ? '. Esta falha não gerou código; se ela voltar, relate o horário e o que você estava fazendo.'
            : ' — e, se ainda assim repetir, relate com o código abaixo.'}
        </p>

        {error.digest !== undefined && (
          <p className="text-caption text-content-subtle">
            Código da falha:{' '}
            <span className="select-all font-mono text-content-default">{error.digest}</span>
          </p>
        )}

        {/*
         * Uma ação `brand` por tela (seção 7, P15). Tentar de novo é a que
         * resolve; ir para o painel é a saída, e sai em `outline`.
         */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button onClick={reset} variant="brand">
            <RotateCcw aria-hidden />
            Tentar de novo
          </Button>
          <Link href="/painel" className={cn(buttonVariants({ variant: 'outline' }))}>
            Ir para a visão geral
          </Link>
        </div>
      </div>
    </Page>
  );
}
