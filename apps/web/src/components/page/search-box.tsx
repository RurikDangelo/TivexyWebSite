import { Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';

/**
 * Busca por GET, no endereço.
 *
 * Buscar não muda estado, então é link — o resultado pode ser copiado,
 * voltado com o botão do navegador, e mandado para quem vai olhar junto. Sem
 * JavaScript funciona igual.
 */
export function SearchBox({
  valor,
  rotulo,
  placeholder,
}: {
  valor: string;
  rotulo: string;
  placeholder: string;
}) {
  return (
    <form role="search" method="get" className="flex w-full gap-2 sm:max-w-md">
      <Label htmlFor="q" className="sr-only">
        {rotulo}
      </Label>
      <div className="relative min-w-0 flex-1">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-content-subtle"
          aria-hidden
        />
        <Input
          id="q"
          name="q"
          type="search"
          defaultValue={valor}
          placeholder={placeholder}
          className="pl-9"
        />
      </div>
      <Button type="submit" variant="outline">
        Buscar
      </Button>
    </form>
  );
}
