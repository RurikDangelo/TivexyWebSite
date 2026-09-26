import { type CrmStageKind, can, missingExits, orderStages } from '@tivexy/core';
import { Star, Workflow } from 'lucide-react';
import type { Metadata } from 'next';

import { FormWarning } from '@/components/form/messages';
import { EmptyState } from '@/components/page/empty-state';
import { PageHeader } from '@/components/page/header';
import { NoTenant } from '@/components/page/no-tenant';
import { Page } from '@/components/page/page';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableEmpty, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { sectionTitle } from '@/config/navigation';
import { requireAccess } from '@/lib/auth/require';
import { contagem } from '@/lib/format';
import { supabaseServer } from '@/lib/supabase/server';
import { currentTerms } from '@/lib/terms/current';
import { capitalizar, termOf } from '@/lib/terms/vocabulary';

import {
  BotaoDeAcao,
  BotaoDeExclusao,
  NovaEtapa,
  NovoFunil,
  Renomear,
  TipoDaEtapa,
} from './editor';
import { TIPOS_DE_ETAPA } from './state';

export const metadata: Metadata = { title: 'Funis e etapas' };

const ROTULO_DO_TIPO = Object.fromEntries(TIPOS_DE_ETAPA.map((t) => [t.valor, t.rotulo])) as Record<
  CrmStageKind,
  string
>;

/** Quantas colunas o `<thead>` tem — o vazio e os esqueletos precisam atravessar a tabela. */
const COLUNAS = 4;

