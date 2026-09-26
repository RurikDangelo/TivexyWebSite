import {
  type ModuleCode,
  TENANT_SETTINGS,
  TERM_KEYS,
  can,
  formatDocument,
  moduleOfTerm,
  resolveSettings,
} from '@tivexy/core';
import { Blocks, Lock } from 'lucide-react';
import type { Metadata } from 'next';

import { FormWarning } from '@/components/form/messages';
import { EmptyState } from '@/components/page/empty-state';
import { PageHeader } from '@/components/page/header';
import { NoTenant } from '@/components/page/no-tenant';
import { Page } from '@/components/page/page';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { sectionTitle } from '@/config/navigation';
import { requireAccess } from '@/lib/auth/require';
import { timeZoneOptions } from '@/lib/settings/timezones';
import { supabaseServer } from '@/lib/supabase/server';
import { currentTerms } from '@/lib/terms/current';
import {
  DEFAULT_TERMS,
  type TermKey,
  capitalizar,
  customTerm,
  termOf,
} from '@/lib/terms/vocabulary';

import { TiposDeAtividade } from './activity-types';
import { EmpresaForm, type PreferenciaNaTela, PreferenciasForm } from './forms';

export async function generateMetadata(): Promise<Metadata> {
  return { title: sectionTitle(await currentTerms(), '/configuracoes') };
}

const MOEDAS: Readonly<Record<string, string>> = { BRL: 'Real brasileiro (R$)' };

/**
 * As configurações desta empresa.
 *
 * `TENANT_SETTINGS` e `resolveSettings()` existiam no Core desde o
 * provisionamento, e nenhuma tela os usava: o nicho escolhia os valores na
 * criação e ninguém podia mudar depois. Aqui aparecem só as dos módulos
 * habilitados — uma empresa sem estoque não tem "baixar estoque na venda",
 * nem desligado.
 *
 * O que é da plataforma — módulos contratados e o vocabulário do nicho —
 * aparece para leitura, com quem procurar para mudar.
 *
 * Toda leitura que falha é dita. Antes, um erro em `tenants` deixava o
 * formulário com os campos vazios, e "razão social em branco" passava por
 * cadastro incompleto em vez de leitura que não aconteceu.
 */
