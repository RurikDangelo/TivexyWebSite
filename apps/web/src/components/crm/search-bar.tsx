import { Search } from 'lucide-react';

import { Input, Select } from '@/components/ui/input';

/**
 * A barra de busca e filtro das listagens.
 *
 * **É um `form` com `method="get"`**, não um campo que escuta digitação. Três
 * consequências, todas boas:
 *
 * - funciona sem JavaScript;
 * - o resultado fica na URL, então dá para guardar nos favoritos, mandar para
 *   um colega e voltar com o botão do navegador;
 * - não dispara uma consulta por tecla digitada, que é o que transforma uma
 *   listagem de mil linhas numa tela lenta e num banco ocupado.
 *
 * O custo é um Enter a mais. Numa listagem que se procura de vez em quando,
 * é o custo certo.
 *
 * Componente de servidor: não há estado nenhum aqui. O valor atual vem da URL,
 * que é onde ele deveria estar desde o começo.
 */
export function BarraDeBusca({
  termo,
  placeholder,
  filtro,
  extras,
}: {
  termo: string;
  placeholder: string;
  /** Um seletor de estado, quando a listagem tiver um. */
  filtro?: {
    nome: string;
    rotulo: string;
    valor: string;
    opcoes: readonly { valor: string; texto: string }[];
  };
  /**
   * Outros parâmetros da URL que precisam sobreviver à busca — o funil
   * escolhido, por exemplo. Sem isto, buscar jogaria a pessoa de volta para o
   * funil padrão sem aviso.
   */
  extras?: Readonly<Record<string, string>>;
}) {
  return (
    <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
      {Object.entries(extras ?? {}).map(([nome, valor]) => (
        <input key={nome} type="hidden" name={nome} value={valor} />
      ))}

      <div className="relative min-w-0 flex-1">
        <label className="sr-only" htmlFor="b">
          Buscar
        </label>
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-content-subtle"
          aria-hidden
        />
        <Input
          id="b"
          name="b"
          type="search"
          defaultValue={termo}
          placeholder={placeholder}
          className="pl-9"
        />
      </div>

      {filtro !== undefined && (
        <div className="flex flex-col gap-1.5">
          <label className="sr-only" htmlFor={filtro.nome}>
            {filtro.rotulo}
          </label>
          <Select
            id={filtro.nome}
            name={filtro.nome}
            defaultValue={filtro.valor}
            className="w-auto"
          >
            {filtro.opcoes.map((opcao) => (
              <option key={opcao.valor} value={opcao.valor}>
                {opcao.texto}
              </option>
            ))}
          </Select>
        </div>
      )}

      <button
        type="submit"
        className="h-9.5 rounded-md border border-line-strong px-4 text-sm text-content-default transition-colors hover:bg-surface-muted"
      >
        Buscar
      </button>
    </form>
  );
}

/**
 * O que dizer quando a busca não achou nada.
 *
 * Separado do estado vazio de "não há nenhum cadastro ainda", e a diferença
 * importa: um manda cadastrar o primeiro, o outro manda limpar a busca. Trocar
 * os dois faz a pessoa achar que perdeu os dados.
 */
export function SemResultado({ termo, limpar }: { termo: string; limpar: string }) {
  return (
    <div className="rounded-lg border border-dashed border-line-subtle px-4 py-10 text-center">
      <p className="text-sm text-content">
        Nada encontrado para <strong>{termo}</strong>.
      </p>
      <a href={limpar} className="mt-1 inline-block text-sm text-content-accent hover:underline">
        Limpar a busca
      </a>
    </div>
  );
}
