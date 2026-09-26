'use client';

import { type Blueprint, type ModuleCode, planProvisioning, previewOf } from '@tivexy/core';
import { CheckCircle2, Link2 as LinkIcon } from 'lucide-react';
import Link from 'next/link';
import { useActionState, useMemo, useState, type ReactNode } from 'react';

import { Field, describedBy, idDoCampo } from '@/components/form/field';
import { FormError } from '@/components/form/messages';
import { Submit } from '@/components/form/submit';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { SectionLabel } from '@/components/ui/section-label';

import { gerarLinkDeAcesso } from '../../access-link';
import { criarCliente } from '../../actions';
import { AvisoDeEndereco, HOST_PLANEJADO, enderecoPlanejado } from '../../endereco';
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
 *
 * Os campos passaram a usar `Field`/`Input`/`Select`/`Submit`, que é o que o
 * arquivo vizinho (`clientes/[id]/forms.tsx`) já usava: o mesmo painel tinha
 * dois vocabulários de campo, dois tratamentos de erro e um `<select>` cru com
 * as classes do primitivo copiadas à mão — e já divergidas dele.
 */

/* Prefixo dos ids. Nenhuma colisão hoje, mas o par rótulo↔campo fica legível no DOM. */
const ESCOPO = 'novo-cliente';

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

  const dicaDoNicho = blueprint?.description;
  const dicaDoEndereco = 'Identificador da empresa. Não muda depois: link já enviado quebraria.';
  const dicaDoEmail = 'É a conta que vai administrar a empresa.';

  return (
    <form action={acao} className="flex flex-col gap-4">
      <input type="hidden" name="chave" value={chave} />

      {estado.erro !== null && <FormError>{estado.erro}</FormError>}

      <div className="flex flex-col gap-3">
        <Field nome="blueprint" escopo={ESCOPO} rotulo="Nicho" obrigatorio dica={dicaDoNicho}>
          <Select
            id={idDoCampo('blueprint', ESCOPO)}
            name="blueprint"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            aria-describedby={describedBy('blueprint', undefined, dicaDoNicho, ESCOPO)}
          >
            {blueprints.map((b) => (
              <option key={b.code} value={b.code}>
                {b.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          nome="nome"
          escopo={ESCOPO}
          rotulo="Nome da empresa"
          obrigatorio
          erro={problemaDe('name')}
        >
          <Input
            id={idDoCampo('nome', ESCOPO)}
            name="nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
            placeholder="Padaria do Bairro"
            aria-invalid={problemaDe('name') !== undefined}
            aria-describedby={describedBy('nome', problemaDe('name'), undefined, ESCOPO)}
          />
        </Field>

        <Field
          nome="slug"
          escopo={ESCOPO}
          rotulo="Endereço"
          obrigatorio
          erro={problemaDe('slug')}
          dica={dicaDoEndereco}
        >
          <span className="flex items-center gap-1">
            <Input
              id={idDoCampo('slug', ESCOPO)}
              name="slug"
              value={enderecoEfetivo}
              onChange={(e) => {
                setSlugTocado(true);
                setSlug(e.target.value);
              }}
              required
              className="font-mono"
              aria-invalid={problemaDe('slug') !== undefined}
              aria-describedby={describedBy('slug', problemaDe('slug'), dicaDoEndereco, ESCOPO)}
            />
            {/*
             * O sufixo fica porque é o endereço planejado e explica o formato
             * do campo — mas ele não é navegável hoje, e o aviso logo abaixo
             * diz isso em vez de deixar a tela prometer um link que não abre.
             */}
            <span className="shrink-0 font-mono text-caption text-content-subtle">
              .{HOST_PLANEJADO}
            </span>
          </span>
          <AvisoDeEndereco />
        </Field>

        <Field
          nome="responsavel"
          escopo={ESCOPO}
          rotulo="Nome de quem vai administrar"
          obrigatorio
          erro={problemaDe('admin.fullName')}
        >
          <Input
            id={idDoCampo('responsavel', ESCOPO)}
            name="responsavel"
            value={responsavel}
            onChange={(e) => setResponsavel(e.target.value)}
            required
            placeholder="Maria Souza"
            aria-invalid={problemaDe('admin.fullName') !== undefined}
            aria-describedby={describedBy(
              'responsavel',
              problemaDe('admin.fullName'),
              undefined,
              ESCOPO,
            )}
          />
        </Field>

        <Field
          nome="email"
          escopo={ESCOPO}
          rotulo="E-mail de quem vai administrar"
          obrigatorio
          erro={problemaDe('admin.email')}
          dica={dicaDoEmail}
        >
          <Input
            id={idDoCampo('email', ESCOPO)}
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="maria@padaria.com.br"
            aria-invalid={problemaDe('admin.email') !== undefined}
            aria-describedby={describedBy('email', problemaDe('admin.email'), dicaDoEmail, ESCOPO)}
          />
        </Field>
      </div>

      <Previa plano={plano} />

      {/*
       * Criar cliente é a ação mais lenta do sistema: cria a empresa, liga
       * módulos, cria papéis, fala com a API de identidade e semeia. `Submit`
       * dá o estado pendente que o `<Button>` cru não dava — quem clicava
       * ficava vários segundos sem sinal nenhum, e nada além da chave de
       * idempotência impedia o segundo clique.
       */}
      <Submit size="lg" pendente="Provisionando…" disabled={plano === null || !plano.ok}>
        Criar cliente
      </Submit>
    </form>
  );
}

/** O que vai acontecer, antes de acontecer. */
function Previa({ plano }: { plano: ReturnType<typeof planProvisioning> | null }) {
  if (plano === null) return null;

  if (!plano.ok) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Ainda falta</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-1.5 text-body text-content-muted">
            {plano.problems.map((p) => (
              <li key={`${p.path}:${p.message}`}>
                <span className="font-mono text-caption text-content-subtle">{p.path || '—'}</span>{' '}
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
    <Card>
      <CardHeader>
        <CardTitle>O que será criado</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-body">
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

        <p className="border-t border-line-subtle pt-3 text-caption text-content-subtle">
          {plano.operations.length} operações, em ordem. A mesma lista que o servidor vai executar.
        </p>
      </CardContent>
    </Card>
  );
}

function Linha({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <SectionLabel>{titulo}</SectionLabel>
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
    <Card>
      <CardHeader>
        <span className="mb-1 flex size-10 items-center justify-center rounded-pill bg-success-soft">
          <CheckCircle2 className="size-5 text-success" aria-hidden />
        </span>
        <CardTitle className="text-h2">
          {reaproveitado ? 'Este cliente já havia sido criado' : 'Cliente criado'}
        </CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-4 text-body">
        {reaproveitado && (
          <p className="rounded-control bg-surface-sunken px-3 py-2 text-content-muted">
            A chave desta tela já tinha sido usada. Nada foi executado de novo — é o que impede um
            duplo clique de criar dois clientes.
          </p>
        )}

        <dl className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <dt className="w-28 shrink-0 text-content-subtle">Identificador</dt>
            <dd className="font-mono text-content">{slug}</dd>
          </div>
          <div className="flex flex-wrap gap-2">
            <dt className="w-28 shrink-0 text-content-subtle">Endereço previsto</dt>
            <dd className="flex min-w-0 flex-col gap-1">
              {/*
               * O subdomínio ainda não resolve. Dizer "Endereço: acme.tivexy.com.br"
               * logo depois de "Cliente criado" mandaria alguém tentar abrir um
               * link que não existe.
               */}
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-content">{enderecoPlanejado(slug)}</span>
                <Badge tone="warning" tamanho="xs">
                  PENDENTE — DNS
                </Badge>
              </span>
              <AvisoDeEndereco />
            </dd>
          </div>
          <div className="flex flex-wrap gap-2">
            <dt className="w-28 shrink-0 text-content-subtle">Execução</dt>
            <dd className="font-mono text-caption break-all text-content-muted">{runId}</dd>
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
        <div className="flex flex-col gap-2 rounded-control bg-warning-soft px-3 py-3">
          <p className="text-warning">
            <strong className="font-semibold">Nenhum e-mail foi enviado.</strong> A conta de{' '}
            {adminEmail} foi criada, mas o projeto ainda não tem servidor de e-mail próprio. Gere o
            link abaixo e repasse pelo canal que você já usa com o cliente.
          </p>

          {link.link === null ? (
            <form action={gerar}>
              <input type="hidden" name="email" value={adminEmail} />
              <Submit variant="outline" size="sm" pendente="Gerando…">
                <LinkIcon aria-hidden />
                Gerar link de acesso
              </Submit>
            </form>
          ) : (
            <div className="flex flex-col gap-1">
              <code className="block w-full rounded-control border border-line-subtle bg-surface px-2 py-1.5 font-mono text-caption break-all text-content">
                {link.link}
              </code>
              <p className="text-caption text-warning">
                Vale uma vez e vence. É credencial — quem abrir entra como essa conta. Esta tela é o
                único lugar que gera o link: saindo dela, ele não volta.
              </p>
            </div>
          )}

          {link.erro !== null && <p className="text-caption text-danger">{link.erro}</p>}
        </div>

        {sementesPendentes > 0 && (
          <p className="rounded-control bg-warning-soft px-3 py-2 text-warning">
            {sementesPendentes} registros de partida ficaram pendentes: os módulos de negócio ainda
            não têm tabela. Estão guardados no registro da execução.
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link
            href="/admin"
            className="text-label text-content-accent underline-offset-4 hover:underline"
          >
            Voltar para a lista
          </Link>
          <Link
            href="/admin/clientes/novo"
            className="text-label text-content-accent underline-offset-4 hover:underline"
          >
            Criar outro
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
