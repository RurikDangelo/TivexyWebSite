import { type CrmStageKind, can, missingExits, orderStages } from '@tivexy/core';
import { AlertTriangle, ArrowLeft, Star, Workflow } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { FormError } from '@/components/form/messages';
import { EmptyState } from '@/components/page/empty-state';
import { PageHeader } from '@/components/page/header';
import { NoTenant } from '@/components/page/no-tenant';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { sectionTitle } from '@/config/navigation';
import { requireAccess } from '@/lib/auth/require';
import { contagem } from '@/lib/format';
import { supabaseServer } from '@/lib/supabase/server';
import { currentTerms } from '@/lib/terms/current';
import { termOf } from '@/lib/terms/vocabulary';

import { BotaoDeAcao, NovaEtapa, NovoFunil, Renomear, TipoDaEtapa } from './editor';
import { TIPOS_DE_ETAPA } from './state';

export const metadata: Metadata = { title: 'Funis e etapas' };

const ROTULO_DO_TIPO = Object.fromEntries(TIPOS_DE_ETAPA.map((t) => [t.valor, t.rotulo])) as Record<
  CrmStageKind,
  string
>;

/**
 * Os funis desta empresa, e as etapas de cada um.
 *
 * A tela mostra o que pode mudar e trava o que não pode, dizendo por quê: etapa
 * com negócio dentro não muda de tipo nem sai, porque o banco recusaria — e a
 * recusa lá é a garantia, a trava aqui é só para ninguém precisar tentar.
 */
