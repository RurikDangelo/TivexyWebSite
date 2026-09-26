import { AlertCircle, CheckCircle2 } from 'lucide-react';

/**
 * O erro do formulário inteiro — o que não é de um campo só.
 *
 * `role="alert"`: o leitor de tela anuncia sem que a pessoa precise procurar.
 * Quem errou costuma estar com o foco ainda no botão.
 */
export function FormError({ children }: { children: string }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

/** A confirmação do que deu certo. `role="status"`, que não interrompe. */
export function FormSuccess({ children }: { children: string }) {
  return (
    <p role="status" className="flex items-center gap-1.5 text-sm text-success">
      <CheckCircle2 className="size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
