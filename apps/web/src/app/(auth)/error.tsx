'use client';

import { RotateCcw, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';

import { AuthCard } from './auth-card';

/**
 * Fronteira de erro das telas de entrada.
 *
 * O grupo não tinha nenhuma: uma falha em `readSupabaseConfig()` ou em
 * `currentSession()` caía no erro padrão do Next — sem marca, em inglês, na
 * primeira tela que o cliente vê. Esta é a mesma composição de `(app)/error.tsx`
 * (ícone, digest, tentar de novo), dentro do cartão do layout de entrada, para
 * que a falha não pareça vir de outro produto.
 *
 * `error.message` não aparece: em produção costuma ser inútil para quem usa e
 * revelador demais para quem não deveria ver. O `digest` aparece porque é o que
 * liga o que a pessoa viu ao que ficou nos logs — sem ele, "deu erro" não é um
 * chamado investigável.
 */
export default function AuthError({
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
    <AuthCard
      titulo="Algo deu errado"
      descricao="A falha foi registrada. Tentar de novo costuma resolver quando é intermitente; se repetir, vale relatar com o código abaixo."
    >
      <div className="flex flex-col items-start gap-4">
        <span className="grid size-11 place-items-center rounded-pill bg-danger-soft">
          <TriangleAlert className="size-5 text-danger" aria-hidden />
        </span>

        {error.digest !== undefined && (
          <p className="text-caption text-content-subtle">
            código: <span className="select-all font-mono">{error.digest}</span>
          </p>
        )}

        <Button onClick={reset} variant="outline" size="lg" className="w-full">
          <RotateCcw aria-hidden />
          Tentar de novo
        </Button>

        <Link
          href="/entrar"
          className="rounded-control py-1 text-label text-content-accent underline-offset-4 hover:underline"
        >
          Voltar para a entrada
        </Link>
      </div>
    </AuthCard>
  );
}
