import { MailCheck } from 'lucide-react';
import type { Metadata } from 'next';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireSession } from '@/lib/auth/require';

export const metadata: Metadata = { title: 'Convite pendente' };

/*
 * Vínculo existe e está `invited` — a pessoa foi convidada e o acesso ainda não
 * foi ativado.
 *
 * **Não há botão de aceitar aqui, e a ausência é deliberada.** Ativar o vínculo
 * é escrita em `tenant_users`, e o RLS nega essa escrita a quem ainda não é
 * membro ativo — que é exatamente quem está nesta tela. Fazer funcionar exige
 * uma função `SECURITY DEFINER` que confira o convite, e ela ainda não existe.
 *
 * Um botão que parecesse aceitar e falhasse seria pior do que dizer a verdade.
 */
export default async function ConvitePage() {
  const { choice } = await requireSession();
  const empresa = choice.kind === 'resolved' ? choice.tenant : null;

  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      <Card>
        <CardHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-warning-soft">
            <MailCheck className="size-5 text-warning" aria-hidden />
          </div>
          <CardTitle className="text-xl">Convite pendente</CardTitle>
          <CardDescription>
            {empresa === null
              ? 'Seu acesso a esta empresa ainda não foi ativado.'
              : `Seu acesso a ${empresa.name} ainda não foi ativado.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm text-content-muted">
          <p>
            Abra o link do e-mail de convite para ativar. Ele é de uso único e vence — se já tiver
            passado do prazo, peça um novo a quem administra a conta.
          </p>
          <p className="rounded-md bg-surface-subtle px-3 py-2">
            Enquanto o convite estiver pendente, nenhum dado da empresa fica disponível. Isso é do
            banco, não da tela.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
