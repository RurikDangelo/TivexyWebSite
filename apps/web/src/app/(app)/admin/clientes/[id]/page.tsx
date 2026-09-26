import {
  MODULE_CODES,
  type ModuleCode,
  TENANT_STATUSES,
  type TenantStatus,
  formatDocument,
} from '@tivexy/core';
import { blueprintByCode } from '@tivexy/core/blueprints';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { FormError } from '@/components/form/messages';
import { PageHeader } from '@/components/page/header';
import { Page } from '@/components/page/page';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ACOES_DE_PLATAFORMA, SITUACAO } from '@/lib/admin/labels';
import { detalheDoRegistro } from '@/lib/admin/log-text';
import { formatInstant } from '@/lib/format';
import { isUuid } from '@/lib/ids';
import { embeddedCode } from '@/lib/supabase/embedded';
import { supabaseServer } from '@/lib/supabase/server';

import { AvisoDeEndereco, EnderecoPendente } from '../../endereco';
import { FUSO_DA_PLATAFORMA } from '../../plataforma';
import { DadosForm, PlanoForm, SituacaoForm } from './forms';
import {
  type ExecucaoNaTela,
  PlatformLog,
  ProvisioningHistory,
  type RegistroNaTela,
} from './history';
import type { ModuloNaTela, PlanoNaTela } from './state';

/** Tetos das duas listas do histórico. A tela diz que são tetos — ver as descrições dos cartões. */
const LIMITE_DE_EXECUCOES = 20;
const LIMITE_DE_REGISTROS = 50;

/**
 * O nome do cliente na aba.
 *
 * Era `metadata` estático dizendo "Cliente": com três clientes abertos, as três
 * abas diziam a mesma coisa. A consulta é uma coluna só, e o nome já é lido
 * pela página — o custo é um `select name` a mais, e o ganho é poder achar a
 * aba certa.
 */
export async function generateMetadata({
  params,
}: PageProps<'/admin/clientes/[id]'>): Promise<Metadata> {
  const { id } = await params;
  if (!isUuid(id)) return { title: 'Cliente' };

  const supabase = await supabaseServer();
  const { data } = await supabase.from('tenants').select('name').eq('id', id).maybeSingle();

  return { title: typeof data?.name === 'string' ? data.name : 'Cliente' };
}

function relacao<T>(valor: unknown): T | null {
  const linha = Array.isArray(valor) ? valor[0] : valor;
  return (linha ?? null) as T | null;
}

function ehModulo(valor: unknown): valor is ModuleCode {
  return typeof valor === 'string' && (MODULE_CODES as readonly string[]).includes(valor);
}

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor !== '' ? valor : null;
}

/**
 * Um cliente no Admin: dados, situação, plano e módulos, e o histórico —
 * cada execução de provisionamento, com as etapas, e cada decisão da
 * plataforma sobre ele.
 *
 * Tudo lido com a sessão, passando pelo RLS, que libera para
 * `is_super_admin()`. As escritas são funções do banco que conferem o Super
 * Admin por conta própria e gravam a auditoria na mesma transação.
 */
