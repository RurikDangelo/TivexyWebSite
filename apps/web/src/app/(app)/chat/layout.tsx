import { MessagesSquare } from 'lucide-react';

import { PageHeader } from '@/components/page/header';
import { NoTenant } from '@/components/page/no-tenant';
import { Page } from '@/components/page/page';
import { requireAccess } from '@/lib/auth/require';
import { lerCanais } from '@/lib/chat/read';
import { tenantTimeZone } from '@/lib/settings/current';

import { ListaDeCanais } from './channel-list';
import { NovoCanal } from './new-channel';
import { AVISO_DE_EXTERNO } from './notes';
import { Atualizacao } from './refresh';

/**
 * A casca do chat interno: a coluna de canais à esquerda, a conversa à direita.
 *
 * É `layout.tsx` e não um componente repetido em cada página por um motivo
 * concreto: trocar de canal não pode desmontar a lista. Desmontada, ela perde
 * a posição de rolagem — num painel de vinte canais, cada clique voltaria ao
 * topo — e pisca inteira a cada navegação.
 *
 * O preço de um layout é que ele **não** re-renderiza ao navegar entre canais
 * irmãos, e os contadores de não lidas ficariam velhos. Isso está resolvido
 * pelo outro lado: `marcarCanalComoLido` chama `revalidatePath('/chat',
 * 'layout')`, e a atualização periódica de `<Atualizacao>` usa
 * `router.refresh()`, que também atravessa layouts. Os números nunca ficam
 * presos aqui — e é por isso que este comentário existe, para que ninguém
 * "conserte" o layout achando que ele está segurando dado velho.
 *
 * ## Variante `operacao`
 *
 * Sem teto de largura: são duas colunas com rolagem própria, e estreitar a
 * conversa em 1680px seria desperdiçar exatamente a tela onde ela é útil.
 */
export default async function ChatLayout({ children }: LayoutProps<'/chat'>) {
  const { choice, viewer } = await requireAccess('/chat');
  if (choice.kind !== 'resolved' || viewer.userId === null) return <NoTenant />;

  const [{ canais, falhou, contagemFalhou }, fuso] = await Promise.all([
    lerCanais(choice.tenant.id, viewer.userId),
    tenantTimeZone(),
  ]);

  /*
   * O instante em que ESTE HTML foi montado no servidor. É o que a barra de
   * atualização mostra — "de quando é o que estou vendo" — e a única resposta
   * honesta possível sem tempo real. Formatado aqui, no fuso da empresa, para
   * que servidor e navegador escrevam exatamente a mesma string e a
   * hidratação não acuse divergência.
   */
  const geradoEm = new Date();
  const geradoTexto = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: fuso,
  }).format(geradoEm);

  return (
    <Page variant="operacao">
      <PageHeader
        titulo="Chat da equipe"
        descricao={
          <>
            Conversa <strong className="font-semibold text-content">interna</strong>, entre quem
            trabalha nesta empresa. Não é WhatsApp e não chega a cliente nenhum.
          </>
        }
        acoes={<NovoCanal />}
      />

      <div className="flex flex-col gap-4">
        <Atualizacao geradoEm={geradoEm.toISOString()} geradoTexto={geradoTexto} />

        {/*
         * A altura é calculada, e o número mágico é assumido: `14rem` é o que
         * o `py-6` do `<main>`, o `PageHeader`, a barra de atualização e os
         * dois `gap-4` ocupam acima desta caixa. Sem altura declarada, a
         * conversa cresceria para fora da janela e a rolagem passaria a ser a
         * da página inteira — o campo de escrever sairia da tela justamente
         * enquanto a pessoa lê para responder.
         *
         * `min-h` segura o caso da janela baixa (notebook com a barra de
         * favoritos, navegador em meia tela): abaixo disso a caixa para de
         * encolher e a página rola, que é melhor que um chat de 8rem.
         */}
        <div className="grid h-[max(30rem,calc(100dvh_-_var(--header-h)_-_14rem))] gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <ListaDeCanais
            canais={canais}
            falhou={falhou}
            contagemFalhou={contagemFalhou}
            className="min-h-0"
          />
          {/* `min-w-0` e `min-h-0`: sem eles, uma mensagem longa estica a coluna
              e a rolagem interna da conversa vira rolagem da página. */}
          <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-card border border-line-subtle bg-surface-panel shadow-card">
            {children}
          </section>
        </div>

        <p className="flex max-w-prose items-start gap-2 text-caption text-content-subtle">
          <MessagesSquare className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>{AVISO_DE_EXTERNO}</span>
        </p>
      </div>
    </Page>
  );
}
