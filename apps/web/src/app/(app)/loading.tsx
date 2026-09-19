/**
 * Estado de carregamento da área autenticada.
 *
 * Esqueleto com a forma do conteúdo, não um spinner centralizado: a página não
 * salta quando os dados chegam, e quem olha já entende o que vem.
 *
 * `animate-pulse` respeita `prefers-reduced-motion` — a regra global em
 * globals.css zera a duração de animação para quem pediu menos movimento.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8" aria-busy="true">
      <span className="sr-only" role="status">
        Carregando
      </span>

      <div className="animate-pulse space-y-8">
        <div className="space-y-3">
          <div className="h-8 w-56 rounded-md bg-surface-muted" />
          <div className="h-4 w-80 max-w-full rounded bg-surface-muted" />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-3 rounded-lg border border-line-subtle p-5">
              <div className="h-4 w-24 rounded bg-surface-muted" />
              <div className="h-3 w-full rounded bg-surface-muted" />
              <div className="h-3 w-5/6 rounded bg-surface-muted" />
              <div className="h-3 w-4/6 rounded bg-surface-muted" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
