import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

import { ABAS_PENDENTES } from './tabs';

/**
 * O que o dono pediu e ainda não existe, dito na própria casca.
 *
 * O pedido foram seis abas, com a referência do painel da NIT. Quatro têm
 * tela. Duas — Anúncios e Configurações da plataforma — não têm nada por
 * baixo: nem tabela, nem decisão de produto.
 *
 * Havia três saídas, e duas eram ruins:
 *
 * 1. **Desenhar as abas assim mesmo**, abrindo telas vazias. É fingir
 *    funcionalidade: uma tela vazia é lida como "ainda não cadastrei", não
 *    como "não existe". O CLAUDE.md fecha essa porta.
 * 2. **Omitir.** Aí o dono abre o painel, não acha o que pediu e não sabe se
 *    foi esquecido, se foi recusado ou se está em outro lugar.
 * 3. **Declarar sem link, com o motivo escrito.** É esta. O painel diz o que
 *    tem, o que não tem e por que não tem — e a decisão de construir volta
 *    para quem ela é.
 *
 * Server Component: é texto constante, sem estado nenhum. Não paga JavaScript.
 */
export function AbasPendentes({ className }: { className?: string }) {
  if (ABAS_PENDENTES.length === 0) return null;

  return (
    <section
      aria-labelledby="abas-pendentes"
      className={cn('flex flex-col gap-1.5 border-t border-line-subtle pt-3', className)}
    >
      <h2 id="abas-pendentes" className="text-caption font-medium text-content-muted">
        Pedidas e ainda não construídas
      </h2>
      <ul className="flex flex-col gap-1">
        {ABAS_PENDENTES.map((aba) => (
          <li key={aba.chave} className="text-caption text-content-subtle">
            {/*
             * O selo carrega a palavra, não só a cor: quem não distingue tons
             * lê "NÃO CONSTRUÍDO" do mesmo jeito. `Icone={null}` porque o tom
             * neutro não codifica estado e não tem símbolo próprio.
             */}
            <Badge tone="neutral" tamanho="xs" Icone={null} className="mr-1.5 align-middle">
              NÃO CONSTRUÍDO
            </Badge>
            <strong className="font-medium text-content-muted">{aba.rotulo}</strong> —{' '}
            {aba.descricao}. {aba.motivo}
          </li>
        ))}
      </ul>
    </section>
  );
}