export default async function FunisPage() {
  const { choice, viewer } = await requireAccess('/crm/oportunidades');
  if (choice.kind !== 'resolved') return <NoTenant />;

  const tenantId = choice.tenant.id;
  const terms = await currentTerms();
  const rotulo = termOf(terms, 'crm.deals');
  const podeEditar = can(viewer, 'crm.deals.write');
  const supabase = await supabaseServer();

  const [funisR, etapasR, contagensR] = await Promise.all([
    supabase
      .from('crm_pipelines')
      .select('id, name, is_default')
      .eq('tenant_id', tenantId)
      .order('position')
      .order('name'),
    supabase
      .from('crm_pipeline_stages')
      .select('id, name, kind, position, pipeline_id')
      .eq('tenant_id', tenantId),
    supabase.rpc('crm_stage_counts', { p_tenant_id: tenantId }),
  ]);

  const contagens = new Map<string, number>(
    ((contagensR.data ?? []) as { stage_id: string; deals: number | string }[]).map((c) => [
      String(c.stage_id),
      Number(c.deals),
    ]),
  );

  const etapas = (etapasR.data ?? []).map((e) => ({
    id: String(e.id),
    name: String(e.name),
    kind: e.kind as CrmStageKind,
    position: Number(e.position),
    funil: String(e.pipeline_id),
  }));

  const funis = (funisR.data ?? []).map((f) => {
    const doFunil = orderStages(etapas.filter((e) => e.funil === String(f.id)));
    return {
      id: String(f.id),
      nome: String(f.name),
      padrao: f.is_default === true,
      etapas: doFunil,
      total: doFunil.reduce((s, e) => s + (contagens.get(e.id) ?? 0), 0),
    };
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href="/crm/oportunidades"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-content-muted hover:text-content"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {sectionTitle(terms, '/crm/oportunidades')}
      </Link>

      <PageHeader
        titulo="Funis e etapas"
        descricao="As colunas do quadro. Ganho e perda ficam sempre no fim; a ordem das etapas em andamento é sua."
      />

      {!podeEditar && (
        <p className="mb-4 rounded-md bg-surface-muted px-3 py-2 text-sm text-content-muted">
          Só quem pode editar {rotulo.plural} muda o funil. Aqui você vê como ele está.
        </p>
      )}

      {(funisR.error ?? etapasR.error) !== null && (
        <div className="mb-4">
          <FormError>Não consegui ler os funis agora. Recarregue a página em instantes.</FormError>
        </div>
      )}

      <div className="flex flex-col gap-6">
        {funis.length === 0 && (
          <EmptyState icone={Workflow} titulo="Ainda não há funil">
            Crie o primeiro abaixo. Ele já nasce com as etapas de ganho e de perda.
          </EmptyState>
        )}

        {funis.map((funil) => {
          const faltam = missingExits(funil.etapas);
          const abertas = funil.etapas.filter((e) => e.kind === 'open');

          return (
            <Card key={funil.id}>
              <CardHeader className="gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {podeEditar ? (
                    <Renomear alvo="funil" id={funil.id} nome={funil.nome} rotulo="Nome do funil" />
                  ) : (
                    <h2 className="flex-1 font-semibold text-content">{funil.nome}</h2>
                  )}
                  {funil.padrao ? (
                    <Badge tone="brand">
                      <Star className="size-3" aria-hidden />
                      Abre primeiro
                    </Badge>
                  ) : (
                    podeEditar && (
                      <BotaoDeAcao
                        acao="tornarPadrao"
                        campos={{ id: funil.id }}
                        rotulo="Abrir este primeiro"
                        icone="padrao"
                        variante="outline"
                      />
                    )
                  )}
                  {podeEditar && funil.total === 0 && (
                    <BotaoDeAcao
                      acao="excluirFunil"
                      campos={{ id: funil.id }}
                      rotulo={`Excluir o funil ${funil.nome}`}
                      icone="excluir"
                      confirmar={`Excluir o funil "${funil.nome}" e todas as etapas dele?`}
                    />
                  )}
                </div>
                <p className="text-xs text-content-muted">
                  {contagem(funil.total, rotulo.singular, rotulo.plural)} neste funil
                </p>
                {faltam.length > 0 && (
                  <p className="flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2 text-xs text-warning">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    {faltam.includes('won')
                      ? 'Falta etapa de ganho: nada neste funil fecha como venda.'
                      : 'Falta etapa de perda: não há onde registrar quem não comprou.'}
                  </p>
                )}
              </CardHeader>

              <CardContent className="flex flex-col gap-4">
                <ol className="flex flex-col divide-y divide-line-subtle rounded-lg border border-line-subtle">
                  {funil.etapas.map((etapa) => {
                    const dentro = contagens.get(etapa.id) ?? 0;
                    const posicaoAberta = abertas.findIndex((e) => e.id === etapa.id);
                    const travado =
                      dentro > 0
                        ? `Com ${contagem(dentro, rotulo.singular, rotulo.plural)} dentro, o tipo não muda.`
                        : null;

                    return (
                      <li
                        key={etapa.id}
                        className="flex flex-col gap-2 p-3 sm:flex-row sm:flex-wrap sm:items-start"
                      >
                        <div className="flex min-w-0 flex-1 items-start gap-1">
                          {podeEditar && etapa.kind === 'open' && (
                            <div className="flex shrink-0">
                              <BotaoDeAcao
                                acao="moverEtapa"
                                campos={{ id: etapa.id, funil: funil.id, direcao: 'cima' }}
                                rotulo={`Subir ${etapa.name}`}
                                icone="cima"
                                desabilitado={posicaoAberta <= 0}
                              />
                              <BotaoDeAcao
                                acao="moverEtapa"
                                campos={{ id: etapa.id, funil: funil.id, direcao: 'baixo' }}
                                rotulo={`Descer ${etapa.name}`}
                                icone="baixo"
                                desabilitado={posicaoAberta === abertas.length - 1}
                              />
                            </div>
                          )}
                          {podeEditar ? (
                            <Renomear
                              alvo="etapa"
                              id={etapa.id}
                              nome={etapa.name}
                              rotulo={`Nome da etapa ${etapa.name}`}
                            />
                          ) : (
                            <span className="py-1 text-sm text-content">{etapa.name}</span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-start gap-2">
                          {podeEditar ? (
                            <TipoDaEtapa
                              id={etapa.id}
                              funil={funil.id}
                              tipo={etapa.kind}
                              travado={travado}
                            />
                          ) : (
                            <Badge>{ROTULO_DO_TIPO[etapa.kind]}</Badge>
                          )}
                          <span className="py-1.5 font-mono text-xs tabular-nums text-content-muted">
                            {dentro}
                            <span className="sr-only">
                              {' '}
                              {dentro === 1 ? rotulo.singular : rotulo.plural}
                            </span>
                          </span>
                          {podeEditar && dentro === 0 && (
                            <BotaoDeAcao
                              acao="excluirEtapa"
                              campos={{ id: etapa.id, funil: funil.id }}
                              rotulo={`Excluir a etapa ${etapa.name}`}
                              icone="excluir"
                              confirmar={`Excluir a etapa "${etapa.name}"?`}
                            />
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>

                {podeEditar && <NovaEtapa funil={funil.id} />}
              </CardContent>
            </Card>
          );
        })}

        {podeEditar && (
          <Card>
            <CardContent className="pt-5">
              <NovoFunil />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