export default async function ClientePage({ params }: PageProps<'/admin/clientes/[id]'>) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const supabase = await supabaseServer();
  const [empresa, planos, modulos, ligados, execucoes, registros] = await Promise.all([
    supabase
      .from('tenants')
      .select(
        'id, slug, name, legal_name, document, status, status_reason, status_changed_at, created_at, settings, plans(code, name)',
      )
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('plans')
      .select('code, name, sort_order, plan_modules(modules(code))')
      .eq('is_active', true)
      .order('sort_order'),
    supabase.from('modules').select('code, name, sort_order').order('sort_order'),
    supabase.from('tenant_modules').select('is_enabled, modules(code)').eq('tenant_id', id),
    supabase
      .from('provisioning_runs')
      .select(
        'id, status, current_step, attempts, last_error, payload, started_at, finished_at, created_at, provisioning_steps(step, position, status, attempts, error)',
      )
      .eq('tenant_id', id)
      .order('created_at', { ascending: false })
      .limit(LIMITE_DE_EXECUCOES),
    supabase
      .from('audit_logs')
      .select('id, action, metadata, created_at, actor_user_id')
      .eq('tenant_id', id)
      .in('action', ACOES_DE_PLATAFORMA)
      .order('created_at', { ascending: false })
      .limit(LIMITE_DE_REGISTROS),
  ]);

  if (empresa.error === null && empresa.data === null) notFound();
  const t = empresa.data;
  if (t === null) {
    return (
      <Page variant="ajuste">
        <FormError>
          Não consegui ler este cliente agora. Recarregue a página em instantes.
        </FormError>
      </Page>
    );
  }

  const situacao: TenantStatus = (TENANT_STATUSES as readonly string[]).includes(String(t.status))
    ? (t.status as TenantStatus)
    : 'provisioning';
  const planoAtual = relacao<{ code?: unknown; name?: unknown }>(t.plans);
  const configuracoes = (t.settings ?? {}) as Record<string, unknown>;
  const fuso = texto(configuracoes['core.timezone']) ?? FUSO_DA_PLATAFORMA;

  const nomes = new Map((modulos.data ?? []).map((m) => [String(m.code), String(m.name)]));
  const ligadosAgora = new Set(
    (ligados.data ?? [])
      .filter((l) => l.is_enabled === true)
      .map((l) => embeddedCode(l.modules))
      .filter(ehModulo),
  );
  const modulosNaTela: ModuloNaTela[] = (modulos.data ?? [])
    .map((m) => String(m.code))
    .filter(ehModulo)
    .map((codigo) => ({
      codigo,
      nome: nomes.get(codigo) ?? codigo,
      ligado: ligadosAgora.has(codigo),
    }));

  const planosNaTela: PlanoNaTela[] = (planos.data ?? []).map((p) => ({
    codigo: String(p.code),
    nome: String(p.name),
    modulos: (Array.isArray(p.plan_modules) ? p.plan_modules : [])
      .map((pm) => embeddedCode((pm as { modules?: unknown }).modules))
      .filter(ehModulo),
  }));

  const historico: ExecucaoNaTela[] = (execucoes.data ?? []).map((e) => {
    const payload = (e.payload ?? {}) as { blueprint?: { code?: unknown; version?: unknown } };
    const codigo = texto(payload.blueprint?.code);
    const versao =
      typeof payload.blueprint?.version === 'number' ? payload.blueprint.version : null;
    const nome = codigo === null ? null : (blueprintByCode(codigo)?.name ?? codigo);
    return {
      id: String(e.id),
      situacao: String(e.status),
      blueprint: nome === null ? null : versao === null ? nome : `${nome} (versão ${versao})`,
      tentativas: Number(e.attempts ?? 0),
      etapaAtual: texto(e.current_step),
      erro: texto(e.last_error),
      inicio: texto(e.started_at),
      fim: texto(e.finished_at),
      criada: String(e.created_at),
      etapas: (Array.isArray(e.provisioning_steps) ? e.provisioning_steps : [])
        .map((s) => ({
          etapa: String(s.step),
          posicao: Number(s.position),
          situacao: String(s.status),
          tentativas: Number(s.attempts ?? 0),
          erro: texto(s.error),
        }))
        .sort((a, b) => a.posicao - b.posicao),
    };
  });

  // Quem decidiu: o nome de quem está na auditoria, quando a leitura alcança.
  const autores = [...new Set((registros.data ?? []).map((r) => r.actor_user_id).filter(isUuid))];
  const pessoas =
    autores.length === 0
      ? []
      : ((await supabase.from('users').select('id, full_name, email').in('id', autores)).data ??
        []);
  const nomeDe = (userId: unknown): string => {
    const p = pessoas.find((x) => x.id === userId);
    return (
      texto(p?.full_name) ?? texto(p?.email) ?? (userId === null ? 'o sistema' : 'Super Admin')
    );
  };
  const decisoes: RegistroNaTela[] = (registros.data ?? []).map((r) => ({
    id: String(r.id),
    acao: String(r.action),
    quem: nomeDe(r.actor_user_id),
    quando: String(r.created_at),
    detalhe: detalheDoRegistro(
      String(r.action),
      (r.metadata ?? {}) as Record<string, unknown>,
      (c) => nomes.get(c) ?? c,
    ),
  }));

  const rotulo = SITUACAO[situacao];
  const falhouLer = [planos, modulos, ligados, execucoes, registros].some((r) => r.error !== null);

  return (
    <Page variant="ajuste">
      <PageHeader
        titulo={String(t.name)}
        trilha={[{ rotulo: 'Clientes', href: '/admin' }]}
        className="mb-3"
      />

      {/* Os fatos do cliente antes de qualquer formulário: o que ele é, não o que se faz com ele. */}
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-caption text-content-muted">
        <Badge tone={rotulo.tom}>{rotulo.rotulo}</Badge>
        {texto(planoAtual?.name) !== null && <Badge>Plano {String(planoAtual?.name)}</Badge>}
        <EnderecoPendente slug={String(t.slug)} />
        {texto(t.document) !== null && (
          <span className="font-mono">{formatDocument(String(t.document))}</span>
        )}
        <span>desde {formatInstant(String(t.created_at), fuso)}</span>
      </div>
      <AvisoDeEndereco className="mb-5" />

      {falhouLer && (
        <div className="mb-4">
          <FormError>
            Parte do cliente não pôde ser lida agora — o que aparece abaixo pode estar incompleto.
          </FormError>
        </div>
      )}

      {/* `gap-4` entre blocos de uma mesma seção; `gap-6` é reservado a regiões da página. */}
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Situação</CardTitle>
            <CardDescription>
              {situacao === 'suspended' && texto(t.status_changed_at) !== null
                ? `Suspensa desde ${formatInstant(String(t.status_changed_at), fuso)}. Ninguém da empresa entra — nem pela tela, nem pela API. Os dados ficam.`
                : 'Suspender corta o acesso de todo mundo da empresa — pela tela e pela API. Os dados ficam, e reativar devolve tudo.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SituacaoForm
              id={id}
              nomeDaEmpresa={String(t.name)}
              situacao={situacao}
              motivo={texto(t.status_reason)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Plano e módulos</CardTitle>
            <CardDescription>
              O plano é o padrão de origem; o que vale para o acesso são os módulos ligados.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ul className="flex flex-wrap gap-1.5" aria-label="Módulos">
              {modulosNaTela.map((m) => (
                <li key={m.codigo}>
                  <Badge tone={m.ligado ? 'brand' : 'neutral'}>
                    <span className="sr-only">{m.ligado ? 'Ligado: ' : 'Desligado: '}</span>
                    {m.nome}
                    {!m.ligado && <span aria-hidden> · desligado</span>}
                  </Badge>
                </li>
              ))}
            </ul>
            <PlanoForm
              id={id}
              planoAtual={texto(planoAtual?.code)}
              planos={planosNaTela}
              modulos={modulosNaTela}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Dados</CardTitle>
            <CardDescription>
              {/*
               * O identificador, não "o endereço": `{slug}.tivexy.com.br` não
               * resolve, e a frase antiga afirmava que ele estava em links já
               * enviados. O que está em link enviado é o slug.
               */}
              O identificador ({String(t.slug)}) não muda: o provisionamento já o gravou, e trocá-lo
              quebraria o que aponta para ele.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DadosForm
              id={id}
              nome={String(t.name)}
              razaoSocial={texto(t.legal_name)}
              documento={texto(t.document) === null ? null : formatDocument(String(t.document))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Provisionamentos</CardTitle>
            <CardDescription>
              Cada execução, com as etapas. A que parou aparece aberta. A lista mostra no máximo as{' '}
              {LIMITE_DE_EXECUCOES} mais recentes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProvisioningHistory execucoes={historico} fuso={fuso} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Decisões da plataforma</CardTitle>
            <CardDescription>
              {/*
               * "da auditoria, que não se apaga" continua verdade; o que não era
               * verdade é a tela mostrar tudo. São os 50 mais recentes.
               */}
              Suspensões, reativações, trocas de plano e edições — da auditoria, que não se apaga.
              Aqui aparecem os {LIMITE_DE_REGISTROS} registros mais recentes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PlatformLog registros={decisoes} fuso={fuso} />
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
