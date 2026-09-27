import { Globe, Lock } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { PageHeader } from '@/components/page/header';
import { Page } from '@/components/page/page';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SectionLabel } from '@/components/ui/section-label';
import { supabaseServer } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';

import { ACESSO_DE_HOJE, EnderecoPendente, HOST_PLANEJADO } from '../endereco';

export const metadata: Metadata = { title: 'Domínios' };

/*
 * Domínios — BLOCKED — EXTERNAL.
 *
 * O dono pediu esta aba, e o pedido faz sentido: no desenho do produto cada
 * cliente atende em `{slug}.tivexy.com.br`. O que não existe é a base disso:
 * o domínio e o DNS curinga. A produção roda em `tivexy-web.vercel.app`, e
 * nenhum navegador abre `acme.tivexy.com.br` hoje.
 *
 * Então esta tela **não gerencia domínio**. Não tem "adicionar domínio", não
 * tem "verificar DNS", não tem selo de verificado. Construir esses controles
 * sobre uma dependência que não existe é exatamente o que o CLAUDE.md proíbe:
 * seria uma tela inteira de funcionalidade fingida, com botões que não têm o
 * que chamar.
 *
 * O que ela faz é o que é útil e verdadeiro: nomear a dependência, dizer de
 * quem ela é, listar o que já está pronto do lado do código e mostrar, por
 * cliente, qual seria o endereço quando o DNS existir — rotulado como
 * pendente, ao lado do acesso de hoje.
 *
 * Quando o DNS existir, `../endereco.tsx` é o único ponto a mudar, e o host
 * passa a vir de variável de ambiente em vez de constante.
 */

/** Quantos clientes a prévia de endereços mostra. Não é a lista de clientes. */
const LIMITE = 50;

interface Cliente {
  id: string;
  slug: string;
  name: string;
}

export default async function DominiosPage() {
  const supabase = await supabaseServer();
  const { data, error, count } = await supabase
    .from('tenants')
    .select('id, slug, name', { count: 'exact' })
    .order('name', { ascending: true })
    .limit(LIMITE);

  const clientes = (data ?? []) as unknown as Cliente[];
  const total = count ?? null;

  return (
    <Page variant="painel" className="flex flex-col gap-6">
      <PageHeader
        titulo="Domínios"
        descricao="O endereço por subdomínio de cada cliente. Ainda não existe — e esta tela diz por quê."
        className="mb-0"
      />

      <Card className="border-warning">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Lock className="size-4 shrink-0 text-warning" aria-hidden />
            <CardTitle>Endereço por subdomínio</CardTitle>
            {/* A palavra está escrita; a cor não carrega o estado sozinha (R8). */}
            <Badge tone="warning" tamanho="sm">
              BLOCKED — EXTERNAL
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-4 text-body">
          <p className="text-content-muted">
            O produto foi desenhado para que cada cliente atenda em{' '}
            <code className="font-mono text-content">{`{slug}.${HOST_PLANEJADO}`}</code>. Nada disso
            funciona hoje, e não é questão de código: depende de conta, compra e configuração em
            serviços de terceiros.
          </p>

          <section className="flex flex-col gap-1.5">
            <SectionLabel>O que falta, e é de fora</SectionLabel>
            <ul className="flex list-disc flex-col gap-1 pl-4 text-content-muted">
              <li>
                O domínio <code className="font-mono text-content">{HOST_PLANEJADO}</code>{' '}
                registrado e sob nosso controle.
              </li>
              <li>
                Um registro DNS curinga (<code className="font-mono text-content">*</code>)
                apontando para a hospedagem.
              </li>
              <li>
                O domínio curinga adicionado ao projeto da Vercel, com o certificado TLS emitido
                para <code className="font-mono text-content">{`*.${HOST_PLANEJADO}`}</code> — um
                certificado curinga exige validação por DNS, que só quem controla a zona faz.
              </li>
              <li>
                As URLs de redirecionamento do Supabase Auth liberadas para o curinga, senão o link
                de acesso volta para o endereço errado depois do login.
              </li>
            </ul>
            <p className="text-caption text-content-subtle">
              Nada disso é tarefa de código, e nenhuma delas tem contorno aceitável: um seletor de
              domínio que grava numa tabela sem DNS por trás não faz endereço nenhum funcionar.
            </p>
          </section>

          <section className="flex flex-col gap-1.5">
            <SectionLabel>O que já está pronto do lado do código</SectionLabel>
            <ul className="flex list-disc flex-col gap-1 pl-4 text-content-muted">
              <li>
                O <code className="font-mono text-content">slug</code> é identificador real,
                validado no provisionamento e único no banco.
              </li>
              <li>
                A resolução por endereço já existe e já é a regra de maior precedência —{' '}
                <code className="font-mono text-content">lib/auth/active-tenant.ts</code> resolve o
                tenant pelo host antes do cookie, e recusa um host que a pessoa não alcança.
              </li>
              <li>Subdomínios reservados já são recusados na criação do cliente.</li>
            </ul>
            <p className="text-caption text-content-subtle">
              Ou seja: quando o DNS existir, o que falta é apontar — não construir.
            </p>
          </section>

          <section className="flex flex-col gap-1.5">
            <SectionLabel>Como se entra hoje</SectionLabel>
            <p className="text-content-muted">
              Por <code className="font-mono text-content">{ACESSO_DE_HOJE}</code>, escolhendo a
              empresa no menu. É o acesso de verdade, e é o único.
            </p>
          </section>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Globe className="size-4 shrink-0 text-content-subtle" aria-hidden />
            <CardTitle>Endereço previsto de cada cliente</CardTitle>
          </div>
          <p className="text-caption text-content-muted">
            Prévia do que cada slug vai virar. Nenhum destes endereços abre hoje — o selo está em
            cada linha porque ele é a informação, não uma ressalva.
          </p>
        </CardHeader>

        <CardContent>
          {error !== null ? (
            <p role="alert" className="text-body text-danger">
              Não consegui ler os clientes: {error.message}
            </p>
          ) : clientes.length === 0 ? (
            <p className="text-body text-content-muted">
              Nenhum cliente ainda — não há slug para virar endereço.
            </p>
          ) : (
            <>
              <ul className="flex flex-col gap-2">
                {clientes.map((cliente) => (
                  <li key={cliente.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Link
                      href={`/adminpanel/clientes/${cliente.id}`}
                      className="min-w-40 text-label text-content-accent underline-offset-4 hover:underline"
                    >
                      {cliente.name}
                    </Link>
                    {/*
                     * `EnderecoPendente` é o mesmo componente das outras três
                     * telas: um lugar só decide como se escreve um endereço
                     * que não resolve, e é ele que muda quando o DNS existir.
                     */}
                    <EnderecoPendente slug={cliente.slug} />
                  </li>
                ))}
              </ul>

              {total !== null && total > clientes.length && (
                <p className="mt-3 text-caption text-content-subtle">
                  Mostrando {clientes.length} de {total}. Esta prévia não é a lista de clientes —
                  ela está em{' '}
                  <Link
                    href="/adminpanel"
                    className="text-content-accent underline-offset-4 hover:underline"
                  >
                    Clientes
                  </Link>
                  .
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <div>
        <Link href="/adminpanel" className={cn(buttonVariants({ variant: 'outline' }))}>
          Voltar para Clientes
        </Link>
      </div>
    </Page>
  );
}
