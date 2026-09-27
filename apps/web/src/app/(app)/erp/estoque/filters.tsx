import { FilterBar } from '@/components/page/filter-bar';
import { Select } from '@/components/ui/input';
import { type ItemDeAba, Tabs } from '@/components/ui/tabs';

import { ORDEM_PADRAO, type FiltroDeSituacao, type ProdutoParaMovimentar } from './state';

export type Aba = 'saldo' | 'movimentos';

/**
 * Saldo e razão, como abas de endereço: cada uma é um link que se manda.
 *
 * O desenho da faixa é do primitivo `Tabs`; o que mora aqui é só a rota de cada
 * aba. Era a metade copiada do `FinanceTabs` — e a cópia do estoque era a que
 * não rolava no celular.
 */
export function StockTabs({
  aba,
  comRazao,
  className,
}: {
  aba: Aba;
  comRazao: boolean;
  className?: string;
}) {
  if (!comRazao) return null;

  const itens = [
    { chave: 'saldo', rotulo: 'Saldo', href: '/erp/estoque' },
    { chave: 'movimentos', rotulo: 'Movimentações', href: '/erp/estoque?aba=movimentos' },
  ] as const satisfies readonly ItemDeAba<Aba>[];

  return <Tabs rotulo="Estoque" itens={itens} ativa={aba} className={className} />;
}

export function LevelFilters({
  q,
  situacao,
  ordem,
  plural,
}: {
  q: string;
  situacao: FiltroDeSituacao;
  /** O `?ordem=` vigente — precisa sobreviver ao filtro. */
  ordem: string;
  plural: string;
}) {
  return (
    <FilterBar
      busca={{ rotulo: `Buscar ${plural}`, placeholder: 'Nome ou código', valor: q }}
      /*
       * O GET reescreve a query inteira. Sem este campo oculto, filtrar
       * desfaria a coluna de ordenação que a pessoa acabou de escolher —
       * perder a página é o certo (filtrar volta para a primeira), perder a
       * ordem não é.
       */
      ocultos={ordem === ORDEM_PADRAO ? undefined : { ordem }}
      filtros={
        <Select name="situacao" aria-label="Situação" defaultValue={situacao} className="md:w-48">
          <option value="todos">Todas as situações</option>
          <option value="repor">Pedem reposição</option>
          <option value="negativo">Saldo negativo</option>
          <option value="em-dia">Em dia</option>
        </Select>
      }
    />
  );
}

export function LedgerFilters({
  tipo,
  produto,
  produtos,
  rotuloProduto,
  rotuloVendas,
}: {
  tipo: string;
  produto: string;
  produtos: readonly ProdutoParaMovimentar[];
  rotuloProduto: string;
  /** "Vendas", ou o que o nicho chama de venda — já no plural e com maiúscula. */
  rotuloVendas: string;
}) {
  return (
    <FilterBar
      ocultos={{ aba: 'movimentos' }}
      filtros={
        <>
          <Select name="tipo" aria-label="Tipo" defaultValue={tipo} className="md:w-44">
            <option value="">Qualquer tipo</option>
            <option value="in">Entradas</option>
            <option value="out">Saídas</option>
            <option value="adjustment">Contagens</option>
            <option value="sale">{rotuloVendas}</option>
            <option value="sale_return">Devoluções</option>
          </Select>
          <Select
            name="produto"
            aria-label={rotuloProduto}
            defaultValue={produto}
            className="md:w-56"
          >
            <option value="">Qualquer {rotuloProduto.toLowerCase()}</option>
            {produtos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </Select>
        </>
      }
    />
  );
}
