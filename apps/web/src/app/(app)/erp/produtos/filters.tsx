import { FilterBar } from '@/components/page/filter-bar';
import { Select } from '@/components/ui/input';

import type { Opcao, Ordem, Situacao } from './state';

export interface ProductFiltersProps {
  q: string;
  categoria: string;
  situacao: Situacao;
  categorias: readonly Opcao[];
  plural: string;
  /** `null` quando o endereço não pede ordem — aí não há o que preservar. */
  ordem: Ordem | null;
  className?: string;
}

/**
 * Busca e filtros da lista, por GET.
 *
 * Filtrar não muda estado, então é endereço: "o que está fora de venda em
 * Bebidas" vira um link que se manda para quem vai conferir. Sem JavaScript
 * funciona igual.
 *
 * O layout inteiro é da `FilterBar` — eram quatro grades divergentes no ERP,
 * uma por tela, e esta era a do `grid-cols-[1.5fr_1fr]`. A lupa no campo veio
 * junto: até agora ela só existia no CRM.
 */
export function ProductFilters({
  q,
  categoria,
  situacao,
  categorias,
  plural,
  ordem,
  className,
}: ProductFiltersProps) {
  return (
    <FilterBar
      className={className}
      busca={{
        rotulo: `Buscar ${plural}`,
        placeholder: 'Nome, código ou código de barras',
        valor: q,
      }}
      /* O GET reescreve a query inteira: sem isto, filtrar desfaria a ordenação. */
      ocultos={ordem === null ? undefined : { ordem }}
      filtros={
        <>
          <Select
            name="categoria"
            aria-label="Categoria"
            defaultValue={categoria}
            className="md:w-48"
          >
            <option value="">Todas as categorias</option>
            <option value="sem">Sem categoria</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
          <Select name="situacao" aria-label="Situação" defaultValue={situacao} className="md:w-40">
            <option value="ativos">À venda</option>
            <option value="fora">Fora de venda</option>
            <option value="todos">Todos</option>
          </Select>
        </>
      }
    />
  );
}
