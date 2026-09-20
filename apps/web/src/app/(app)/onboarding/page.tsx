import { Building2 } from 'lucide-react';
import type { Metadata } from 'next';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireSession } from '@/lib/auth/require';

export const metadata: Metadata = { title: 'Sua conta' };

/*
 * Para quem entrou e não tem empresa nenhuma.
 *
 * A tela **não** oferece "criar empresa". Na Tivexy, quem cria cliente é o
 * Super Admin, pelo provisionamento — é o que o ADR-002 define e o que o
 * esquema sustenta. Um botão aqui seria uma segunda porta para a mesma coisa,
 * com outras regras e outro caminho, e é assim que dois fluxos divergem.
 *
 * O que ela faz é dizer o que aconteceu e a quem recorrer. Quem chega aqui em
 * geral tem convite não aceito na caixa de entrada, ou teve o acesso removido.
 */
export default async function OnboardingPage() {
  const { email } = await requireSession();

  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      <Card>
        <CardHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-surface-muted">
            <Building2 className="size-5 text-content-subtle" aria-hidden />
          </div>
          <CardTitle className="text-xl">Sua conta ainda não tem empresa</CardTitle>
          <CardDescription>
            {email === null
              ? 'Entramos com sua conta, mas ela não está ligada a nenhuma empresa.'
              : `Entramos com ${email}, mas esta conta ainda não está ligada a nenhuma empresa.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm text-content-muted">
          <p>
            Se você recebeu um convite por e-mail, abra o link da mensagem: é ele que liga sua conta
            à empresa.
          </p>
          <p>
            Se não recebeu, peça a quem administra a conta da sua empresa para enviar um convite
            para este mesmo e-mail. Convite enviado para outro endereço cria outra conta.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
