import { Building2, LogOut, MailWarning } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { trocarEmpresa } from '@/app/(app)/actions';
import { sair } from '@/app/(auth)/actions';
import { FormWarning } from '@/components/form/messages';
import { PageHeader } from '@/components/page/header';
import { Page } from '@/components/page/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TBody, TD, TH, THead, TR, Table, TableEmpty } from '@/components/ui/table';
import { requireAccess } from '@/lib/auth/require';
import { supabaseServer } from '@/lib/supabase/server';

import { PerfilForm, SenhaForm } from './forms';
import { SairDeTodos } from './sign-out-all';

export const metadata: Metadata = { title: 'Minha conta' };

const VINCULO = {
  active: { rotulo: 'Com acesso', tom: 'success' },
  invited: { rotulo: 'Convite pendente', tom: 'warning' },
  suspended: { rotulo: 'Acesso suspenso', tom: 'neutral' },
} as const;

/**
 * A própria conta: nome, senha, empresas, e sair.
 *
 * `authenticated`, não `member`: quem tem convite pendente ou acesso suspenso
 * também precisa trocar a senha e sair. Ver `config/routes.ts`.
 *
 * O e-mail aparece e não se edita, e a tela diz por quê: trocar e-mail no
 * Supabase manda confirmação para o endereço novo, e e-mail ainda não sai
 * (SMTP 🔒). Um campo editável que "salvasse" sem confirmação nenhuma seria
 * exatamente a funcionalidade fingida que o repositório proíbe.
 */
export default async function ContaPage() {
  const { viewer, email, options, choice } = await requireAccess('/conta');
  const supabase = await supabaseServer();
  const { data: perfil, error: erroDoPerfil } = await supabase
    .from('users')
    .select('full_name')
    .eq('id', viewer.userId ?? '')
    .maybeSingle();

  const atual = choice.kind === 'resolved' ? choice.tenant.id : null;

  return (
    <Page variant="ajuste">
      <PageHeader titulo="Minha conta" descricao={email ?? undefined} />

      <div className="flex flex-col gap-4">
        {erroDoPerfil !== null && (
          /*
           * Sem esta faixa, a falha de leitura chegava como um campo de nome em
           * branco — e salvar por cima apagaria o nome que está no banco.
           */
          <FormWarning>
            Não consegui ler seu perfil agora. O campo de nome pode aparecer vazio sem estar vazio:
            recarregue a página antes de salvar.
          </FormWarning>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Perfil</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <PerfilForm nome={typeof perfil?.full_name === 'string' ? perfil.full_name : ''} />
            <p className="flex items-start gap-2 rounded-control bg-surface-sunken px-3 py-2 text-body text-content-muted">
              <MailWarning className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                <span className="font-medium text-content">E-mail: {email ?? '—'}.</span> Trocar o
                e-mail exige confirmar o endereço novo por e-mail, e o envio ainda não está
                configurado. Até lá, peça a troca ao suporte da Tivexy.
              </span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Senha</CardTitle>
            <CardDescription>
              Nunca definiu uma?{' '}
              <Link href="/definir-senha" className="text-content-accent hover:underline">
                Defina aqui
              </Link>{' '}
              — quem entrou pelo link do convite ainda não tem senha atual.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SenhaForm />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Empresas</CardTitle>
            <CardDescription>Onde você trabalha no Tivexy.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table rotulo="Empresas em que você tem vínculo" densidade="densa" moldura="nenhuma">
              <THead>
                <TR>
                  <TH>Empresa</TH>
                  <TH>Vínculo</TH>
                  <TH alinhamento="fim">
                    <span className="sr-only">Abrir</span>
                  </TH>
                </TR>
              </THead>
              <TBody>
                {options.length === 0 ? (
                  <TableEmpty colunas={3} icone={Building2} titulo="Nenhuma empresa ligada a você">
                    Sua conta existe e a senha funciona, mas ela ainda não tem vínculo com nenhuma
                    empresa — e é o vínculo que dá acesso aos dados. Quem cadastra a empresa cria o
                    vínculo.
                  </TableEmpty>
                ) : (
                  options.map((opcao) => {
                    const vinculo = VINCULO[opcao.membership];
                    const aberta = opcao.id === atual;
                    return (
                      <TR key={opcao.id} ativo={aberta}>
                        <TD rotulo="Empresa" truncar>
                          <span className="inline-flex min-w-0 items-center gap-2">
                            <Building2
                              className="size-4 shrink-0 text-content-subtle"
                              aria-hidden
                            />
                            <span className="truncate font-medium text-content">{opcao.name}</span>
                          </span>
                        </TD>
                        <TD rotulo="Vínculo">
                          <Badge tone={vinculo.tom}>{vinculo.rotulo}</Badge>
                        </TD>
                        <TD acoes>
                          {aberta ? (
                            <Badge tone="brand">Aberta agora</Badge>
                          ) : (
                            opcao.membership === 'active' && (
                              <form action={trocarEmpresa}>
                                <input type="hidden" name="slug" value={opcao.slug} />
                                <Button type="submit" variant="outline" size="sm">
                                  Abrir
                                </Button>
                              </form>
                            )
                          )}
                        </TD>
                      </TR>
                    );
                  })
                )}
              </TBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sair</CardTitle>
            <CardDescription>
              Esqueceu a conta aberta em outro computador? Saia de todos de uma vez.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <form action={sair}>
              <Button type="submit" variant="outline">
                <LogOut aria-hidden />
                Sair deste aparelho
              </Button>
            </form>
            <SairDeTodos />
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
