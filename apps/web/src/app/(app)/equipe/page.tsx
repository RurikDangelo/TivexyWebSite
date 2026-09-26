import { type MembershipStatus, can, dateIn } from '@tivexy/core';
import { Users } from 'lucide-react';
import type { Metadata } from 'next';

import { FormError } from '@/components/form/messages';
import { EmptyState } from '@/components/page/empty-state';
import { PageHeader } from '@/components/page/header';
import { NoTenant } from '@/components/page/no-tenant';
import { sectionTitle } from '@/config/navigation';
import { requireAccess } from '@/lib/auth/require';
import { formatDate } from '@/lib/format';
import { tenantTimeZone } from '@/lib/settings/current';
import { supabaseServer } from '@/lib/supabase/server';
import { currentTerms } from '@/lib/terms/current';

import type { MembroNaTela, Papel } from './state';
import { InviteForm, MemberRow } from './team-forms';

export async function generateMetadata(): Promise<Metadata> {
  return { title: sectionTitle(await currentTerms(), '/equipe') };
}

const ORDEM: Record<MembershipStatus, number> = { active: 0, invited: 1, suspended: 2 };

function relacao<T>(valor: unknown): T | null {
  const linha = Array.isArray(valor) ? valor[0] : valor;
  return (linha ?? null) as T | null;
}

/**
 * Quem trabalha nesta empresa, com que papel, e em que situação.
 *
 * As regras que importam moram no banco — a empresa não fica sem
 * administrador, e ninguém dá um papel com mais poder que o seu. A tela
 * explica quando uma delas recusa.
 */
export default async function EquipePage() {
  const { choice, viewer } = await requireAccess('/equipe');
  if (choice.kind !== 'resolved') return <NoTenant />;

  const tenantId = choice.tenant.id;
  const terms = await currentTerms();
  const podeEditar = can(viewer, 'core.users.write');
  const fuso = await tenantTimeZone();
  const supabase = await supabaseServer();

  const [membrosR, papeisR] = await Promise.all([
    supabase
      .from('tenant_users')
      .select(
        'id, status, joined_at, user_id, role_id, users!tenant_users_user_id_fkey(full_name, email), roles(name)',
      )
      .eq('tenant_id', tenantId),
    supabase
      .from('roles')
      .select('id, name, is_system, tenant_id')
      .or(`tenant_id.is.null,tenant_id.eq.${tenantId}`)
      .order('is_system', { ascending: false })
      .order('name'),
  ]);

  const membros: MembroNaTela[] = (membrosR.data ?? [])
    .map((m) => {
      const pessoa = relacao<{ full_name: string | null; email: string | null }>(m.users);
      const papel = relacao<{ name: string }>(m.roles);
      return {
        vinculoId: String(m.id),
        nome: pessoa?.full_name?.trim() || pessoa?.email || 'Sem nome',
        email: pessoa?.email ?? null,
        papelId: String(m.role_id),
        papel: papel?.name ?? '—',
        status: m.status as MembershipStatus,
        desde: typeof m.joined_at === 'string' ? formatDate(dateIn(m.joined_at, fuso)) : null,
        voce: m.user_id === viewer.userId,
      };
    })
    .sort((a, b) => ORDEM[a.status] - ORDEM[b.status] || a.nome.localeCompare(b.nome, 'pt-BR'));

  const papeis: Papel[] = (papeisR.data ?? []).map((p) => ({
    id: String(p.id),
    nome: String(p.name),
    sistema: p.is_system === true,
  }));

  const ativos = membros.filter((m) => m.status === 'active').length;
  const pendentes = membros.filter((m) => m.status === 'invited').length;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        titulo={sectionTitle(terms, '/equipe')}
        descricao={`${ativos} com acesso${pendentes > 0 ? `, ${pendentes} com convite pendente` : ''}.`}
      />

      {podeEditar && (
        <div className="mb-6">
          <InviteForm papeis={papeis} />
        </div>
      )}

      {membrosR.error !== null && (
        <div className="mb-4">
          <FormError>Não consegui ler a equipe agora. Recarregue a página em instantes.</FormError>
        </div>
      )}

      {membros.length === 0 && membrosR.error === null ? (
        <EmptyState icone={Users} titulo="Ninguém por aqui ainda">
          Convide a primeira pessoa com o botão acima.
        </EmptyState>
      ) : (
        <ul className="overflow-hidden rounded-lg border border-line-subtle bg-surface-raised">
          {membros.map((m) => (
            <MemberRow key={m.vinculoId} membro={m} papeis={papeis} podeEditar={podeEditar} />
          ))}
        </ul>
      )}
    </div>
  );
}