export default async function ConfiguracoesPage() {
  const { choice, viewer } = await requireAccess('/configuracoes');
  if (choice.kind !== 'resolved') return <NoTenant />;

  const tenantId = choice.tenant.id;
  const terms = await currentTerms();
  const supabase = await supabaseServer();
  const modulos = [...viewer.enabledModules] as ModuleCode[];
  const mostraTipos = viewer.enabledModules.has('crm') && can(viewer, 'crm.activities.read');

  const [empresaR, modulosR, tiposR] = await Promise.all([
    supabase
      .from('tenants')
      .select('name, legal_name, document, settings')
      .eq('id', tenantId)
      .maybeSingle(),
    supabase
      .from('tenant_modules')
      .select('is_enabled, modules(code, name)')
      .eq('tenant_id', tenantId),
    mostraTipos
      ? supabase
          .from('crm_activity_types')
          .select('id, name')
          .eq('tenant_id', tenantId)
          .order('position')
          .order('name')
      : /* `error: null` também no ramo que nem consulta: quem lê o resultado não
           deveria precisar saber qual dos dois caminhos produziu este objeto. */
        Promise.resolve({ data: null, error: null }),
  ]);

  const empresa = empresaR.data;
  const overrides =
    empresa?.settings !== null &&
    typeof empresa?.settings === 'object' &&
    !Array.isArray(empresa.settings)
      ? (empresa.settings as Record<string, unknown>)
      : {};
  const efetivas = resolveSettings(overrides, modulos);

  const itens: PreferenciaNaTela[] = TENANT_SETTINGS.filter((def) =>
    viewer.enabledModules.has(def.module),
  ).map((def) => {
    const valor = efetivas[def.key] ?? def.default;
    return {
      chave: def.key,
      rotulo: def.label,
      descricao: def.description,
      tipo: def.type,
      valor,
      padrao: def.default,
      opcoes:
        def.key === 'core.timezone'
          ? timeZoneOptions(String(valor))
          : def.type === 'enum'
            ? (def.options ?? []).map((o) => ({ valor: o, rotulo: MOEDAS[o] ?? o }))
            : undefined,
    };
  });

  const contratados = (modulosR.data ?? [])
    .filter((m) => m.is_enabled === true)
    .map((m) => {
      const mod = (Array.isArray(m.modules) ? m.modules[0] : m.modules) as {
        code?: string;
        name?: string;
      } | null;
      return { codigo: String(mod?.code ?? ''), nome: String(mod?.name ?? mod?.code ?? '') };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  const vocabulario = (TERM_KEYS as readonly string[])
    .filter((chave) => viewer.enabledModules.has(moduleOfTerm(chave) as ModuleCode))
    .filter((chave): chave is TermKey => chave in DEFAULT_TERMS)
    .map((chave) => ({
      chave,
      padrao: DEFAULT_TERMS[chave].plural,
      doNicho: customTerm(terms, chave)?.plural ?? null,
    }));

  const podeEditarEmpresa = can(viewer, 'core.tenant.write');
  const podeEditarPreferencias = can(viewer, 'core.settings.write');

  return (
    <Page variant="ajuste">
      <PageHeader
        titulo={sectionTitle(terms, '/configuracoes')}
        descricao="Como esta empresa funciona no Tivexy."
      />

      <div className="flex flex-col gap-4">
        {empresaR.error !== null && (
          <FormWarning>
            Não consegui ler o cadastro da empresa agora. Os campos abaixo podem aparecer vazios sem
            estarem vazios no banco — recarregue antes de salvar, para não apagar o que está lá.
          </FormWarning>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Dados da empresa</CardTitle>
            {!podeEditarEmpresa && (
              <CardDescription>Só quem administra a conta muda estes dados.</CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <EmpresaForm
              podeEditar={podeEditarEmpresa}
              inicial={{
                nome: String(empresa?.name ?? choice.tenant.name),
                razaoSocial: typeof empresa?.legal_name === 'string' ? empresa.legal_name : null,
                documento:
                  typeof empresa?.document === 'string' ? formatDocument(empresa.document) : null,
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Preferências</CardTitle>
            <CardDescription>
              {podeEditarPreferencias
                ? 'Valem para todo mundo desta empresa, a partir de agora.'
                : 'Você pode ver, mas não mudar — isso é de quem administra a conta.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PreferenciasForm itens={itens} podeEditar={podeEditarPreferencias} />
          </CardContent>
        </Card>

        {mostraTipos && (
          <Card>
            <CardHeader>
              <CardTitle>Tipos de {termOf(terms, 'crm.activities').plural}</CardTitle>
              <CardDescription>Aparecem na agenda para separar uma coisa da outra.</CardDescription>
            </CardHeader>
            <CardContent>
              <TiposDeAtividade
                plural={termOf(terms, 'crm.activities').plural}
                podeEditar={can(viewer, 'crm.activities.write')}
                erro={tiposR.error !== null}
                tipos={(tiposR.data ?? []).map((t) => ({ id: String(t.id), nome: String(t.name) }))}
              />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Blocks className="size-4 text-content-muted" aria-hidden />
              Módulos contratados
            </CardTitle>
            <CardDescription>
              Habilitar ou desligar um módulo é decisão comercial: fale com a Tivexy.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {modulosR.error !== null ? (
              <EmptyState
                estado="erro"
                titulo="Não consegui ler os módulos"
                densidade="compacta"
                moldura={false}
              >
                Uma lista em branco aqui não significa nenhum módulo contratado — significa que a
                leitura falhou. Recarregue a página em instantes.
              </EmptyState>
            ) : contratados.length === 0 ? (
              <EmptyState
                icone={Blocks}
                titulo="Nenhum módulo habilitado"
                densidade="compacta"
                moldura={false}
              >
                Sem módulo não há CRM, vendas nem estoque nesta empresa. Fale com a Tivexy para
                contratar.
              </EmptyState>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {contratados.map((m) => (
                  <li key={m.codigo}>
                    <Badge tone="brand">{m.nome}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="size-4 text-content-muted" aria-hidden />
              Vocabulário
            </CardTitle>
            <CardDescription>
              Como o sistema chama cada coisa aqui. Vem do nicho escolhido na criação da conta.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/*
             * Continua sendo `<dl>`, e não `<Table>`: são pares nome→nome, sem
             * coluna para ordenar nem linha para abrir, e a grade de duas
             * colunas cabe o dobro de termos na altura de uma tabela.
             */}
            <dl className="grid gap-x-6 text-body sm:grid-cols-2">
              {vocabulario.map((v) => (
                <div
                  key={v.chave}
                  className="flex items-baseline justify-between gap-3 border-b border-line-subtle py-1.5"
                >
                  <dt className="text-content-muted">{capitalizar(v.padrao)}</dt>
                  <dd
                    className={
                      v.doNicho === null ? 'text-content-subtle' : 'font-medium text-content'
                    }
                  >
                    {v.doNicho === null ? 'igual' : capitalizar(v.doNicho)}
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
