import { AlertTriangle, CheckCircle2, CircleDashed, Lock } from 'lucide-react';
import type { Metadata } from 'next';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Visão geral' };

/*
 * Esta NÃO é a dashboard do produto. É o estado real da plataforma enquanto o
 * Core não tem módulo de negócio. Há banco, há sessão e há provisionamento —
 * o que não há é dado de negócio, porque CRM e ERP ainda não existem.
 * A fonte de verdade é docs/PROJECT_STATE.md; esta tela é um resumo dela.
 */

const pronto = [
  'Monorepo com apps/site e apps/web independentes',
  'Esquema do Core aplicado: 15 tabelas, RLS e isolamento entre tenants',
  'Autenticação, sessão e guarda de rota ligadas à requisição',
  'Provisionamento de cliente pela tela: criar, retomar e desfazer',
  'Blueprint de nicho: contrato, validação e três nichos',
  'CRM: esquema completo e a tela de leads, com o vocabulário do nicho',
  'Design system, casca da aplicação e componentes base',
];

const emConstrucao = [
  'Aceitar convite pela própria tela',
  'Editar cliente: suspender, trocar plano, convidar usuário',
  'CRM: conversão de lead, contatos, contas e funil',
  'ERP — não começou',
];

const bloqueado = [
  {
    item: 'Entrega de convite por e-mail',
    porque: 'SMTP próprio no Supabase — a conta é criada, o e-mail não sai',
  },
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
          <p className="font-medium text-content">
            Esta tela mostra o estado da plataforma, não dados do seu negócio.
          </p>
          <p className="mt-1 text-content-muted">
            O Core está de pé: banco aplicado, sessão, permissões e provisionamento de cliente. O
            que ainda não existe são os módulos de negócio —{' '}
            <strong className="font-medium">nenhum número aqui é métrica</strong>, porque não há CRM
            nem ERP para medir. O estado completo de cada módulo está em{' '}
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
              Blueprint como <strong className="font-medium">configuração de nicho</strong> foi
              construído junto com ele (ADR-003); o motor de esquema em tempo de execução continua
              adiado até existir um módulo de negócio real, e a IA depois dele.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
