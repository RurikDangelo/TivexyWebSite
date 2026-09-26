import { AlertCircle, AlertTriangle, CheckCircle2, Info, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export type TomDeMensagem = 'danger' | 'success' | 'warning' | 'neutral';

/**
 * Fundo e ícone por tom.
 *
 * Fundo sempre em `*-soft`, nunca `bg-danger/10`: opacidade sobre token de
 * estado depende da superfície atrás, e o mesmo erro acabava saindo em duas
 * cores — uma dentro do card, outra sobre a página.
 */
const TONS: Record<TomDeMensagem, { classe: string; Icone: LucideIcon }> = {
  danger: { classe: 'bg-danger-soft text-danger', Icone: AlertCircle },
  success: { classe: 'bg-success-soft text-success', Icone: CheckCircle2 },
  warning: { classe: 'bg-warning-soft text-warning', Icone: AlertTriangle },
  neutral: { classe: 'bg-surface-sunken text-content-muted', Icone: Info },
};

export interface FormMessageProps {
  tom: TomDeMensagem;
  /** `alert` interrompe o leitor de tela; `status` espera a pausa dele. */
  anuncio?: 'alert' | 'status';
  className?: string;
  children: ReactNode;
}

/** A faixa de retorno de um formulário. Os três atalhos abaixo cobrem o uso normal. */
export function FormMessage({ tom, anuncio, className, children }: FormMessageProps) {
  const { classe, Icone } = TONS[tom];
  return (
    <p
      role={anuncio ?? (tom === 'danger' ? 'alert' : 'status')}
      className={cn(
        'flex items-start gap-2 rounded-control px-3 py-2 text-body',
        classe,
        className,
      )}
    >
      <Icone className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/**
 * O erro do formulário inteiro — o que não é de um campo só.
 *
 * `role="alert"`: o leitor de tela anuncia sem que a pessoa precise procurar.
 * Quem errou costuma estar com o foco ainda no botão.
 */
export function FormError({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <FormMessage tom="danger" className={className}>
      {children}
    </FormMessage>
  );
}

/** A confirmação do que deu certo. `role="status"`, que não interrompe. */
export function FormSuccess({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <FormMessage tom="success" className={className}>
      {children}
    </FormMessage>
  );
}

/** O que deu certo pela metade, ou o que vai doer depois. */
export function FormWarning({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <FormMessage tom="warning" className={className}>
      {children}
    </FormMessage>
  );
}

/**
 * O formato de estado que toda Server Action do app devolve.
 *
 * Os campos são opcionais e aceitam `null` porque cada módulo declara o seu
 * (`ConfigState`, `AcaoState`, `EquipeState`…) e todos convergem nestes dois.
 */
export interface EstadoDeRetorno {
  erro?: string | null;
  ok?: string | null;
}

export interface FormFeedbackProps {
  estado: EstadoDeRetorno;
  className?: string;
}

/**
 * O retorno de uma ação, onde ela aconteceu.
 *
 * Erro antes de sucesso, e um de cada vez: quando a segunda tentativa falha
 * depois de a primeira ter dado certo, deixar as duas faixas na tela faz a
 * pessoa acreditar na verde e ir embora achando que salvou.
 *
 * O que sobra de específico — o link de convite da tela de equipe, por
 * exemplo — continua sendo irmão deste componente, não prop dele.
 */
export function FormFeedback({ estado, className }: FormFeedbackProps) {
  if (estado.erro) return <FormError className={className}>{estado.erro}</FormError>;
  if (estado.ok) return <FormSuccess className={className}>{estado.ok}</FormSuccess>;
  return null;
}
