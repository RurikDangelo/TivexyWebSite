'use client';

import { RotateCcw } from 'lucide-react';
import { useEffect } from 'react';

import { BrandSymbol } from '@/components/brand/logo';
import { Page } from '@/components/page/page';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import './globals.css';

/*
 * O mesmo script antiflash do layout raiz, palavra por palavra.
 *
 * Ele precisa ser repetido porque `global-error` SUBSTITUI o layout raiz: o
 * `<html>` daqui é outro, e o script que aplica `.dark` antes da primeira
 * pintura não roda. Sem esta cópia, quem usa o tema escuro leva uma tela branca
 * na cara justamente no pior momento.
 *
 * Honestidade sobre o alcance: isto resolve a falha que acontece no servidor,
 * onde o HTML é analisado e o script executa. Numa falha já no cliente, depois
 * da hidratação, o React não reexecuta script nenhum — aí o tema vale se a
 * classe tiver sobrevivido no `<html>`, e é por isso que este componente não
 * escreve `className` lá: o que não é declarado tem mais chance de ficar.
 */
const SCRIPT_DE_TEMA =
  "(function(){try{var t=localStorage.getItem('tivexy-theme');var d=window.matchMedia('(prefers-color-scheme: dark)').matches;if(t==='dark'||(t!=='light'&&d))document.documentElement.classList.add('dark')}catch(e){}})()";

/**
 * A última rede: a falha que acontece antes de existir aplicação.
 *
 * `(app)/error.tsx` cobre o que estoura dentro do grupo autenticado, mas um
 * Error Boundary não captura o que estoura no layout que o envolve. Quando
 * `requireSession()` ou `currentTerms()` falham em `(app)/layout.tsx`, ou
 * quando o próprio layout raiz quebra, não há casca, não há menu e não há
 * `error.tsx` que valha — sem este arquivo, o que aparece é a página branca
 * padrão do Next, em inglês e sem marca.
 *
 * Por isso aqui tudo é o mínimo que funciona sozinho: `<html>` e `<body>`
 * próprios (o layout raiz não rodou), a folha de estilos importada de novo, e
 * `<a href>` em vez de `<Link>` — se o roteador do cliente é parte do que
 * quebrou, uma navegação de verdade é a única que ainda acontece.
 *
 * O que não aparece: `error.message`. Vale o mesmo critério de
 * `(app)/error.tsx` — só o `digest`, que não descreve a falha, apenas liga o
 * que a pessoa viu ao que ficou no registro do servidor.
 *
 * Nota tipográfica: as famílias do `next/font` são declaradas no `<html>` do
 * layout raiz, que não existe aqui. `--font-manrope` fica indefinida e
 * `text-display` cai no `sans-serif` da declaração. É degradação aceitável e
 * consciente — carregar fonte na tela de falha é pedir uma segunda falha.
 */
export default function GlobalError({
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
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="min-h-dvh px-4 py-6 sm:px-6 lg:px-8">
        {/* Primeiro filho do `<body>`: qualquer coisa antes dele pintaria no tema errado. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_DE_TEMA }} />
        {/* React 19 iça `<title>` para o `<head>`; não há `metadata` em Client Component. */}
        <title>Erro · Tivexy</title>

        <Page variant="intersticial">
          <div role="alert" className="flex flex-col items-center gap-5 text-center">
            {/*
             * A marca em vez de um ícone de alerta: o que esta tela precisa
             * dizer primeiro é que a pessoa ainda está na Tivexy e não caiu
             * numa página de erro do navegador.
             */}
            <BrandSymbol className="h-10 text-content-subtle" />

            <div className="flex flex-col gap-2">
              <h1 className="text-display text-balance text-content">
                A plataforma não conseguiu abrir
              </h1>
              <p className="text-body-lg text-pretty text-content-muted">
                A falha aconteceu antes de a tela montar, então nem o menu está disponível. Ela já
                está registrada.
              </p>
            </div>

            {/* Sem `digest` não há o que relatar — pedir o relato assim mesmo seria mandar abrir um chamado incapaz de ser investigado. */}
            <p className="rounded-card border border-line-subtle bg-surface-sunken px-4 py-3 text-body text-pretty text-content-default">
              Recarregar resolve quando a falha foi de momento
              {error.digest === undefined
                ? '. Se continuar, tente de novo em alguns minutos antes de relatar.'
                : '. Se continuar, relate com o código abaixo.'}
            </p>

            {error.digest !== undefined && (
              <p className="text-caption text-content-subtle">
                Código da falha:{' '}
                <span className="select-all font-mono text-content-default">{error.digest}</span>
              </p>
            )}

            <div className="flex flex-wrap items-center justify-center gap-2">
              {/* Uma ação `brand` por tela (seção 7, P15): é esta. */}
              <Button onClick={reset} variant="brand">
                <RotateCcw aria-hidden />
                Recarregar
              </Button>
              <a href="/painel" className={cn(buttonVariants({ variant: 'outline' }))}>
                Ir para a visão geral
              </a>
            </div>
          </div>
        </Page>
      </body>
    </html>
  );
}
