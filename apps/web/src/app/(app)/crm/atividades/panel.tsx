import { can, todayIn } from '@tivexy/core';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ALVOS, type TipoDeAlvo } from '@/lib/crm/activity-input';
import { currentSession } from '@/lib/auth/session';
import { tenantMembers } from '@/lib/members';
import { tenantTimeZone } from '@/lib/settings/current';
import { supabaseServer } from '@/lib/supabase/server';
import { currentTerms } from '@/lib/terms/current';
import { capitalizar, termOf } from '@/lib/terms/vocabulary';

import { NewActivityForm } from './activity-form';
import { AgendaList } from './agenda';
import { loadAgenda } from './load';

/**
 * A agenda de um registro só, dentro da página dele.
 *
 * É a mesma `loadAgenda()` da página da agenda, filtrada pelo alvo, e o mesmo
 * formulário com o alvo já escolhido. Quem não lê atividades não vê o painel
 * — a página continua inteira sem ele.
 */
export async function ActivityPanel({
  tenantId,
  tipo,
  id,
  nome,
}: {
  tenantId: string;
  tipo: TipoDeAlvo;
  id: string;
  nome: string;
}) {
  const { viewer } = await currentSession();
  if (!can(viewer, 'crm.activities.read')) return null;

  const [terms, fuso, membros, supabase] = await Promise.all([
    currentTerms(),
    tenantTimeZone(),
    tenantMembers(tenantId),
    supabaseServer(),
  ]);
  const rotulo = termOf(terms, 'crm.activities');
  const podeEditar = can(viewer, 'crm.activities.write');

  const [agenda, tiposR] = await Promise.all([
    loadAgenda(tenantId, fuso, membros, { alvo: { coluna: ALVOS[tipo], id } }),
    supabase
      .from('crm_activity_types')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .order('position')
      .order('name'),
  ]);
  const vazia = agenda.secoes.every((s) => s.itens.length === 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{capitalizar(rotulo.plural)}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {podeEditar && (
          <NewActivityForm
            singular={rotulo.singular}
            hoje={todayIn(fuso)}
            tipos={(tiposR.data ?? []).map((t) => ({ id: String(t.id), nome: String(t.name) }))}
            membros={membros.map((m) => ({ id: m.userId, nome: m.nome }))}
            alvoFixo={{ valor: `${tipo}:${id}`, nome }}
          />
        )}
        {vazia ? (
          <p className="text-sm text-content-muted">Ainda não há {rotulo.plural} aqui.</p>
        ) : (
          <AgendaList secoes={agenda.secoes} podeEditar={podeEditar} mostrarAlvo={false} />
        )}
      </CardContent>
    </Card>
  );
}
