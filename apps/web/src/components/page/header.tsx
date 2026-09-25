import type { ReactNode } from 'react';

/**
 * O topo de toda tela da operação: título, uma linha de contexto, ações.
 *
 * O título chega pronto — quem o monta é `sectionTitle()`, no vocabulário do
 * tenant. Escrever o rótulo à mão aqui é o defeito que o menu já teve.
 */
export function PageHeader({
  titulo,
  descricao,
  acoes,
}: {
  titulo: string;
  descricao?: ReactNode;
  acoes?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-bold text-content sm:text-3xl">{titulo}</h1>
        {descricao !== undefined && <p className="mt-1 text-content-muted">{descricao}</p>}
      </div>
      {acoes !== undefined && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
    </header>
  );
}
