import type { Blueprint, SeedRecord } from '@tivexy/core';
import { BLUEPRINTS } from '@tivexy/core/blueprints';
import { GitBranch, Layers, Sprout } from 'lucide-react';
import type { Metadata } from 'next';

import { EmptyState } from '@/components/page/empty-state';
import { PageHeader } from '@/components/page/header';
import { Page } from '@/components/page/page';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SectionLabel } from '@/components/ui/section-label';
import { supabaseServer } from '@/lib/supabase/server';
import { TABELA_DA_SEMENTE } from '@/server/provisioning/execute';

export const metadata: Metadata = { title: 'Ramos' };

/*
 * Os nichos que o provisionamento oferece — uma tela de LEITURA, e é de
 * propósito.
 *
 * Um blueprint hoje é um arquivo JSON em `packages/core/src/blueprints/`,
 * importado um a um por `blueprint-registry.ts`. Isso significa que criar um
 * nicho novo é **commit e deploy**, não cadastro. Uma tela com botão "Novo
 * ramo" mentiria sobre onde o dado mora: ela gravaria em algum lugar que o
 * provisionamento não lê.
 *
 * Mover blueprint de arquivo para tabela é decisão de arquitetura — muda a
 * fronteira que a ADR-003 desenhou, muda quem valida o documento e muda o que
 * acontece com um tenant provisionado por uma versão que mudou depois. Ela
 * pertence a `docs/16-DECISIONS/` antes de virar tela, e está registrada como
 * pendência.
 *
 * O que esta tela faz, então, é o que dá para fazer com honestidade: mostrar o
 * que cada nicho provisiona, lido dos mesmos arquivos que o executor lê.
 */

/** As entidades de semente que já têm tabela. O resto fica guardado na execução. */
const SEMEAVEIS = new Set<string>(Object.keys(TABELA_DA_SEMENTE));

/** Nome de exibição de cada módulo, do banco. Código na tela é código de banco na tela. */
async function nomesDosModulos(): Promise<Map<string, string>> {
  const supabase = await supabaseServer();
  const { data } = await supabase.from('modules').select('code, name');
  const linhas = (data ?? []) as unknown as { code: string; name: string }[];
  return new Map(linhas.map((m) => [m.code, m.name]));
}

/** Quantas sementes de cada entidade, e se a entidade executa hoje. */
function sementesPorEntidade(
  seeds: readonly SeedRecord[],
): { entidade: string; quantas: number; executa: boolean }[] {
  const contagem = new Map<string, number>();
  for (const semente of seeds) {
    contagem.set(semente.entity, (contagem.get(semente.entity) ?? 0) + 1);
  }
  return [...contagem.entries()]
    .map(([entidade, quantas]) => ({ entidade, quantas, executa: SEMEAVEIS.has(entidade) }))
    .sort((a, b) => a.entidade.localeCompare(b.entidade, 'pt-BR'));
}

export default async function RamosPage() {
  const nomes = await nomesDosModulos();

  return (
    <Page variant="painel" className="flex flex-col gap-6">
      <PageHeader
        titulo="Ramos"
        descricao={`Os ${BLUEPRINTS.length} nichos que "Novo cliente" oferece, e o que cada um provisiona.`}
        className="mb-0"
      />

      {/*
       * O aviso vem ANTES da lista, e não num rodapé: quem abre esta aba
       * procurando "adicionar um ramo" precisa ler onde o ramo mora antes de
       * procurar o botão que não existe.
       */}
      <Card className="border-warning">
        <CardHeader>
          <div className="flex items-center gap-2">
            <GitBranch className="size-4 shrink-0 text-warning" aria-hidden />
            <CardTitle>Nicho novo ainda exige deploy</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-body text-content-muted">
          <p>
            Cada ramo é um arquivo JSON em{' '}
            <code className="font-mono">packages/core/src/blueprints/</code>, registrado à mão em{' '}
            <code className="font-mono">blueprint-registry.ts</code>. Criar, renomear ou mudar um
            ramo é <strong className="text-content">commit e deploy</strong>, não cadastro — e por
            isso esta tela é só de leitura. Um formulário aqui gravaria em um lugar que o
            provisionamento não lê.
          </p>
          <p>
            Transformar blueprint em dado de banco é decisão de arquitetura, não de interface: muda
            quem valida o documento e muda o que acontece com um cliente provisionado por uma versão
            que depois mudou. A decisão pertence a{' '}
            <code className="font-mono">docs/16-DECISIONS/</code> antes de virar tela.
          </p>
        </CardContent>
      </Card>

      {BLUEPRINTS.length === 0 ? (
        <EmptyState estado="erro" icone={Layers} titulo="Nenhum ramo registrado">
          O registro de blueprints está vazio. Sem ramo não há provisionamento — o primeiro lugar a
          olhar é <code className="font-mono">packages/core/src/blueprint-registry.ts</code>.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          {BLUEPRINTS.map((blueprint) => (
            <CartaoDoRamo key={blueprint.code} blueprint={blueprint} nomesDeModulo={nomes} />
          ))}
        </div>
      )}
    </Page>
  );
}

