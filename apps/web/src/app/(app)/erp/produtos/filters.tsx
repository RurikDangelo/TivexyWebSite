import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';

import type { Opcao, Situacao } from './state';

/**
 * Busca e filtros da lista, por GET.
 *
 * Filtrar não muda estado, então é endereço: "o que está fora de venda em
 * Bebidas" vira um link que se manda para quem vai conferir. Sem JavaScript
 * funciona igual.
 */
export function ProductFilters({
  q,
  categoria,
  situacao,
  categorias,
  plural,
}: {
  q: string;
  categoria: string;
  situacao: Situacao;
  categorias: readonly Opcao[];
  plural: string;
}) {
  return (
    <form role="search" method="get" className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Label htmlFor="q" className="sr-only">
        Buscar {plural}
      </Label>
      <Input
        id="q"
        name="q"
        type="search"
        defaultValue={q}
        placeholder="Nome, código ou código de barras"
        className="min-w-0 sm:flex-1"
      />
      <div className="grid grid-cols-[1.5fr_1fr] gap-2 sm:flex">
        <Select
          name="categoria"
          aria-label="Categoria"
          defaultValue={categoria}
          className="sm:w-44"
        >
          <option value="">Todas as categorias</option>
          <option value="sem">Sem categoria</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </Select>
        <Select name="situacao" aria-label="Situação" defaultValue={situacao} className="sm:w-36">
          <option value="ativos">À venda</option>
          <option value="fora">Fora de venda</option>
          <option value="todos">Todos</option>
        </Select>
      </div>
      <Button type="submit" variant="outline">
        Filtrar
      </Button>
    </form>
  );
}
