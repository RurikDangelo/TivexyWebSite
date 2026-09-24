import { ArrowLeft, Users } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  DEFAULT_TIME_ZONE,
  type MembershipStatus,
  type PlanCode,
  type TenantStatus,
  formatInstant,
} from '@tivexy/core';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAccess } from '@/lib/auth/require';
import { embeddedCode } from '@/lib/supabase/embedded';
import { supabaseServer } from '@/lib/supabase/server';
import { sqlClient } from '@/server/db';

import { CicloDeVida, ConvidarUsuario, EditarCliente, TrocarPlano } from './forms';
import { type ExecucaoListada, MEMBRO_LABEL, MEMBRO_TOM, type MembroListado } from './state';

export const metadata: Metadata = { title: 'Cliente' };

const TOM: Record<TenantStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  active: 'success',
  provisioning: 'warning',
  suspended: 'danger',
  cancelled: 'neutral',
};

/**
 * A ficha de um cliente da plataforma.
 *
 * ## Lida com a sessão, passando pelo RLS
 *
 * Como a listagem, e pelo mesmo motivo: a política `tenants_read` já libera
 * tudo para `is_super_admin()`, e usar a chave de serviço aqui contornaria a
 * verificação em vez de exercitá-la. Se a política quebrar, esta tela some — e
 * sumir é o sintoma que se quer.
 *
 * ## O que NÃO é editável aqui, e por quê
 *
 * **O slug.** Ele é o subdomínio: está em links guardados, em e-mails já
 * enviados, e é por onde `tenantSlugFromHost()` descobre de quem é a
 * requisição. Trocá-lo por um campo de formulário quebraria tudo isso de uma
 * vez, em silêncio. Quando fizer falta, precisa vir com redirecionamento do
 * endereço antigo — o que é outra funcionalidade, não um campo a mais.
 */
export default async function ClientePage({ params }: { params: Promise<{ slug: string }> }) {
  await requireAccess('/admin');

  const { slug } = await params;
  const supabase = await supabaseServer();

  const { data: cliente } = await supabase
    .from('tenants')
    .select('id, slug, name, legal_name, document, status, settings, created_at, plans(code)')
    .eq('slug', slug)
    .maybeSingle();

  /*
   * 404, e não "sem permissão". Dizer que o cliente existe e não é seu já
   * entrega a existência dele — é o mesmo silêncio que `requireAccess` pratica
   * com tenant alheio.
   */
  if (cliente === null) notFound();

  const settings = (
    typeof cliente.settings === 'object' && cliente.settings !== null ? cliente.settings : {}
  ) as Record<string, unknown>;
  const fuso =
    typeof settings['core.timezone'] === 'string'
      ? (settings['core.timezone'] as string)
      : DEFAULT_TIME_ZONE;

  const [equipe, historico, modulos] = await Promise.all([
    lerEquipe(supabase, String(cliente.id)),
    lerHistorico(String(cliente.id)),
    lerModulos(supabase, String(cliente.id)),
  ]);

  const estado = cliente.status as TenantStatus;
  const plano = embeddedCode(cliente.plans) as PlanCode | null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href="/admin"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-content-muted hover:text-content"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Clientes
      </Link>

      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-2xl font-bold text-content">{String(cliente.name)}</h1>
          <Badge tone={TOM[estado] ?? 'neutral'}>{estado}</Badge>
          {plano !== null && <Badge>{plano}</Badge>}
        </div>
        <p className="mt-1 font-mono text-sm text-content-subtle">{slug}.tivexy.com.br</p>
      </header>

      <div className="flex flex-col gap-6">
        <Secao titulo="Dados" descricao="Nome, documento e fuso horário.">
          <EditarCliente
            slug={slug}
            nome={String(cliente.name)}
            razaoSocial={(cliente.legal_name as string | null) ?? null}
            documento={(cliente.document as string | null) ?? null}
            fuso={fuso}
          />
        </Secao>

        <Secao
          titulo="Plano"
          descricao={`${modulos.habilitados.length} ${
            modulos.habilitados.length === 1 ? 'módulo habilitado' : 'módulos habilitados'
          }${modulos.desabilitados.length > 0 ? `, ${modulos.desabilitados.length} desabilitados` : ''}.`}
        >
          <TrocarPlano slug={slug} atual={plano} />

          <div className="mt-4 flex flex-wrap gap-1.5">
            {modulos.habilitados.map((codigo) => (
              <Badge key={codigo} tone="success">
                {codigo}
              </Badge>
            ))}
            {modulos.desabilitados.map((codigo) => (
              <Badge key={codigo} tone="neutral">
                {codigo} · desligado
              </Badge>
            ))}
          </div>
        </Secao>

        <Secao
          titulo="Estado"
          descricao="Suspender bloqueia o acesso e preserva tudo. Cancelar é encerramento."
        >
          <CicloDeVida slug={slug} estado={estado} />
        </Secao>

        <Secao
          titulo="Equipe"
          descricao={`${equipe.length} ${equipe.length === 1 ? 'pessoa' : 'pessoas'}.`}
        >
          <Equipe membros={equipe} fuso={fuso} />
          <div className="mt-6 border-t border-line-subtle pt-6">
            <ConvidarUsuario slug={slug} />
          </div>
        </Secao>

        <Secao
          titulo="Provisionamentos"
          descricao="Cada tentativa de criar este cliente, com as etapas de cada uma."
        >
          <Historico execucoes={historico} fuso={fuso} />
        </Secao>
      </div>
    </div>
  );
}

