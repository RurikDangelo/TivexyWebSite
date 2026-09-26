import { Building2, ChevronRight, Info } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { EmptyState } from '@/components/page/empty-state';
import { Page } from '@/components/page/page';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { SectionLabel } from '@/components/ui/section-label';
import type { TenantOption } from '@/lib/auth/active-tenant';
import { requireSession } from '@/lib/auth/require';
import { contagem } from '@/lib/format';
import { atrasoDaLinha } from '@/lib/utils';

import { trocarEmpresa } from '../actions';

export const metadata: Metadata = { title: 'Escolher empresa' };

/**
 * O que está torto na empresa, dito com a palavra dela.
 *
 * Só o que não é `active` aparece: um selo "Ativa" em toda linha seria ruído,
 * e o que interessa aqui é descobrir antes de clicar por que aquela empresa
 * não vai abrir.
 */
const SITUACAO_DA_EMPRESA: Partial<Record<TenantOption['status'], string>> = {
  provisioning: 'Em preparo',
  suspended: 'Suspensa',
  cancelled: 'Cancelada',
};

/** O que está torto no vínculo desta pessoa com aquela empresa. */
const SITUACAO_DO_VINCULO: Partial<Record<TenantOption['membership'], string>> = {
  invited: 'Convite pendente',
  suspended: 'Acesso suspenso',
};

/*
 * Para quem participa de mais de uma empresa — contador, franqueado, sócio de
 * dois negócios. Sem esta tela, `requireAccess()` mandaria essa pessoa para o
 * onboarding, que diz "sua conta não está ligada a nenhuma empresa": falso, e
 * desnorteante justamente para quem tem mais acesso, não menos.
 *
 * Convite pendente aparece na lista, e de propósito: é por aqui que a pessoa
 * chega à empresa que a convidou. O que ela encontra ao entrar é a tela de
 * convite, não os dados — quem garante isso é o vínculo `invited`, no banco.
 *
 * `intersticial` (seção 3): é uma tela de passagem, uma decisão e nada mais.
 * A tela mais estreita do app (`max-w-2xl` com `py-10`) era um número copiado;
 * o teto agora vem do papel.
 */
export default async function EmpresasPage() {
  const { options, choice } = await requireSession();
  const ativa = choice.kind === 'resolved' ? choice.tenant.id : null;

  return (
    <Page variant="intersticial">
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <SectionLabel Icone={Building2}>Trocar de empresa</SectionLabel>
          <h1 className="text-display text-balance text-content">Escolha a empresa</h1>
          <p className="max-w-prose text-body-lg text-pretty text-content-muted">
            {options.length === 0 ? (
              'Nenhuma empresa está ligada a esta conta agora.'
            ) : (
              <>
                {/* `contagem()` porque "1 empresas" é o caso que mais aparece
                    aqui: é para cá que vem quem acabou de perder um dos dois
                    vínculos, e ficar com um só. */}
                Você participa de {contagem(options.length, 'empresa', 'empresas')}. O Tivexy lembra
                a última escolhida, e dá para trocar quando quiser.
              </>
            )}
          </p>
        </header>

        {options.length === 0 ? (
          <EmptyState
            icone={Building2}
            titulo="Sua conta não está em nenhuma empresa"
            acao={
              <Link href="/onboarding" className={buttonVariants({ variant: 'outline' })}>
                Ver o que fazer
              </Link>
            }
          >
            A conta existe e o acesso funciona — o que falta é o vínculo com uma empresa. Ele vem de
            um convite, e quem administra a empresa é quem envia.
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-2">
            {options.map((empresa, i) => {
              const daEmpresa = SITUACAO_DA_EMPRESA[empresa.status];
              const doVinculo = SITUACAO_DO_VINCULO[empresa.membership];

              return (
                <li
                  key={empresa.id}
                  className="animate-enter"
                  style={{ animationDelay: atrasoDaLinha(i) }}
                >
                  {/*
                   * Formulário, e não link: trocar a empresa grava cookie, e o
                   * navegador pré-carrega link. Ver `trocarEmpresa`.
                   */}
                  <form action={trocarEmpresa}>
                    <input type="hidden" name="slug" value={empresa.slug} />
                    <button
                      type="submit"
                      className="group flex w-full items-center gap-3 rounded-card border border-line-subtle bg-surface-panel p-3 text-left shadow-card transition transition-base hover:border-line hover:shadow-raised motion-safe:hover:-translate-y-px"
                    >
                      <Avatar
                        nome={empresa.name}
                        tamanho="md"
                        tom="neutral"
                        className="rounded-card"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="truncate text-label text-content">{empresa.name}</span>
                          {empresa.id === ativa && (
                            <Badge tone="brand" tamanho="xs">
                              Atual
                            </Badge>
                          )}
                          {doVinculo !== undefined && (
                            <Badge tone="warning" tamanho="xs">
                              {doVinculo}
                            </Badge>
                          )}
                          {daEmpresa !== undefined && (
                            <Badge tone="neutral" tamanho="xs">
                              {daEmpresa}
                            </Badge>
                          )}
                        </span>
                        <span className="block truncate font-mono text-caption text-content-subtle">
                          {empresa.slug}
                        </span>
                      </span>
                      <ChevronRight
                        className="size-4 shrink-0 text-content-subtle transition-transform transition-base group-hover:translate-x-0.5"
                        aria-hidden
                      />
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}

        <p className="flex max-w-prose items-start gap-2 text-caption text-content-subtle">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            Esta tela ainda não está no menu: chega-se a ela pelo endereço, ou quando o Tivexy
            precisa que você decida.{' '}
            {options.some((e) => e.membership === 'invited') &&
              'Empresa com convite pendente abre na tela de convite, não nos dados.'}
          </span>
        </p>
      </div>
    </Page>
  );
}
