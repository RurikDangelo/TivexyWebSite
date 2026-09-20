'use client';

import { Lock } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Viewer } from '@tivexy/core';
import { navigation, statusLabel, type NavGroup, type NavItem } from '@/config/navigation';
import { cn } from '@/lib/utils';

const itemBase =
  'group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors duration-150';

function Item({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const pathname = usePathname();
  const Icon = item.icon;

  if (item.status !== 'ready') {
    const blocked = item.status === 'blocked';
    return (
      <span
        aria-disabled="true"
        title={
          blocked
            ? `Bloqueado — ${item.blockedBy}`
            : 'Ainda não construído. Ver docs/PROJECT_STATE.md'
        }
        className={cn(itemBase, 'cursor-not-allowed text-content-subtle')}
      >
        <Icon className="size-4 shrink-0 opacity-60" aria-hidden />
        <span className="truncate">{item.label}</span>
        {blocked ? (
          <Lock className="ml-auto size-3 shrink-0 opacity-60" aria-hidden />
        ) : (
          <span
            className="ml-auto size-1.5 shrink-0 rounded-full bg-current opacity-40"
            aria-hidden
          />
        )}
        <span className="sr-only">({statusLabel[item.status]})</span>
      </span>
    );
  }

  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        itemBase,
        active
          ? 'bg-surface-accent-soft font-medium text-content-accent'
          : 'text-content-default hover:bg-surface-muted',
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

/**
 * O que esta pessoa vê no menu.
 *
 * A regra de hoje é uma só, e é a que tem consequência: **o grupo de
 * administração da plataforma não existe para quem não é Super Admin.** Não
 * desabilitado, não com cadeado — ausente. Um item "Super Admin" acinzentado
 * no menu de um cliente conta a ele que existe um painel acima do dele e
 * convida a tentar o endereço. A guarda negaria, e o RLS também, mas a
 * informação já teria sido dada.
 *
 * Esconder por módulo desabilitado virá quando houver módulo pronto para
 * esconder. Hoje todos estão em construção e nenhum abre tela: filtrar agora
 * seria escrever uma regra sem como conferir se ela acerta.
 */
function visiveis(viewer: Viewer): NavGroup[] {
  return navigation.flatMap((group) => {
    if (group.label !== 'Administração') return [group];
    if (!viewer.isSuperAdmin) return [];
    return [
      {
        ...group,
        items: group.items.map((item) => ({ ...item, status: 'ready' as const })),
      },
    ];
  });
}

export function SidebarNav({ viewer, onNavigate }: { viewer: Viewer; onNavigate?: () => void }) {
  return (
    <nav aria-label="Navegação principal" className="flex flex-col gap-5 px-3 py-4">
      {visiveis(viewer).map((group, index) => (
        <div key={group.label ?? `group-${index}`} className="flex flex-col gap-0.5">
          {group.label && (
            <h2 className="px-2.5 pb-1 font-mono text-[0.6875rem] font-medium uppercase tracking-wider text-content-subtle">
              {group.label}
            </h2>
          )}
          {group.items.map((item) => (
            <Item key={item.href} item={item} onNavigate={onNavigate} />
          ))}
        </div>
      ))}
    </nav>
  );
}