function Secao({
  titulo,
  descricao,
  children,
}: {
  titulo: string;
  descricao: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{titulo}</CardTitle>
        <CardDescription>{descricao}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/* ── Leituras ──────────────────────────────────────────────────────────── */

async function lerEquipe(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  tenantId: string,
): Promise<MembroListado[]> {
  const { data } = await supabase
    .from('tenant_users')
    .select('user_id, status, joined_at, users(full_name, email), roles(name)')
    .eq('tenant_id', tenantId)
    .order('created_at');

  return (data ?? []).map((linha) => {
    const pessoa = (Array.isArray(linha.users) ? linha.users[0] : linha.users) as {
      full_name?: unknown;
      email?: unknown;
    } | null;
    const papel = (Array.isArray(linha.roles) ? linha.roles[0] : linha.roles) as {
      name?: unknown;
    } | null;

    return {
      userId: String(linha.user_id),
      nome: typeof pessoa?.full_name === 'string' ? pessoa.full_name : null,
      email: typeof pessoa?.email === 'string' ? pessoa.email : '—',
      papel: typeof papel?.name === 'string' ? papel.name : '—',
      status: linha.status as MembershipStatus,
      entrouEm: (linha.joined_at as string | null) ?? null,
    };
  });
}

async function lerModulos(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  tenantId: string,
): Promise<{ habilitados: string[]; desabilitados: string[] }> {
  const { data } = await supabase
    .from('tenant_modules')
    .select('is_enabled, modules(code)')
    .eq('tenant_id', tenantId);

  const habilitados: string[] = [];
  const desabilitados: string[] = [];

  for (const linha of data ?? []) {
    const codigo = embeddedCode(linha.modules);
    if (codigo === null) continue;
    (linha.is_enabled === true ? habilitados : desabilitados).push(codigo);
  }

  return { habilitados: habilitados.sort(), desabilitados: desabilitados.sort() };
}

/**
 * O histórico de provisionamentos, por SQL direto.
 *
 * Duas tabelas e uma agregação por execução. Montar isso por PostgREST daria
 * uma cadeia de chamadas para responder uma pergunta que é uma consulta só —
 * mesma razão da lista de falhas na página anterior.
 *
 * Falha aqui **não derruba a ficha**: o histórico é contexto, e não poder
 * mostrá-lo é menos grave do que não mostrar o cliente.
 */
async function lerHistorico(tenantId: string): Promise<ExecucaoListada[]> {
  try {
    const { rows } = await sqlClient().query(
      `select r.id, r.status, r.current_step, r.last_error, r.created_at, r.finished_at,
              coalesce(
                json_agg(
                  json_build_object('nome', s.step, 'status', s.status)
                  order by s.created_at
                ) filter (where s.id is not null),
                '[]'
              ) as etapas
         from public.provisioning_runs r
         left join public.provisioning_steps s on s.run_id = r.id
        where r.tenant_id = $1
        group by r.id
        order by r.created_at desc
        limit 10`,
      [tenantId],
    );

    return rows.map((linha) => ({
      id: String(linha.id),
      status: String(linha.status),
      etapa: (linha.current_step as string | null) ?? null,
      erro: (linha.last_error as string | null) ?? null,
      criadaEm: String(linha.created_at),
      terminadaEm: (linha.finished_at as string | null) ?? null,
      etapas: Array.isArray(linha.etapas)
        ? (linha.etapas as { nome: string; status: string }[])
        : [],
    }));
  } catch {
    return [];
  }
}

/* ── Blocos ────────────────────────────────────────────────────────────── */

function Equipe({ membros, fuso }: { membros: readonly MembroListado[]; fuso: string }) {
  if (membros.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-dashed border-line-subtle px-4 py-6">
        <Users className="size-5 shrink-0 text-content-subtle" aria-hidden />
        <p className="text-sm text-content-muted">
          Ninguém vinculado ainda. Sem administrador, este cliente não tem por onde entrar.
        </p>
      </div>
    );
  }

  return (
    <ul className="overflow-hidden rounded-lg border border-line-subtle">
      {membros.map((membro) => (
        <li
          key={membro.userId}
          className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line-subtle p-3 last:border-b-0"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-content">
              {membro.nome ?? membro.email}
            </span>
            <span className="block truncate text-xs text-content-subtle">{membro.email}</span>
          </span>
          <span className="text-xs text-content-muted">{membro.papel}</span>
          <Badge tone={MEMBRO_TOM[membro.status]}>{MEMBRO_LABEL[membro.status]}</Badge>
          {membro.entrouEm !== null && (
            <span className="text-xs text-content-subtle">
              desde {formatInstant(new Date(membro.entrouEm), fuso, { dateStyle: 'short' })}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** A cor de cada estado de execução. Só `failed` é vermelho — o resto é informação. */
const TOM_EXECUCAO: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  succeeded: 'success',
  failed: 'danger',
  running: 'warning',
  compensating: 'warning',
  compensated: 'neutral',
  pending: 'neutral',
};

function Historico({ execucoes, fuso }: { execucoes: readonly ExecucaoListada[]; fuso: string }) {
  if (execucoes.length === 0) {
    return (
      <p className="text-sm text-content-muted">
        Nenhuma execução registrada. Clientes criados antes do provisionamento pela tela não têm
        histórico — a ausência aqui não quer dizer que algo falhou.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {execucoes.map((execucao) => (
        <li key={execucao.id} className="rounded-lg border border-line-subtle p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={TOM_EXECUCAO[execucao.status] ?? 'neutral'}>{execucao.status}</Badge>
            <span className="text-xs text-content-subtle">
              {formatInstant(new Date(execucao.criadaEm), fuso)}
            </span>
            {execucao.terminadaEm !== null && (
              <span className="text-xs text-content-subtle">
                → {formatInstant(new Date(execucao.terminadaEm), fuso)}
              </span>
            )}
          </div>

          {execucao.erro !== null && (
            <p className="mt-2 rounded bg-danger/10 px-2 py-1.5 font-mono text-xs text-danger">
              {execucao.etapa !== null && <strong>{execucao.etapa}: </strong>}
              {execucao.erro}
            </p>
          )}

          {execucao.etapas.length > 0 && (
            <ol className="mt-2 flex flex-wrap gap-1.5">
              {execucao.etapas.map((etapa) => (
                <li
                  key={`${execucao.id}-${etapa.nome}`}
                  className="rounded border border-line-subtle px-1.5 py-0.5 font-mono text-[0.6875rem] text-content-muted"
                >
                  {etapa.nome}
                  <span
                    className={
                      etapa.status === 'succeeded'
                        ? 'ml-1 text-success'
                        : etapa.status === 'failed'
                          ? 'ml-1 text-danger'
                          : 'ml-1 text-content-subtle'
                    }
                  >
                    {etapa.status}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </li>
      ))}
    </ul>
  );
}
