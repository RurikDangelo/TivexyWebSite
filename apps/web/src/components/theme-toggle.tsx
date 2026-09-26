'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useEffect, useSyncExternalStore } from 'react';
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

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, readTheme, serverTheme);

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
      className="inline-flex items-center gap-0.5 rounded-full border border-line-subtle bg-surface-muted p-0.5"
    >
      {options.map(({ value, icon: Icon, label }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => choose(value)}
            className={cn(
              'grid size-7 place-items-center rounded-full transition-colors duration-150',
              active
                ? 'bg-surface-raised text-content-accent shadow-xs'
                : 'text-content-subtle hover:text-content-default',
            )}
          >
            <Icon className="size-3.5" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
