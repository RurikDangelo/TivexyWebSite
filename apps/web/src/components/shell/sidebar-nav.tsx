'use client';

import { Lock } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Viewer } from '@tivexy/core';
import { statusLabel, visibleNavigation, type VisibleItem } from '@/config/navigation';
import type { Terms } from '@/lib/terms/vocabulary';
import { cn } from '@/lib/utils';

const itemBase =
  'group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors duration-150';

function Item({ item, onNavigate }: { item: VisibleItem; onNavigate?: () => void }) {
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
 * O menu desta pessoa, nesta empresa.
 *
 * Quem decide o que aparece e com que nome é `visibleNavigation()`, que é pura
 * e tem teste: a regra de acesso é a da rota, e o rótulo é o do vocabulário do
 * tenant. Aqui só se desenha.
 */
export function SidebarNav({
  viewer,
  terms,
  onNavigate,
}: {
  viewer: Viewer;
  terms: Terms;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Navegação principal" className="flex flex-col gap-5 px-3 py-4">
      {visibleNavigation(viewer, terms).map((group, index) => (
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
