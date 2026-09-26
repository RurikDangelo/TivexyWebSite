import { Hash, MessageSquareDashed, Users } from 'lucide-react';
import type { Metadata } from 'next';

import { EmptyState } from '@/components/page/empty-state';
import { requireAccess } from '@/lib/auth/require';
import { lerCanais } from '@/lib/chat/read';

import { ComoFuncionaEsteChat } from './notes';

export const metadata: Metadata = { title: 'Chat da equipe' };

/**
 * A tela de nenhuma conversa escolhida.
 *
 * Dois vazios diferentes moram aqui, e confundi-los é o defeito clássico:
 *
 *   * **primeira vez** — a empresa não tem canal nenhum. A pessoa não escolheu
 *     porque não há o que escolher, e a saída é criar o primeiro;
 *   * **nenhuma escolhida** — há canais na coluna ao lado e ela ainda não
 *     clicou. A saída é apontar para lá, não oferecer criar outro.
 *
 * Os dois trazem o quadro do que este chat é e do que ele não é. É a única
 * tela em que a pessoa está parada o bastante para ler — e a expectativa
 * errada ("isto é o WhatsApp da empresa", "isto é ao vivo") se forma aqui.
 */
export default async function ChatPage() {
  const { choice, viewer } = await requireAccess('/chat');
  /*
   * Sem empresa o layout já devolveu `<NoTenant/>` no lugar de tudo, então
   * esta página nem chega a ser pedida. A guarda fica porque o tipo exige e
   * porque um layout futuro não pode ser a única coisa entre um Super Admin e
   * uma consulta sem tenant.
   */
  if (choice.kind !== 'resolved' || viewer.userId === null) return null;

  const { canais, falhou } = await lerCanais(choice.tenant.id, viewer.userId);
  const primeiraVez = !falhou && canais.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 overflow-y-auto p-6">
      {primeiraVez ? (
        /*
         * Sem `acao`: o botão "Novo canal" já está no cabeçalho da página, a
         * poucos centímetros daqui. Um segundo botão para a mesma coisa faz a
         * pessoa procurar a diferença entre os dois.
         */
        <EmptyState icone={Users} titulo="A equipe ainda não tem onde conversar" moldura={false}>
          Nenhum canal foi criado nesta empresa. Comece por um <strong>Geral</strong>, no botão
          “Novo canal” acima, e abra outros conforme os assuntos se repetirem.
        </EmptyState>
      ) : (
        <EmptyState
          icone={falhou ? undefined : MessageSquareDashed}
          estado={falhou ? 'erro' : 'vazio'}
          titulo={falhou ? 'Não consegui ler os canais' : 'Escolha um canal para ler'}
          moldura={false}
        >
          {falhou ? (
            <>
              A leitura falhou agora. Nada foi enviado nem marcado como lido — use o botão
              Atualizar, acima.
            </>
          ) : (
            <>
              As conversas ficam na coluna à esquerda. O número ao lado do nome é quanta coisa
              chegou desde a última vez que você abriu aquele canal.
            </>
          )}
        </EmptyState>
      )}

      <ComoFuncionaEsteChat />

      {!primeiraVez && !falhou && (
        <p className="flex items-center gap-1.5 text-caption text-content-subtle">
          <Hash className="size-3.5 shrink-0" aria-hidden />
          Canal com cadeado é restrito: só quem participa lê.
        </p>
      )}
    </div>
  );
}
