'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useEffect, useSyncExternalStore } from 'react';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'tivexy-theme';
/** Avisa as outras instâncias desta aba; `storage` só dispara entre abas. */
const CHANGE_EVENT = 'tivexy:theme';

const options: { value: Theme; icon: typeof Sun; label: string }[] = [
  { value: 'light', icon: Sun, label: 'Tema claro' },
  { value: 'system', icon: Monitor, label: 'Seguir o sistema' },
  { value: 'dark', icon: Moon, label: 'Tema escuro' },
];

/*
 * A preferência mora no localStorage, que é estado externo ao React.
 * `useSyncExternalStore` é o jeito certo de ler isso com SSR: renderiza
 * "system" no servidor e troca para o valor real logo após a hidratação,
 * sem effect que chama setState e sem descompasso de hidratação.
 */

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'dark' || stored === 'light' ? stored : 'system';
  } catch {
    /* modo privado ou storage bloqueado */
    return 'system';
  }
}

const serverTheme = (): Theme => 'system';

function resolve(theme: Theme) {
  return theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    ? 'dark'
    : 'light';
}

export interface ThemeToggleProps {
  /**
   * `vertical` existe para o rodapé da sidebar colapsada: três pílulas de 28px
   * lado a lado ocupam 90px, e o trilho de ícones tem 64px. Empilhar mantém as
   * três opções visíveis — virar um botão que cicla entre elas custaria o
   * `radiogroup`, que é o que anuncia qual tema está escolhido.
   */
  orientacao?: 'horizontal' | 'vertical';
  className?: string;
}

export function ThemeToggle({ orientacao = 'horizontal', className }: ThemeToggleProps) {
  const theme = useSyncExternalStore(subscribe, readTheme, serverTheme);
  const vertical = orientacao === 'vertical';

  /* Efeito só de DOM: aplica a classe e acompanha o sistema quando em "system". */
  useEffect(() => {
    const apply = () =>
      document.documentElement.classList.toggle('dark', resolve(theme) === 'dark');
    apply();
    if (theme !== 'system') return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, [theme]);

  function choose(next: Theme) {
    try {
      if (next === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* sem storage a escolha não persiste; a classe abaixo ainda vale para esta sessão */
      document.documentElement.classList.toggle('dark', resolve(next) === 'dark');
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }

  return (
    <div
      role="radiogroup"
      aria-label="Tema da interface"
      aria-orientation={orientacao}
      className={cn(
        'inline-flex gap-0.5 rounded-pill border border-line-subtle bg-surface-muted p-0.5',
        vertical ? 'flex-col items-center' : 'items-center',
        className,
      )}
    >
      {options.map(({ value, icon: Icon, label }) => {
        const active = theme === value;
        return (
          /*
           * `<Tooltip>` no lugar do `title=` nativo: o `title` só aparece no
           * ponteiro, e estes três botões são só ícone — quem chega tabulando
           * ficaria sem saber qual é qual. O `aria-label` continua sendo o nome.
           */
          <Tooltip key={value} conteudo={label} lado={vertical ? 'direita' : 'cima'}>
            <button
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={label}
              onClick={() => choose(value)}
              className={cn(
                'grid size-7 place-items-center rounded-pill transition-colors transition-base',
                active
                  ? 'bg-surface-elevated text-content-accent shadow-card'
                  : 'text-content-subtle hover:text-content-default',
              )}
            >
              <Icon className="size-3.5" aria-hidden />
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
