import { FileQuestionMark } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Page } from '@/components/page/page';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Não encontrado' };

/**
 * O "não encontrado" de dentro do sistema.
 *
 * Antes não existia, e os doze `notFound()` das telas de detalhe caíam no
 * `app/not-found.tsx` da raiz — que renderiza `min-h-dvh` centralizado FORA do
 * `AppShell`. Abrir um link quebrado para um produto fazia sidebar, header,
 * sino e seletor de empresa desaparecerem: a pessoa era ejetada do sistema por
 * ter clicado num link errado. Este arquivo mora dentro do grupo `(app)`,
 * então a casca continua em volta e o menu continua sendo a saída.
 *
 * Sobre o texto: num sistema multi-tenant com RLS, `notFound()` não prova que
 * o registro não existe. A leitura filtrada pela empresa ativa devolveu vazio,
 * e isso cobre três casos diferentes — endereço errado, registro removido, e
 * registro de outra empresa. Escrever "não existe" seria afirmar mais do que a
 * consulta mostrou; por isso os três casos aparecem, na ordem do mais provável.
 */
export default function AppNotFound() {
  return (
    /* `intersticial` (seção 3), a mesma variante de `error` e de acesso negado. */
    <Page variant="intersticial">
      {/* Um evento de entrada por tela (seção 8, regra 1): anima o bloco, não os filhos. */}
      <div className="flex animate-enter flex-col items-center gap-5 text-center">
        {/*
         * Superfície afundada e não `danger-soft`: não achar uma página não é
         * uma falha do sistema nem um erro de quem clicou. Vermelho aqui
         * transformaria um desencontro comum em incidente.
         */}
        <span className="flex size-14 items-center justify-center rounded-pill bg-surface-sunken text-content-subtle">
          <FileQuestionMark className="size-7" aria-hidden />
        </span>

        <div className="flex flex-col gap-2">
          <h1 className="text-display text-balance text-content">Não encontramos esta página</h1>
          <p className="text-body-lg text-pretty text-content-muted">
            O endereço pode estar errado, o registro pode ter sido removido, ou ele pode pertencer a
            outra empresa — nesse último caso ele existe, mas não para este acesso.
          </p>
        </div>

        <p className="rounded-card border border-line-subtle bg-surface-sunken px-4 py-3 text-body text-pretty text-content-default">
          Se você chegou por um link de dentro da plataforma, vale avisar: link quebrado interno é
          defeito nosso, não engano de quem clicou.
        </p>

        {/*
         * Só o painel. Seria útil voltar para a lista do módulo, mas o
         * `not-found.tsx` não recebe a rota que o disparou — inventar um
         * destino aqui daria um botão que às vezes leva ao lugar errado. O
         * caminho para o módulo continua no menu, que agora não some mais.
         */}
        <Link href="/painel" className={cn(buttonVariants({ variant: 'outline' }))}>
          Voltar para a visão geral
        </Link>
      </div>
    </Page>
  );
}
