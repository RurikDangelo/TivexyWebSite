import { Building2, LogOut, MailWarning, MonitorSmartphone } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { trocarEmpresa } from '@/app/(app)/actions';
import { sair, sairDeTodos } from '@/app/(auth)/actions';
import { PageHeader } from '@/components/page/header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAccess } from '@/lib/auth/require';
import { supabaseServer } from '@/lib/supabase/server';

import { PerfilForm, SenhaForm } from './forms';

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
  const { data: perfil } = await supabase
    .from('users')
    .select('full_name')
    .eq('id', viewer.userId ?? '')
    .maybeSingle();

  const atual = choice.kind === 'resolved' ? choice.tenant.id : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader titulo="Minha conta" descricao={email ?? undefined} />

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Perfil</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <PerfilForm nome={typeof perfil?.full_name === 'string' ? perfil.full_name : ''} />
            <div className="flex items-start gap-2 rounded-md bg-surface-subtle px-3 py-2 text-sm text-content-muted">
              <MailWarning className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>
                <span className="font-medium text-content">E-mail: {email ?? '—'}.</span> Trocar o
                e-mail exige confirmar o endereço novo por e-mail, e o envio ainda não está
                configurado. Até lá, peça a troca ao suporte da Tivexy.
              </p>
            </div>
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

        {options.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Empresas</CardTitle>
              <CardDescription>Onde você trabalha no Tivexy.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col divide-y divide-line-subtle">
                {options.map((opcao) => {
                  const vinculo = VINCULO[opcao.membership];
                  return (
                    <li key={opcao.id} className="flex flex-wrap items-center gap-3 py-2.5">
                      <Building2 className="size-4 shrink-0 text-content-subtle" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-content">
                        {opcao.name}
                      </span>
                      <Badge tone={vinculo.tom}>{vinculo.rotulo}</Badge>
                      {opcao.id === atual ? (
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
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        )}

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
            <form action={sairDeTodos}>
              <Button type="submit" variant="outline">
                <MonitorSmartphone aria-hidden />
                Sair de todos os aparelhos
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
