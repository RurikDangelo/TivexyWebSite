import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * O que a tela diz quando não há nada.
 *
 * Diz o que fazer para haver — é a regra do painel, e vale para toda lista.
 * Uma área em branco não distingue "ainda não cadastrou" de "a consulta
 * falhou", e a segunda precisa de outra resposta.
 */
export function EmptyState({
  icone: Icone,
  titulo,
  children,
  acao,
}: {
  icone: LucideIcon;
  titulo: string;
  children?: ReactNode;
  acao?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-line px-6 py-12 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-surface-muted">
        <Icone className="size-5 text-content-subtle" aria-hidden />
      </span>
      <div className="max-w-md space-y-1">
        <h2 className="font-medium text-content">{titulo}</h2>
        {children !== undefined && <div className="text-sm text-content-muted">{children}</div>}
      </div>
      {acao}
    </div>
  );
}
