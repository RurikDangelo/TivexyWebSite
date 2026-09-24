import { Building2, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { type TenantStatus, isOperational } from '@tivexy/core';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { embeddedCode } from '@/lib/supabase/embedded';
import { supabaseServer } from '@/lib/supabase/server';
import { sqlClient } from '@/server/db';
import { cn } from '@/lib/utils';

import { FailedRuns, type FalhaResumo } from './failed-runs';

export const metadata: Metadata = { title: 'Clientes' };

/*
 * A lista de clientes da plataforma.
 *
 * Lida com `supabaseServer()`, que carrega a sessão e **passa pelo RLS** — não
 * com o cliente de serviço. A política `tenants_select` já libera tudo para
 * `is_super_admin()`; usar a chave secreta aqui seria contornar a verificação
 * em vez de exercitá-la. Se um dia a política quebrar, esta tela fica vazia, e
 * ficar vazia é o sintoma que se quer.
 */

const TOM: Record<TenantStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  active: 'success',
  provisioning: 'warning',
  suspended: 'danger',
  cancelled: 'neutral',
};

interface Linha {
  id: string;
  slug: string;
  name: string;
  status: TenantStatus;
  created_at: string;
  plans: unknown;
}

/**
 * As execuções que falharam e ainda não foram desfeitas.
 *
 * Lidas por SQL direto, e não pelo cliente do Supabase: a consulta cruza
 * `provisioning_runs` com `tenants` e lê dentro do `payload`, que é jsonb.
 * Montar isso por PostgREST daria uma cadeia de chamadas para responder uma
 * pergunta que é uma consulta só.
 */
async function falhasAbertas(): Promise<FalhaResumo[]> {
  const { rows } = await sqlClient().query(
    `select r.id,
            r.current_step,
            r.last_error,
            (r.payload -> 'request') is not null as tem_entrada,
            t.name, t.slug
       from public.provisioning_runs r
       join public.tenants t on t.id = r.tenant_id
      where r.status = 'failed'
      order by r.created_at desc
      limit 20`,
  );

  return rows.map((linha) => ({
    runId: String(linha.id),
    tenantName: String(linha.name),
    tenantSlug: String(linha.slug),
    etapa: String(linha.current_step ?? '—'),
    erro: String(linha.last_error ?? 'sem detalhe registrado'),
    temEntrada: linha.tem_entrada === true,
  }));
}

export default async function AdminPage() {
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from('tenants')
    .select('id, slug, name, status, created_at, plans(code)')
    .order('created_at', { ascending: false })
    .limit(100);

  const clientes = (data ?? []) as unknown as Linha[];

  /*
   * Falha de leitura aqui não pode derrubar a página inteira: a lista de
   * clientes é o conteúdo principal, e não poder mostrar o aviso de falha é
   * menos grave do que não mostrar nada.
   */
  let falhas: FalhaResumo[] = [];
  try {
    falhas = await falhasAbertas();
  } catch {
    falhas = [];
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-content">Clientes</h1>
          <p className="mt-1 text-content-muted">
            Todas as empresas da plataforma. {clientes.length} no total.
          </p>
        </div>
        <Link href="/admin/clientes/novo" className={cn(buttonVariants())}>
          <Plus aria-hidden />
          Novo cliente
        </Link>
      </header>

      <FailedRuns falhas={falhas} />

      {error !== null && (
        <Card className="mb-4 border-danger/30">
          <CardHeader>
            <CardTitle className="text-sm text-danger">Não consegui ler a lista</CardTitle>
            <CardDescription>{error.message}</CardDescription>
          </CardHeader>
        </Card>
      )}

      {clientes.length === 0 && error === null ? (
        <Card>
          <CardHeader>
            <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-surface-muted">
              <Building2 className="size-5 text-content-subtle" aria-hidden />
            </div>
            <CardTitle>Nenhum cliente ainda</CardTitle>
            <CardDescription>
              Criar o primeiro executa o provisionamento de verdade: tenant, módulos, papéis,
              administrador e auditoria.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/admin/clientes/novo"
              className={cn(buttonVariants({ variant: 'outline' }))}
            >
              Criar o primeiro cliente
            </Link>
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {clientes.map((cliente) => (
            <li
              key={cliente.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-line-subtle bg-surface-raised p-4 transition-colors hover:border-line-strong"
            >
              {/*
                A linha inteira vira link para a ficha. É `Link` e não `form`
                porque abrir a ficha é navegação, não escrita — e navegação por
                link é o que faz "abrir em nova aba" funcionar.
              */}
              <Link href={`/admin/clientes/${cliente.slug}`} className="min-w-0 flex-1">
                <span className="block truncate font-medium text-content">{cliente.name}</span>
                <span className="block truncate font-mono text-xs text-content-subtle">
                  {cliente.slug}.tivexy.com.br
                </span>
              </Link>

              {embeddedCode(cliente.plans) !== null && <Badge>{embeddedCode(cliente.plans)}</Badge>}
              <Badge tone={TOM[cliente.status] ?? 'neutral'}>{cliente.status}</Badge>

              {!isOperational(cliente.status) && (
                <span className="w-full text-xs text-content-subtle sm:w-auto">
                  não opera — quem entrar cai em /preparando
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
