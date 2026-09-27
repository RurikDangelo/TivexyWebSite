import { Ban, Clock, Radio, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { SectionLabel } from '@/components/ui/section-label';
import { INTERVALO_DE_ATUALIZACAO_MS } from '@/lib/chat/model';

/**
 * O que este chat é, e o que ele não é — escrito na tela, não só no código.
 *
 * A regra inegociável do CLAUDE.md diz que não se apresenta como real o que
 * não existe. Num chat isso é especialmente traiçoeiro por duas razões:
 *
 *   1. quem abre "Chat" numa plataforma de gestão costuma estar procurando
 *      atendimento a cliente por WhatsApp, que é outra coisa e não existe;
 *   2. toda interface de chat que alguém já usou é ao vivo. Esta não é. Uma
 *      tela que parece ao vivo e não é faz a pessoa acreditar que ninguém
 *      respondeu — quando na verdade ela é que não recarregou.
 *
 * Por isso a ausência aparece nomeada, com a dependência que falta, em vez de
 * simplesmente não haver botão.
 */

/** A frase de rodapé. Exportada porque o layout a repete em toda tela do chat. */
export const AVISO_DE_EXTERNO =
  'Chat interno da equipe. Conversa com cliente por WhatsApp é BLOCKED — EXTERNAL: depende de conta Meta Business, número aprovado e credencial da API, que a Tivexy ainda não tem. A ausência é conhecida, não esquecida.';

const SEGUNDOS = Math.round(INTERVALO_DE_ATUALIZACAO_MS / 1000);

/** Uma linha do quadro: o que não existe, e do que depende existir. */
function Falta({
  Icone,
  titulo,
  children,
  selo,
}: {
  Icone: LucideIcon;
  titulo: string;
  children: ReactNode;
  selo: ReactNode;
}) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-pill bg-surface-sunken text-content-subtle">
        <Icone className="size-4" aria-hidden />
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-label text-content">{titulo}</span>
          {selo}
        </span>
        <p className="text-caption text-pretty text-content-muted">{children}</p>
      </div>
    </li>
  );
}

/**
 * O quadro "como este chat funciona", na tela de nenhuma conversa escolhida.
 *
 * Fica ali, e não num tooltip, porque é a primeira tela que a pessoa vê — é o
 * momento em que a expectativa se forma, e o único em que dá para corrigi-la
 * antes que ela vire frustração.
 */
export function ComoFuncionaEsteChat() {
  return (
    <div className="flex w-full max-w-prose flex-col gap-3 rounded-card border border-line-subtle bg-surface-sunken p-4 text-left">
      <SectionLabel como="h3">Como este chat funciona hoje</SectionLabel>
      <ul className="flex flex-col gap-3">
        <Falta
          Icone={Radio}
          titulo="Não há tempo real"
          selo={
            <Badge tone="warning" tamanho="xs">
              Sem WebSocket
            </Badge>
          }
        >
          Nenhum WebSocket e nenhum Supabase Realtime estão ligados neste projeto. A tela busca o
          que chegou a cada {SEGUNDOS} segundos e mostra, no alto, de quando é o que você está
          vendo. Mensagem nova não aparece sozinha entre uma busca e outra.
        </Falta>

        <Falta
          Icone={Ban}
          titulo="Cliente por WhatsApp não passa por aqui"
          selo={
            <Badge tone="danger" tamanho="xs" Icone={null}>
              BLOCKED — EXTERNAL
            </Badge>
          }
        >
          Depende de conta Meta Business, número de telefone aprovado, template homologado e
          credencial da API — tudo fora do Tivexy. Enquanto não houver isso, não existe conversa com
          cliente no produto, e nada nesta tela deve ser lido como se existisse.
        </Falta>

        <Falta
          Icone={Clock}
          titulo="O que ainda não existe no chat interno"
          selo={
            <Badge tone="neutral" tamanho="xs">
              Pendente
            </Badge>
          }
        >
          Menção com @, anexo de arquivo, busca dentro da conversa e carregar mensagens antigas além
          das últimas 80. São telas por construir, não integrações travadas: nenhuma depende de
          terceiro.
        </Falta>
      </ul>
    </div>
  );
}
