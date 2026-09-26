'use client';

import { CheckCircle2, Link2 as LinkIcon } from 'lucide-react';
import Link from 'next/link';
import { useActionState, useMemo, useState, type ReactNode } from 'react';

import { type Blueprint, type ModuleCode, planProvisioning, previewOf } from '@tivexy/core';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';

import { gerarLinkDeAcesso } from '../../access-link';
import { criarCliente } from '../../actions';
import { CRIAR_INICIAL, LINK_INICIAL } from '../../state';

/**
 * Criar cliente.
 *
 * **A prévia usa `planProvisioning` — a mesma função que o servidor vai usar.**
 * Não é uma descrição paralela do que deveria acontecer; é o próprio plano. Por
 * isso não tem como divergir do que será executado, e por isso os erros de
 * endereço e de e-mail aparecem antes de qualquer escrita, com exatamente o
 * texto que o servidor devolveria.
 *
 * A validação do servidor continua acontecendo, na ação. Esta é para quem
 * preenche; aquela é para valer.
 */
function sugerirSlug(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}

export function NewClientForm({
  blueprints,
  modulosPorPlano,
  chave,
}: {
  blueprints: readonly Blueprint[];
  modulosPorPlano: Record<string, ModuleCode[]>;
  chave: string;
}) {
  const [estado, acao] = useActionState(criarCliente, CRIAR_INICIAL);

  const [codigo, setCodigo] = useState(blueprints[0]?.code ?? '');
  const [nome, setNome] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTocado, setSlugTocado] = useState(false);
  const [email, setEmail] = useState('');
  const [responsavel, setResponsavel] = useState('');

  const blueprint = blueprints.find((b) => b.code === codigo) ?? null;
  const enderecoEfetivo = slugTocado ? slug : sugerirSlug(nome);

  const plano = useMemo(() => {
    if (blueprint === null) return null;
    return planProvisioning({
      blueprint,
      planModules: modulosPorPlano[blueprint.plan] ?? [],
      slug: enderecoEfetivo,
      name: nome,
      admin: { email, fullName: responsavel },
    });
  }, [blueprint, modulosPorPlano, enderecoEfetivo, nome, email, responsavel]);

  const problemaDe = (campo: string) => estado.problemas.find((p) => p.path === campo)?.message;

  if (estado.sucesso !== null) return <Sucesso {...estado.sucesso} />;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <form action={acao} className="flex flex-col gap-5">
        <input type="hidden" name="chave" value={chave} />

        {estado.erro !== null && (
          <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
            {estado.erro}
          </p>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="blueprint">Nicho</Label>
          <select
            id="blueprint"
            name="blueprint"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            className="h-9.5 w-full rounded-md border border-line-field bg-surface px-3 text-sm text-content"
          >
            {blueprints.map((b) => (
              <option key={b.code} value={b.code}>
                {b.name}
              </option>
            ))}
          </select>
          {blueprint !== null && (
            <p className="text-xs text-content-subtle">{blueprint.description}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="nome">Nome da empresa</Label>
          <Input
            id="nome"
            name="nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
            placeholder="Padaria do Bairro"
            aria-invalid={problemaDe('name') !== undefined}
          />
          <Problema texto={problemaDe('name')} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="slug">Endereço</Label>
          <div className="flex items-center gap-1">
            <Input
              id="slug"
              name="slug"
              value={enderecoEfetivo}
              onChange={(e) => {
                setSlugTocado(true);
                setSlug(e.target.value);
              }}
              required
              className="font-mono"
              aria-invalid={problemaDe('slug') !== undefined}
            />
            <span className="whitespace-nowrap font-mono text-xs text-content-subtle">
              .tivexy.com.br
            </span>
          </div>
          <p className="text-xs text-content-subtle">
            Vira o subdomínio do cliente. Mudar depois quebra todos os links existentes.
          </p>
          <Problema texto={problemaDe('slug')} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="responsavel">Nome de quem vai administrar</Label>
          <Input
            id="responsavel"
            name="responsavel"
            value={responsavel}
            onChange={(e) => setResponsavel(e.target.value)}
            required
            placeholder="Maria Souza"
            aria-invalid={problemaDe('admin.fullName') !== undefined}
          />
          <Problema texto={problemaDe('admin.fullName')} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">E-mail de quem vai administrar</Label>
          <Input
            id="email"
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="maria@padaria.com.br"
            aria-invalid={problemaDe('admin.email') !== undefined}
          />
          <p className="text-xs text-content-subtle">
            Recebe o convite para escolher a senha. É a conta que vai administrar a empresa.
          </p>
          <Problema texto={problemaDe('admin.email')} />
        </div>

        <Button type="submit" size="lg" disabled={plano === null || !plano.ok}>
          Criar cliente
        </Button>
      </form>

      <Previa plano={plano} />
    </div>
  );
}

function Problema({ texto }: { texto: string | undefined }) {
  if (texto === undefined) return null;
  return (
    <p role="alert" className="text-xs text-danger">
      {texto}
    </p>
  );
}

/** O que vai acontecer, antes de acontecer. */
function Previa({ plano }: { plano: ReturnType<typeof planProvisioning> | null }) {
  if (plano === null) return null;

  if (!plano.ok) {
    return (
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-sm">Ainda falta</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-1.5 text-sm text-content-muted">
            {plano.problems.map((p) => (
              <li key={`${p.path}:${p.message}`}>
                <span className="font-mono text-xs text-content-subtle">{p.path || '—'}</span>{' '}
                {p.message}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    );
  }

  const previa = previewOf(plano.operations);

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle className="text-sm">O que será criado</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        <Linha titulo="Módulos habilitados">
          <div className="flex flex-wrap gap-1">
            {previa.modules.map((m) => (
              <Badge key={m} tone="brand">
                {m}
              </Badge>
            ))}
          </div>
        </Linha>

        <Linha titulo="Papéis">
          <div className="flex flex-wrap gap-1">
            {previa.roles.map((r) => (
              <Badge key={r}>{r}</Badge>
            ))}
          </div>
        </Linha>

        <Linha titulo="Administrador">
          <span className="break-all text-content-muted">{previa.adminEmail}</span>
        </Linha>

        {previa.seeds > 0 && (
          <Linha titulo="Dados de partida">
            <p className="text-content-muted">
              {previa.seeds} registros ficam pendentes: as tabelas de CRM e ERP ainda não existem.
              Ficam guardados no registro da execução, não aplicados.
            </p>
          </Linha>
        )}

        <p className="border-t border-line-subtle pt-3 text-xs text-content-subtle">
          {plano.operations.length} operações, em ordem. A mesma lista que o servidor vai executar.
        </p>
      </CardContent>
    </Card>
  );
}

function Linha({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="font-mono text-[0.625rem] uppercase tracking-wider text-content-subtle">
        {titulo}
      </h3>
      {children}
    </div>
  );
}

function Sucesso({
  slug,
  runId,
  adminEmail,
  reaproveitado,
  sementesPendentes,
}: {
  tenantId: string;
  slug: string;
  runId: string;
  adminEmail: string;
  reaproveitado: boolean;
  sementesPendentes: number;
}) {
  const [link, gerar] = useActionState(
    (_: typeof LINK_INICIAL, f: FormData) => gerarLinkDeAcesso(f),
    LINK_INICIAL,
  );
  return (
    <Card className="max-w-xl">
      <CardHeader>
        <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-success-soft">
          <CheckCircle2 className="size-5 text-success" aria-hidden />
        </div>
        <CardTitle className="text-xl">
          {reaproveitado ? 'Este cliente já havia sido criado' : 'Cliente criado'}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        {reaproveitado && (
          <p className="rounded-md bg-surface-subtle px-3 py-2 text-content-muted">
            A chave desta tela já tinha sido usada. Nada foi executado de novo — é o que impede um
            duplo clique de criar dois clientes.
          </p>
        )}

        <dl className="flex flex-col gap-2">
          <div className="flex gap-2">
            <dt className="w-28 shrink-0 text-content-subtle">Endereço</dt>
            <dd className="font-mono text-content">{slug}.tivexy.com.br</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-28 shrink-0 text-content-subtle">Execução</dt>
            <dd className="break-all font-mono text-xs text-content-muted">{runId}</dd>
          </div>
        </dl>

        {/*
         * A conta existe; o e-mail **não** foi enviado.
         *
         * Enquanto o projeto Supabase usar o servidor de e-mail embutido — que
         * só escreve para membros da equipe —, não há entrega para cliente
         * nenhum. Dizer "enviamos um convite" aqui seria a tela afirmando algo
         * que não aconteceu. Então ela diz o que aconteceu, e entrega o link.
         */}
        <div className="flex flex-col gap-2 rounded-md bg-warning-soft px-3 py-3">
          <p className="text-warning">
            <strong className="font-semibold">Nenhum e-mail foi enviado.</strong> A conta de{' '}
            {adminEmail} foi criada, mas o projeto ainda não tem servidor de e-mail próprio. Gere o
            link abaixo e repasse pelo canal que você já usa com o cliente.
          </p>

          {link.link === null ? (
            <form action={gerar}>
              <input type="hidden" name="email" value={adminEmail} />
              <button
                type="submit"
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-warning/40 px-3 text-xs font-medium text-warning transition-colors hover:bg-warning/10"
              >
                <LinkIcon className="size-3.5" aria-hidden />
                Gerar link de acesso
              </button>
            </form>
          ) : (
            <div className="flex flex-col gap-1">
              <code className="block w-full break-all rounded border border-warning/30 bg-surface px-2 py-1.5 font-mono text-[0.6875rem] text-content">
                {link.link}
              </code>
              <p className="text-xs text-warning">
                Vale uma vez e vence. É credencial — quem abrir entra como essa conta.
              </p>
            </div>
          )}

          {link.erro !== null && <p className="text-xs text-danger">{link.erro}</p>}
        </div>

        {sementesPendentes > 0 && (
          <p className="rounded-md bg-warning-soft px-3 py-2 text-warning">
            {sementesPendentes} registros de partida ficaram pendentes: os módulos de negócio ainda
            não têm tabela. Estão guardados no registro da execução.
          </p>
        )}

        <div className="flex items-center justify-between">
          <Link
            href="/admin"
            className="text-sm text-content-accent underline-offset-4 hover:underline"
          >
            Voltar para a lista
          </Link>
          <Link
            href="/admin/clientes/novo"
            className="text-sm text-content-accent underline-offset-4 hover:underline"
          >
            Criar outro
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