/**
 * Os funis desta empresa, e as etapas de cada um.
 *
 * A tela mostra o que pode mudar e trava o que não pode, dizendo por quê: etapa
 * com negócio dentro não muda de tipo nem sai, porque o banco recusaria — e a
 * recusa lá é a garantia, a trava aqui é só para ninguém precisar tentar.
 *
 * As etapas estão em tabela, não em pilha de campos: nome, tipo e quantidade
 * são três colunas que o olho desce. Antes eram 21 caixas de texto empilhadas
 * quando a conta tinha três funis.
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

  const falhouALeitura = (funisR.error ?? etapasR.error) !== null;

  return (
    <Page variant="ajuste">
      <PageHeader
        trilha={[{ rotulo: sectionTitle(terms, '/crm/oportunidades'), href: '/crm/oportunidades' }]}
        titulo="Funis e etapas"
        descricao="As colunas do quadro. Ganho e perda ficam sempre no fim; a ordem das etapas em andamento é sua."
      />

      <div className="flex flex-col gap-6">
        {!podeEditar && (
          <p className="rounded-control bg-surface-sunken px-3 py-2 text-body text-content-muted">
            Só quem pode editar {rotulo.plural} muda o funil. Aqui você vê como ele está.
          </p>
        )}

        {falhouALeitura && (
          <EmptyState estado="erro" titulo="Não consegui ler os funis">
            A consulta ao banco falhou agora há pouco. Recarregue a página em instantes — nenhuma
            configuração foi alterada.
          </EmptyState>
        )}

        {!falhouALeitura && funis.length === 0 && (
          <EmptyState icone={Workflow} titulo="Ainda não há funil">
            O funil é o caminho que {rotulo.plural} percorrem até fechar.{' '}
            {podeEditar
              ? 'Crie o primeiro no campo abaixo — ele já nasce com as etapas de ganho e de perda.'
              : 'Peça a quem administra a conta para criar o primeiro.'}
          </EmptyState>
        )}

        {funis.map((funil) => {
          const faltam = missingExits(funil.etapas);
          const abertas = funil.etapas.filter((e) => e.kind === 'open');

          return (
            <Card key={funil.id}>
              <CardHeader className="gap-3">
                <div className="col-span-2 flex flex-wrap items-center gap-2">
                  {podeEditar ? (
                    <Renomear
                      alvo="funil"
                      id={funil.id}
                      nome={funil.nome}
                      rotulo={`Renomear o funil ${funil.nome}`}
                      destaque
                    />
                  ) : (
                    <h2 className="min-w-0 flex-1 truncate text-h3 text-content">{funil.nome}</h2>
                  )}
                  {funil.padrao ? (
                    <Badge tone="brand" Icone={Star}>
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
                    <BotaoDeExclusao
                      acao="excluirFunil"
                      campos={{ id: funil.id }}
                      rotulo={`Excluir o funil ${funil.nome}`}
                      severidade="danger"
                      titulo={`Excluir o funil "${funil.nome}"?`}
                      descricao={`As ${funil.etapas.length} etapas dele vão junto, e a configuração não se desfaz.`}
                      detalhes={
                        <p className="text-caption text-content-muted">
                          O funil está vazio: nenhum registro de {rotulo.plural} será perdido.
                        </p>
                      }
                    />
                  )}
                </div>

                <p className="col-span-2 text-caption text-content-muted">
                  {contagem(funil.total, rotulo.singular, rotulo.plural)} neste funil ·{' '}
                  {contagem(funil.etapas.length, 'etapa', 'etapas')}
                </p>

                {faltam.length > 0 && (
                  <FormWarning className="col-span-2">
                    {faltam.includes('won')
                      ? 'Falta etapa de ganho: nada neste funil fecha como venda.'
                      : 'Falta etapa de perda: não há onde registrar quem não comprou.'}
                  </FormWarning>
                )}
              </CardHeader>

              <CardContent className="flex flex-col gap-4">
                <Table
                  densidade="densa"
                  mobile="blocos"
                  moldura="nenhuma"
                  rotulo={`Etapas do funil ${funil.nome}`}
                  classNameMoldura="overflow-clip rounded-card border border-line-subtle"
                >
                  <THead>
                    <TR>
                      <TH>Etapa</TH>
                      <TH>Tipo</TH>
                      <TH alinhamento="fim">{capitalizar(rotulo.plural)}</TH>
                      <TH alinhamento="fim">
                        <span className="sr-only">Ações</span>
                      </TH>
                    </TR>
                  </THead>
                  <TBody>
                    {funil.etapas.length === 0 && (
                      <TableEmpty colunas={COLUNAS} icone={Workflow} titulo="Funil sem etapas">
                        Sem etapa não há coluna no quadro, e {rotulo.plural} não têm onde ficar.
                        {podeEditar ? ' Crie a primeira no campo abaixo.' : ''}
                      </TableEmpty>
                    )}
                    {funil.etapas.map((etapa) => {
                      const dentro = contagens.get(etapa.id) ?? 0;
                      const posicaoAberta = abertas.findIndex((e) => e.id === etapa.id);
                      const travado =
                        dentro > 0
                          ? `Com ${contagem(dentro, rotulo.singular, rotulo.plural)} dentro, o tipo não muda.`
                          : null;

                      return (
                        <TR key={etapa.id}>
                          {/* `w-full max-w-0`: é esta a coluna que estica, e é nela que o nome corta. */}
                          <TD className="w-full max-w-0">
                            <div className="flex min-w-0 items-center gap-1">
                              {podeEditar && etapa.kind === 'open' && (
                                <div className="flex shrink-0">
                                  <BotaoDeAcao
                                    acao="moverEtapa"
                                    campos={{
                                      id: etapa.id,
                                      funil: funil.id,
                                      direcao: 'cima',
                                    }}
                                    rotulo={`Subir ${etapa.name}`}
                                    icone="cima"
                                    desabilitado={posicaoAberta <= 0}
                                  />
                                  <BotaoDeAcao
                                    acao="moverEtapa"
                                    campos={{
                                      id: etapa.id,
                                      funil: funil.id,
                                      direcao: 'baixo',
                                    }}
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
                                  rotulo={`Renomear a etapa ${etapa.name}`}
                                />
                              ) : (
                                <span className="min-w-0 truncate text-body text-content">
                                  {etapa.name}
                                </span>
                              )}
                            </div>
                          </TD>

                          <TD rotulo="Tipo">
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
                          </TD>

                          <TD numerico rotulo={capitalizar(rotulo.plural)}>
                            {dentro}
                            <span className="sr-only">
                              {' '}
                              {dentro === 1 ? rotulo.singular : rotulo.plural}
                            </span>
                          </TD>

                          <TD acoes>
                            {podeEditar && dentro === 0 && (
                              <BotaoDeExclusao
                                acao="excluirEtapa"
                                campos={{ id: etapa.id, funil: funil.id }}
                                rotulo={`Excluir a etapa ${etapa.name}`}
                                /*
                                 * `warning`, não `danger`: a etapa está vazia e
                                 * se refaz num clique. Vermelho aqui e vermelho
                                 * no que não se desfaz ensina a ignorar os dois.
                                 */
                                severidade="warning"
                                titulo={`Excluir a etapa "${etapa.name}"?`}
                                descricao="Ela sai do quadro deste funil. Nenhum registro é apagado — a etapa está vazia."
                              />
                            )}
                          </TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>

                {podeEditar && <NovaEtapa funil={funil.id} />}
              </CardContent>
            </Card>
          );
        })}

        {podeEditar && (
          <Card>
            <CardContent className="pt-4">
              <NovoFunil />
            </CardContent>
          </Card>
        )}
      </div>
    </Page>
  );
}
