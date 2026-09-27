'use client';

import { usePathname } from 'next/navigation';

import { Tabs } from '@/components/ui/tabs';

import { ABAS_COM_TELA, abaAtiva } from './tabs';

/**
 * A fileira de abas do painel da plataforma.
 *
 * Cliente porque precisa do caminho atual, e **só** por isso: é folha. O
 * conteúdo da página é Server Component e chega ao layout já pronto, sem
 * atravessar esta árvore.
 *
 * Consome o `Tabs` de `components/ui`, que já resolve o que importa: cada aba
 * é um link de verdade — entra no histórico, abre em nova aba pelo meio do
 * mouse, e o leitor de tela anuncia "página atual" na ativa. Reimplementar a
 * fileira aqui só para mudar a cor seria trocar isso por um `role="tablist"`
 * mentiroso, que é o que o próprio primitivo documenta não ser.
 *
 * As abas que o dono pediu e não existem **não entram aqui** — elas não são
 * links. Ficam em `AbasPendentes`, escritas por extenso. Ver `tabs.ts`.
 */
export function AdminTabs({ className }: { className?: string }) {
  const ativa = abaAtiva(usePathname());

  return (
    <Tabs
      rotulo="Painel da plataforma"
      itens={ABAS_COM_TELA.map((aba) => ({
        chave: aba.chave,
        rotulo: aba.rotulo,
        href: aba.href,
      }))}
      ativa={ativa}
      className={className}
    />
  );
}
