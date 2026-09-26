import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import type { FiltroDeSituacao, ProdutoParaMovimentar } from './state';

export type Aba = 'saldo' | 'movimentos';

/** Saldo e razão, como abas de endereço: cada uma é um link que se manda. */
export function StockTabs({ aba, comRazao }: { aba: Aba; comRazao: boolean }) {
  if (!comRazao) return null;
  const abas: { chave: Aba; rotulo: string; href: string }[] = [
    { chave: 'saldo', rotulo: 'Saldo', href: '/erp/estoque' },
    { chave: 'movimentos', rotulo: 'Movimentações', href: '/erp/estoque?aba=movimentos' },
  ];
  return (
    <nav aria-label="Estoque" className="mb-6 flex gap-1 border-b border-line-subtle">
      {abas.map((a) => (
        <Link
          key={a.chave}
          href={a.href}
          aria-current={aba === a.chave ? 'page' : undefined}
          className={cn(
            '-mb-px border-b-2 px-3 py-2 text-sm transition-colors',
            aba === a.chave
              ? 'border-surface-brand font-medium text-content'
              : 'border-transparent text-content-muted hover:text-content',
          )}
        >
          {a.rotulo}
        </Link>
      ))}
    </nav>
  );
}

export function LevelFilters({
  q,
  situacao,
  plural,
}: {
  q: string;
  situacao: FiltroDeSituacao;
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
        placeholder="Nome ou código"
        className="min-w-0 sm:flex-1"
      />
      <div className="grid grid-cols-[1fr_auto] gap-2 sm:flex">
        <Select name="situacao" aria-label="Situação" defaultValue={situacao} className="sm:w-48">
          <option value="todos">Todas as situações</option>
          <option value="repor">Pedem reposição</option>
          <option value="negativo">Saldo negativo</option>
          <option value="em-dia">Em dia</option>
        </Select>
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
      </div>
    </form>
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
    <form method="get" className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <input type="hidden" name="aba" value="movimentos" />
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-1">
        <Select name="tipo" aria-label="Tipo" defaultValue={tipo} className="sm:w-44">
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
          className="min-w-0 sm:flex-1"
        >
          <option value="">Qualquer {rotuloProduto.toLowerCase()}</option>
          {produtos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </Select>
      </div>
      <Button type="submit" variant="outline">
        Filtrar
      </Button>
    </form>
  );
}
