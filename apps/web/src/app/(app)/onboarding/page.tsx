import { Building2, MailOpen, RotateCw, UserPlus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Page } from '@/components/page/page';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SectionLabel } from '@/components/ui/section-label';
import { requireSession } from '@/lib/auth/require';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Sua conta' };

/**
 * Um caminho de saída do limbo. São dois, e são os únicos que existem.
 *
 * Fora do JSX para que acrescentar um terceiro seja acrescentar um item — e
 * para que a numeração venha do índice, não de um número escrito à mão.
 */
interface Caminho {
  Icone: LucideIcon;
  titulo: string;
  texto: string;
}

const CAMINHOS: readonly Caminho[] = [
  {
    Icone: MailOpen,
    titulo: 'Abra o link do convite',
    texto:
      'Se você recebeu um convite por e-mail, o link da mensagem é o que liga sua conta à empresa. Abrir a Tivexy por fora não liga.',
  },
  {
    Icone: UserPlus,
    titulo: 'Ou peça um convite para este mesmo e-mail',
    texto:
      'Quem administra a conta da sua empresa envia. Convite enviado para outro endereço cria outra conta, e ela também chegaria aqui.',
  },
];

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
 *
 * Variante `ajuste` (seção 3): coluna única de 768px. Não é `intersticial`
 * porque não é uma espera de poucos segundos — é uma tela de leitura, com dois
 * caminhos a comparar, e 512px espremeria os dois.
 */
export default async function OnboardingPage() {
  const { email } = await requireSession();

  return (
    <Page variant="ajuste">
      {/* Um evento de entrada por tela (seção 8, regra 1). */}
      <div className="flex animate-enter flex-col gap-6">
        <header className="flex flex-col gap-3">
          <span className="flex size-14 items-center justify-center rounded-pill bg-surface-sunken text-content-subtle">
            <Building2 className="size-7" aria-hidden />
          </span>
          {/* Era um `CardTitle`, que é `<h3>`: a tela não tinha `<h1>` nenhum. */}
          <h1 className="text-display text-balance text-content">
            Sua conta ainda não tem empresa
          </h1>
          {/* `max-w-prose` no parágrafo, nunca no contêiner: é medida de leitura, não de página. */}
          <p className="max-w-prose text-body-lg text-pretty text-content-muted">
            Entramos com sua conta, mas ela ainda não está ligada a nenhuma empresa. Sem esse
            vínculo não há dado para mostrar — e é o vínculo que falta, não o acesso.
          </p>
          {/*
           * O e-mail aparece porque é a chave da comparação: o convite precisa
           * ter sido enviado para este endereço, e não para outro parecido. Sem
           * sessão com e-mail legível, a linha some em vez de mentir.
           */}
          {email !== null && (
            <p className="text-caption text-content-subtle">
              Conectado como <span className="font-medium text-content-default">{email}</span>
            </p>
          )}
        </header>

        <Card>
          <CardContent className="flex flex-col gap-4 pt-4">
            <SectionLabel como="h2">O que fazer agora</SectionLabel>
            <ol className="flex flex-col gap-4">
              {CAMINHOS.map(({ Icone, titulo, texto }, i) => (
                <li key={titulo} className="flex gap-3">
                  <span
                    aria-hidden
                    className="flex size-8 shrink-0 items-center justify-center rounded-pill bg-surface-accent-soft text-content-accent"
                  >
                    <Icone className="size-4" />
                  </span>
                  <div className="min-w-0">
                    {/*
                     * O número fica no texto acessível e não no círculo: o
                     * círculo carrega o símbolo, e `<ol>` já numera para quem
                     * usa leitor de tela.
                     */}
                    <h3 className="text-h3 text-content">
                      <span className="sr-only">{`Caminho ${i + 1}: `}</span>
                      {titulo}
                    </h3>
                    <p className="mt-1 max-w-prose text-body text-pretty text-content-muted">
                      {texto}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        {/*
         * A única ação real desta tela: reavaliar a guarda. Quem aceitou o
         * convite em outra aba entra; quem ainda não aceitou volta para cá. Não
         * há botão de criar empresa porque não há criação de empresa por aqui.
         */}
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/painel" className={cn(buttonVariants({ variant: 'outline' }))}>
            <RotateCw aria-hidden />
            Já aceitei o convite — tentar de novo
          </Link>
        </div>
      </div>
    </Page>
  );
}
