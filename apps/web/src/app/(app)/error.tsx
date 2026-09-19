'use client';

import { RotateCcw, TriangleAlert } from 'lucide-react';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Fronteira de erro da área autenticada.
 *
 * Mostra que algo falhou e oferece tentar de novo — sem despejar a mensagem
 * técnica na tela. `error.message` de produção costuma ser inútil para quem
 * usa e revelador demais para quem não deveria ver.
 *
 * O `digest` aparece porque é o que liga o que a pessoa viu ao que ficou nos
 * logs do servidor. Sem ele, "deu erro" não é um chamado investigável.
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
    <div className="mx-auto flex max-w-lg flex-col items-center gap-5 px-6 py-20 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-danger-soft">
        <TriangleAlert className="size-6 text-danger" aria-hidden />
      </span>

      <div className="space-y-2">
        <h1 className="font-display text-xl font-bold text-content">Algo deu errado</h1>
        <p className="text-content-muted">
          A falha foi registrada. Tentar de novo costuma resolver quando é intermitente; se repetir,
          vale relatar com o código abaixo.
        </p>
      </div>

      {error.digest && (
        <p className="font-mono text-xs text-content-subtle">
          código: <span className="select-all">{error.digest}</span>
        </p>
      )}

      <Button onClick={reset} variant="outline">
        <RotateCcw aria-hidden />
        Tentar de novo
      </Button>
    </div>
  );
}
