import type { ReactNode } from 'react';

import { Label } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Rótulo, controle, dica e erro — com os ids ligados.
 *
 * O controle chega pronto em `children`, e quem liga `aria-describedby` a ele
 * é quem monta: `describedBy(nome, erro, dica)` devolve a lista certa. Ligar à
 * mão em cada tela é o que faz um erro de campo existir na tela e não existir
 * para o leitor de tela.
 */
export function Field({
  nome,
  rotulo,
  obrigatorio = false,
  dica,
  erro,
  className,
  children,
}: {
  nome: string;
  rotulo: string;
  obrigatorio?: boolean;
  dica?: string;
  erro?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <Label htmlFor={nome}>
        {rotulo}
        {!obrigatorio && <span className="ml-1 text-xs text-content-subtle">(opcional)</span>}
      </Label>
      {children}
      {erro !== undefined && (
        <p id={`${nome}-erro`} role="alert" className="text-xs text-danger">
          {erro}
        </p>
      )}
      {dica !== undefined && (
        <p id={`${nome}-dica`} className="text-xs text-content-subtle">
          {dica}
        </p>
      )}
    </div>
  );
}

/** O `aria-describedby` do controle de um `Field`. */
export function describedBy(nome: string, erro?: string, dica?: string): string | undefined {
  const ids = [erro !== undefined && `${nome}-erro`, dica !== undefined && `${nome}-dica`].filter(
    Boolean,
  );
  return ids.length > 0 ? ids.join(' ') : undefined;
}
