import { AlertTriangle, CheckCircle2, CircleDashed, Lock } from 'lucide-react';
import type { Metadata } from 'next';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Visão geral' };

/*
 * Esta NÃO é a dashboard do produto. É o estado real da plataforma enquanto o
 * Core não existe. Nenhum número aqui é de negócio — não há banco conectado.
 * A fonte de verdade é docs/PROJECT_STATE.md; esta tela é um resumo dela.
 */

const pronto = [
  'Monorepo com apps/site e apps/web independentes',
  'Design system da marca (claro e escuro)',
  'Casca da aplicação: navegação, cabeçalho, responsividade',
  'Componentes base: botão, card, badge, campo',
];

const emConstrucao = [
  'Modelagem do banco (tenants, planos, usuários, permissões)',
  'Autenticação e sessão',
  'Multi-tenancy com RLS',
  'Provisionamento de tenant — prioridade zero',
  'RBAC e painel Super Admin',
];

const bloqueado = [
  { item: 'Banco, autenticação e storage', porque: 'Projeto Supabase da Tivexy' },
  { item: 'WhatsApp e Instagram', porque: 'Meta Business + WhatsApp Business API' },
  { item: 'Emissão fiscal', porque: 'Provedor fiscal + certificado digital' },
  { item: 'Camada de IA', porque: 'Credenciais OpenAI' },
];

export default function PainelPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8">
        <h1 className="font-display text-2xl font-bold text-content sm:text-3xl">Tivexy Core</h1>
        <p className="mt-1.5 max-w-prose text-content-muted">
          Plataforma SaaS multi-tenant. ERP, CRM e Admin sobre um núcleo único.
        </p>
      </header>

      <div
        role="note"
        className="mb-8 flex gap-3 rounded-lg border border-line-accent bg-surface-accent-soft p-4"
      >
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-content-accent" aria-hidden />
        <div className="text-sm">
          <p className="font-medium text-content">Esta é a casca da aplicação, não o produto.</p>
          <p className="mt-1 text-content-muted">
            Não há banco de dados conectado, autenticação nem dado real. Nenhum número nesta tela é
            métrica de negócio. O estado completo de cada módulo está em{' '}
            <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-xs">
              docs/PROJECT_STATE.md
            </code>
            .
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-success" aria-hidden />
              <CardTitle>Pronto</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2.5 text-sm text-content-muted">
              {pronto.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-1.5 size-1 shrink-0 rounded-full bg-success" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CircleDashed className="size-4 text-content-subtle" aria-hidden />
              <CardTitle>A construir</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2.5 text-sm text-content-muted">
              {emConstrucao.map((item, index) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-px shrink-0 font-mono text-xs text-content-subtle">
                    {index + 1}.
                  </span>
                  {item}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Lock className="size-4 text-warning" aria-hidden />
              <CardTitle>Bloqueado</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm">
              {bloqueado.map(({ item, porque }) => (
                <li key={item}>
                  <p className="text-content-default">{item}</p>
                  <p className="mt-0.5 text-xs text-content-subtle">Depende de: {porque}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <section className="mt-8">
        <h2 className="mb-3 font-mono text-xs font-medium uppercase tracking-wider text-content-subtle">
          Ordem de construção
        </h2>
        <Card>
          <CardContent className="pt-5">
            <ol className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
              {[
                'Banco',
                'Auth',
                'Multi-tenancy',
                'Provisionamento',
                'RBAC',
                'Admin',
                'CRM',
                'ERP',
              ].map((etapa, index, all) => (
                <li key={etapa} className="flex items-center gap-2">
                  <Badge tone={etapa === 'Provisionamento' ? 'brand' : 'neutral'}>{etapa}</Badge>
                  {index < all.length - 1 && (
                    <span className="text-content-subtle" aria-hidden>
                      →
                    </span>
                  )}
                </li>
              ))}
            </ol>
            <p className="mt-4 text-sm text-content-muted">
              Provisionamento é prioridade zero: é o que transforma a plataforma em operação SaaS.
              Blueprint Engine e IA vêm depois de um módulo real funcionando.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