function CartaoDoRamo({
  blueprint,
  nomesDeModulo,
}: {
  blueprint: Blueprint;
  nomesDeModulo: ReadonlyMap<string, string>;
}) {
  const sementes = sementesPorEntidade(blueprint.seeds);
  const termos = Object.entries(blueprint.terms);
  const ajustes = Object.keys(blueprint.settings);
  const pendentes = sementes.filter((s) => !s.executa);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>{blueprint.name}</CardTitle>
          <span className="font-mono text-caption text-content-subtle">{blueprint.code}</span>
          <Badge tone="neutral" tamanho="xs" Icone={null}>
            versão {blueprint.version}
          </Badge>
          <Badge tone="brand" tamanho="xs">
            plano {blueprint.plan}
          </Badge>
        </div>
        <p className="text-body text-content-muted">{blueprint.description}</p>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <section className="flex flex-col gap-1.5">
          <SectionLabel>Módulos que a empresa nasce com</SectionLabel>
          <ul className="flex flex-wrap gap-1.5">
            {blueprint.modules.map((modulo) => (
              <li key={modulo}>
                {/*
                 * O nome do banco quando existe, o código quando não: um
                 * módulo declarado no JSON e ausente da tabela `modules` é um
                 * defeito, e mostrar o código cru é o que o denuncia.
                 */}
                <Badge tone="neutral" Icone={null}>
                  {nomesDeModulo.get(modulo) ?? modulo}
                </Badge>
              </li>
            ))}
          </ul>
          <p className="text-caption text-content-subtle">
            O plano contratado ainda pode oferecer menos: o provisionamento liga a interseção dos
            dois, e é isso que a prévia de &ldquo;Novo cliente&rdquo; mostra.
          </p>
        </section>

        <section className="flex flex-col gap-1.5">
          <SectionLabel>Papéis criados além dos de sistema</SectionLabel>
          {blueprint.roles.length === 0 ? (
            <p className="text-body text-content-muted">
              Nenhum. A empresa nasce só com Administrador, Gestor e Colaborador.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {blueprint.roles.map((papel) => (
                <li key={papel.code} className="text-body text-content-muted">
                  <strong className="font-medium text-content">{papel.name}</strong>{' '}
                  <span className="font-mono text-caption">{papel.code}</span> —{' '}
                  {papel.permissions.length} permissões
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-1.5">
          <SectionLabel>Como as coisas se chamam neste nicho</SectionLabel>
          {termos.length === 0 ? (
            <p className="text-body text-content-muted">
              Nenhum apelido: a empresa usa o vocabulário padrão do Core.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {termos.map(([chave, termo]) => (
                <li key={chave} className="text-body text-content-muted">
                  <span className="font-mono text-caption text-content-subtle">{chave}</span> →{' '}
                  <strong className="font-medium text-content">{termo.plural}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-1.5">
          <SectionLabel>Registros de partida</SectionLabel>
          {sementes.length === 0 ? (
            <p className="text-body text-content-muted">Nenhum. A empresa nasce vazia.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {sementes.map((semente) => (
                <li
                  key={semente.entidade}
                  className="flex flex-wrap items-center gap-2 text-body text-content-muted"
                >
                  <Sprout className="size-3.5 shrink-0 text-content-subtle" aria-hidden />
                  <span className="font-mono text-caption">{semente.entidade}</span>
                  <span>
                    {semente.quantas} {semente.quantas === 1 ? 'registro' : 'registros'}
                  </span>
                  {/*
                   * A distinção que importa: `previewOf().seeds` conta o total
                   * declarado, e nem todo declarado executa. Dizer "9 registros
                   * de partida" sobre um nicho cujas tabelas não existem é a
                   * tela prometendo dado que o banco não vai ter.
                   */}
                  {!semente.executa && (
                    <Badge tone="warning" tamanho="xs">
                      NÃO EXECUTA — sem tabela
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
          {pendentes.length > 0 && (
            <p className="text-caption text-content-subtle">
              As entidades marcadas ficam guardadas no registro da execução e não viram linha: o
              módulo de negócio correspondente ainda não tem tabela. Ver docs/PROJECT_STATE.md.
            </p>
          )}
        </section>

        <section className="flex flex-col gap-1.5">
          <SectionLabel>Configurações iniciais</SectionLabel>
          <p className="text-body text-content-muted">
            {ajustes.length === 0
              ? 'Nenhuma: valem os padrões do Core.'
              : `${ajustes.length} ${ajustes.length === 1 ? 'ajuste definido' : 'ajustes definidos'} — ${ajustes.join(', ')}.`}
          </p>
        </section>
      </CardContent>
    </Card>
  );
}
