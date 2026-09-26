import { Ban, CheckCircle2, MailCheck } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { EmptyState } from '@/components/page/empty-state';
import { Page } from '@/components/page/page';
import { Avatar } from '@/components/ui/avatar';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { invitationsOf } from '@/lib/auth/invitations';
import { requireAccess } from '@/lib/auth/require';

import { AcceptForm } from './accept-form';

export const metadata: Metadata = { title: 'Convite' };

/**
 * Onde o convite vira acesso.
 *
 * Quem chega aqui foi negado por `membership-inactive`, e esse motivo junta
 * dois casos: o convite ainda não aceito e o acesso suspenso. A tela separa os
 * dois, porque um se resolve com um clique e o outro, não — oferecer "aceitar"
 * a quem foi suspenso seria um botão que só serve para dar erro.
 *
 * Aceitar é `accept_invitation()`, no banco. O RLS nega a escrita a quem ainda
 * não é membro — que é quem está nesta página —, e a função existe para isso:
 * ela ativa **o vínculo de quem chama**, e nenhum outro.
 *
 * Variante `intersticial` (seção 3): é uma tela de passagem, e o que ela pede é
 * uma decisão só.
 */
export default async function ConvitePage() {
  const { choice, options } = await requireAccess('/convite');
  const atual = choice.kind === 'resolved' ? choice.tenant.id : null;
  const { pendentes, suspensos } = invitationsOf(options, atual);

  if (pendentes.length === 0 && suspensos.length === 0) {
    return (
      <Page variant="intersticial">
        <div className="animate-enter">
          {/*
           * `estado="busca"` e não `vazio`: a moldura tracejada significa
           * "espera para ser preenchido", e aqui não há nada a preencher — a
           * lista foi olhada e está em ordem. O ícone de confirmação sobrescreve
           * a lupa porque a resposta é boa notícia, não uma busca frustrada.
           */}
          <EmptyState
            estado="busca"
            icone={CheckCircle2}
            titulo="Nenhum convite pendente"
            acao={
              <Link href="/painel" className={buttonVariants({ variant: 'outline' })}>
                Ir para a visão geral
              </Link>
            }
          >
            Seus acessos já estão ativos — ou o convite foi aceito em outra aba. Não há nada para
            aceitar aqui.
          </EmptyState>
        </div>
      </Page>
    );
  }

  const soSuspensos = pendentes.length === 0;

  return (
    <Page variant="intersticial">
      {/* Um evento de entrada por tela (seção 8, regra 1): o bloco entra inteiro. */}
      <div className="flex animate-enter flex-col gap-5">
        <header className="flex flex-col gap-3">
          <span className="flex size-14 items-center justify-center rounded-pill bg-surface-sunken text-content-subtle">
            {soSuspensos ? (
              <Ban className="size-7" aria-hidden />
            ) : (
              <MailCheck className="size-7" aria-hidden />
            )}
          </span>
          {/*
           * Um `<h1>` só, no nível da página. Antes ele migrava entre os dois
           * cartões conforme houvesse ou não convite pendente, e no caso de
           * haver os dois o segundo cartão caía para `<h3>`.
           */}
          <h1 className="text-display text-balance text-content">
            {soSuspensos
              ? 'Acesso suspenso'
              : pendentes.length === 1
                ? 'Um convite para você'
                : 'Convites para você'}
          </h1>
          <p className="text-body-lg text-pretty text-content-muted">
            {soSuspensos
              ? 'Quem administra a conta suspendeu seu acesso. Só essa pessoa pode reativar — não há o que aceitar aqui.'
              : 'Ao aceitar, você entra na empresa com o papel que quem administra a conta escolheu. Até lá, nenhum dado dela fica disponível — isso é do banco, não da tela.'}
          </p>
        </header>

        {pendentes.length > 0 && (
          <Card>
            <CardContent className="flex flex-col gap-3 pt-4">
              {/*
               * Lista, não `<Table>`: são um a três convites com uma ação cada,
               * e a densidade de tabela existe para quem precisa varrer dezenas
               * de registros. Aqui a linha é uma decisão, não um dado.
               */}
              <ul className="flex flex-col divide-y divide-line-subtle rounded-card border border-line-subtle">
                {pendentes.map((empresa) => (
                  <li
                    key={empresa.id}
                    className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar nome={empresa.name} tamanho="md" className="rounded-card" />
                      <div className="min-w-0">
                        <p className="truncate text-label text-content">{empresa.name}</p>
                        {empresa.status === 'provisioning' && (
                          <p className="text-caption text-content-muted">
                            Ainda em preparo — você entra e espera lá dentro.
                          </p>
                        )}
                      </div>
                    </div>
                    <AcceptForm tenantId={empresa.id} empresa={empresa.name} />
                  </li>
                ))}
              </ul>
              <p className="text-body text-pretty text-content-muted">
                Não reconhece uma empresa desta lista? Não aceite. Nada acontece enquanto o convite
                estiver pendente.
              </p>
            </CardContent>
          </Card>
        )}

        {suspensos.length > 0 && (
          <Card>
            <CardContent className="flex flex-col gap-3 pt-4">
              {/* Com um `<h1>` na página, o título do cartão é `<h2>` — a ordem não pula degrau. */}
              <h2 className="text-h2 text-content">
                {soSuspensos ? 'Empresas com acesso suspenso' : 'E um acesso suspenso'}
              </h2>
              {!soSuspensos && (
                <p className="text-body text-pretty text-content-muted">
                  Estas não têm convite a aceitar: quem administra a conta suspendeu o acesso, e só
                  essa pessoa pode reativar.
                </p>
              )}
              <ul className="flex flex-col divide-y divide-line-subtle rounded-card border border-line-subtle">
                {suspensos.map((empresa) => (
                  <li key={empresa.id} className="flex min-w-0 items-center gap-3 p-3">
                    <Avatar
                      nome={empresa.name}
                      tamanho="sm"
                      tom="neutral"
                      className="rounded-card"
                    />
                    <span className="truncate text-label text-content-default">{empresa.name}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </Page>
  );
}
