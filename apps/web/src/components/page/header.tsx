import { ArrowLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Um degrau da trilha do `PageHeader`: sempre um ancestral, sempre navegável —
 * a tela atual é o `<h1>` logo abaixo, e não entra na lista.
 *
 * Nome diferente do `DegrauDaTrilha` de `breadcrumb.tsx` de propósito: lá o
 * último degrau é a página atual e não vira link (`href` é opcional). Duas
 * formas com um nome só seria a importação errada esperando para acontecer.
 */
export interface AncestralDaPagina {
  rotulo: string;
  href: string;
}

export interface PageHeaderProps {
  titulo: string;
  descricao?: ReactNode;
  /**
   * Ancestrais, da raiz até o pai direto. Substitui o `<ArrowLeft/> Voltar` que
   * sete telas de detalhe escreviam à mão, cada uma com uma classe diferente.
   */
  trilha?: readonly AncestralDaPagina[];
  acoes?: ReactNode;
  className?: string;
}

/**
 * O topo de toda tela da operação: trilha, título, uma linha de contexto, ações.
 *
 * O título chega pronto — quem o monta é `sectionTitle()`, no vocabulário do
 * tenant. Escrever o rótulo à mão aqui é o defeito que o menu já teve.
 *
 * A migalha do header da casca (seção 2) responde por "onde estou no produto";
 * a `trilha` daqui responde por "de onde esta tela pendura", que é outra
 * pergunta — e é a que o botão Voltar tentava responder.
 */
export function PageHeader({ titulo, descricao, trilha, acoes, className }: PageHeaderProps) {
  return (
    <header className={cn('mb-5 flex flex-col gap-2', className)}>
      {trilha !== undefined && trilha.length > 0 && (
        <nav aria-label="Trilha">
          <ol className="flex flex-wrap items-center gap-x-1 text-label text-content-muted">
            {trilha.map((degrau, i) => (
              <li key={degrau.href} className="flex items-center gap-1">
                {i > 0 && (
                  <ChevronRight className="size-3.5 shrink-0 text-content-subtle" aria-hidden />
                )}
                {/* `min-h-6`: 24px é o alvo mínimo, e um link de 13px de altura não é alcançável no toque. */}
                <Link
                  href={degrau.href}
                  className="inline-flex min-h-6 items-center gap-1.5 rounded-control transition-colors transition-base hover:text-content"
                >
                  {/* A seta só no primeiro degrau: ela diz "sobe", e subir é uma coisa só. */}
                  {i === 0 && <ArrowLeft className="size-4 shrink-0" aria-hidden />}
                  {degrau.rotulo}
                </Link>
              </li>
            ))}
          </ol>
        </nav>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {/*
           * `text-h1` fixo, sem `sm:text-3xl`: o título da página tem um tamanho
           * só. O degrau por breakpoint fazia a mesma tela ter duas hierarquias.
           * `text-content` explícito porque a regra base de h1-h4 saiu da folha.
           * `break-words`: um e-mail ou um nome sem espaço não pode empurrar a página.
           */}
          <h1 className="text-h1 break-words text-content">{titulo}</h1>
          {descricao !== undefined && (
            <p className="mt-1 text-body-lg break-words text-pretty text-content-muted">
              {descricao}
            </p>
          )}
        </div>
        {acoes !== undefined && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
      </div>
    </header>
  );
}
