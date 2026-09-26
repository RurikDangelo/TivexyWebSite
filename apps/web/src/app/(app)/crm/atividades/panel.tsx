import { can, todayIn } from '@tivexy/core';
import { CalendarCheck2 } from 'lucide-react';

import { EmptyState } from '@/components/page/empty-state';
import { FormWarning } from '@/components/form/messages';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
 *
 * A tabela entra sem moldura própria e na densidade densa: aqui ela divide a
 * altura com o resto da página do registro, e borda dentro de borda lê como
 * defeito de renderização.
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
        <CardDescription>
          {/* Leitura que falhou não vira "nada pendente": as duas frases se parecem e só uma é verdade. */}
          {agenda.erro
            ? 'Não foi possível ler a agenda deste registro.'
            : agenda.pendentes === 0
              ? 'Nada pendente aqui.'
              : /* `truncado`: a contagem bateu no teto da consulta e virou piso, não total. */
                `${agenda.truncado ? 'pelo menos ' : ''}${agenda.pendentes} ${
                  agenda.pendentes === 1 ? 'pendência' : 'pendências'
                }, ${agenda.atrasadas} com atraso.`}
        </CardDescription>
        {podeEditar && (
          <CardAction>
            <NewActivityForm
              singular={rotulo.singular}
              hoje={todayIn(fuso)}
              tipos={(tiposR.data ?? []).map((t) => ({ id: String(t.id), nome: String(t.name) }))}
              membros={membros.map((m) => ({ id: m.userId, nome: m.nome }))}
              alvoFixo={{ valor: `${tipo}:${id}`, nome }}
              /* A ação primária da tela do registro é outra; esta convive com ela. */
              variante="outline"
            />
          </CardAction>
        )}
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {agenda.erroNoHistorico && !agenda.erro && (
          <FormWarning>Não foi possível ler o histórico dos últimos 7 dias.</FormWarning>
        )}

        {agenda.erro ? (
          <EmptyState
            estado="erro"
            densidade="compacta"
            moldura={false}
            titulo="Agenda indisponível"
          >
            A consulta falhou. Recarregue a página para tentar de novo — não dá para afirmar que não
            há nada pendente.
          </EmptyState>
        ) : vazia ? (
          <EmptyState
            estado="vazio"
            icone={CalendarCheck2}
            densidade="compacta"
            moldura={false}
            titulo={`Sem ${rotulo.plural}`}
          >
            {podeEditar
              ? `Nada agendado nem concluído nos últimos 7 dias para ${nome}. O botão acima já vem com o vínculo preenchido.`
              : `Quando alguém da equipe agendar algo para ${nome}, aparece aqui.`}
          </EmptyState>
        ) : (
          <AgendaList
            secoes={agenda.secoes}
            podeEditar={podeEditar}
            mostrarAlvo={false}
            dentroDeCartao
          />
        )}
      </CardContent>
    </Card>
  );
}
