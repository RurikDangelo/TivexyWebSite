import { LogOut, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';

import { sair } from '@/app/(auth)/actions';
import { AdminTabs } from '@/components/admin/admin-tabs';
import { AbasPendentes } from '@/components/admin/pending-tabs';
import { Logo } from '@/components/brand/logo';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ToastProvider } from '@/components/ui/toast';

/**
 * A casca do painel da plataforma — ADR-005.
 *
 * O que ela **não** tem é tão importante quanto o que ela tem: nenhuma sidebar
 * de tenant, nenhum seletor de empresa, nenhum sino de avisos. Esses três
 * pertencem ao plano do cliente, e o painel é o plano de controle de todos os
 * clientes. Um Super Admin que também opera uma empresa tem dois contextos, e
 * era justamente a mistura deles numa casca só que o dono contestou.
 *
 * Por isso ela é uma casca inteira, e não um `AppShell` com props desligadas:
 * "sem sidebar, sem seletor, sem sino" desligado por prop volta ligado no
 * primeiro descuido, e o `AppShell` carrega `requireSession()`, vocabulário do
 * tenant e a derivação do menu do cliente — coisas que aqui não têm sentido.
 *
 * ## Server Component
 *
 * Tudo aqui é servidor. A única folha cliente é `AdminTabs`, que precisa do
 * caminho atual. "Sair" é um `<form>` com Server Action, e não um link, pela
 * mesma razão do menu do cliente: um `<a href="/sair">` seria disparado pelo
 * pré-carregamento do próprio navegador.
 *
 * ## O que dá a sensação de "outro sistema"
 *
 * A faixa do topo é `surface-panel` com borda embaixo, o selo "Plataforma" ao
 * lado da marca, e o e-mail de quem está logado escrito por extenso — não
 * atrás de um avatar. Quem entra aqui precisa ver, sem clicar, com que conta
 * está mexendo em todos os clientes.
 */
export interface AdminShellProps {
  children: ReactNode;
  /** O e-mail da sessão. `null` não deveria acontecer — o layout já exigiu acesso. */
  email: string | null;
}

export function AdminShell({ children, email }: AdminShellProps) {
  return (
    /*
     * A região `aria-live` das telas do painel. É a mesma do app do cliente
     * porque as telas movidas para cá já emitiam Toast — sem este provedor
     * elas quebrariam em tempo de execução, não em compilação.
     */
    <ToastProvider>
      <div className="flex min-h-dvh flex-col bg-surface-page">
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[var(--z-overlay)] focus:rounded-control focus:bg-surface-brand focus:px-4 focus:py-2 focus:text-label focus:text-content-on-brand"
        >
          Pular para o conteúdo
        </a>

        <header className="sticky top-0 z-[var(--z-header)] border-b border-line-subtle bg-surface-panel">
          <div className="mx-auto flex w-full max-w-[var(--content-max)] flex-col px-4 sm:px-6 lg:px-8 2xl:px-10">
            <div className="flex h-[var(--header-h)] shrink-0 items-center gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                {/*
                 * A marca da Tivexy, e nunca a do cliente. Este painel não
                 * está dentro de empresa nenhuma; pôr o logo de um cliente
                 * aqui seria sugerir um contexto que não existe.
                 */}
                <Logo tamanho="sm" className="text-content" label="Tivexy" />
                <Badge tone="brand" tamanho="xs" Icone={ShieldCheck}>
                  Plataforma
                </Badge>
              </div>

              <div className="ml-auto flex min-w-0 shrink items-center gap-2 sm:gap-3">
                {/*
                 * Escrito, não escondido atrás de um avatar. Antes de suspender
                 * um cliente ou desfazer um provisionamento, quem administra
                 * precisa ler com que conta está logado sem abrir um menu.
                 */}
                <span className="hidden min-w-0 flex-col items-end leading-tight sm:flex">
                  <span className="text-caption text-content-subtle">Conectado como</span>
                  <span className="max-w-60 truncate text-label text-content">
                    {email ?? 'sem e-mail na sessão'}
                  </span>
                </span>

                <form action={sair}>
                  <Button type="submit" variant="outline" size="sm">
                    <LogOut aria-hidden />
                    Sair
                  </Button>
                </form>
              </div>
            </div>

            {/* A fileira encosta na borda de baixo do header: a régua das abas é a do header. */}
            <AdminTabs className="-mb-px border-b-0" />
          </div>
        </header>

        <main
          id="conteudo"
          className="mx-auto w-full max-w-[var(--content-max)] flex-1 px-4 py-6 sm:px-6 lg:px-8 2xl:px-10"
        >
          {children}
        </main>

        {/*
         * No rodapé, e não no topo: é informação de estado do painel, não uma
         * navegação. Quem abre o painel precisa primeiro do que existe; o que
         * não existe fica ao alcance de uma rolagem, escrito por extenso.
         */}
        <footer className="mx-auto w-full max-w-[var(--content-max)] px-4 pb-8 sm:px-6 lg:px-8 2xl:px-10">
          <AbasPendentes />
        </footer>
      </div>
    </ToastProvider>
  );
}
