import type { ReactNode, RefObject } from 'react';

import { cn } from '@/lib/utils';

import { Input, Label, Select, Textarea } from './input';

/**
 * Um campo de formulário com rótulo, dica e erro.
 *
 * Nasceu dentro da tela de leads e saiu de lá quando a segunda tela de CRM
 * precisou do mesmo campo. A duplicação aqui não seria de estilo — seria de
 * **acessibilidade**: `aria-describedby` apontando para o id certo, `role="alert"`
 * na mensagem, o `(opcional)` no rótulo em vez de um asterisco que leitor de
 * tela não anuncia. Esse conjunto é fácil de escrever errado na terceira cópia,
 * e o erro não aparece para quem enxerga a tela.
 *
 * O padrão é **opcional**: `obrigatorio` é o que se declara. A maior parte dos
 * campos de CRM é opcional de propósito — quem cadastra um contato no meio de
 * uma ligação não tem o CNPJ à mão, e exigir faz a pessoa inventar valor.
 */

interface Comum {
  nome: string;
  rotulo: string;
  obrigatorio?: boolean;
  dica?: string;
  erro?: string;
  /** Para o campo ocupar as duas colunas da grade, por exemplo. */
  className?: string;
}

/**
 * O invólucro: rótulo em cima, campo no meio, erro e dica embaixo.
 *
 * Os ids saem do nome do campo, então o `aria-describedby` do controle e o
 * `id` da mensagem não têm como divergir.
 */
function Envoltorio({
  nome,
  rotulo,
  obrigatorio = false,
  dica,
  erro,
  className,
  children,
}: Comum & { children: (aria: AriaDoCampo) => ReactNode }) {
  const idDica = dica !== undefined ? `${nome}-dica` : undefined;
  const idErro = erro !== undefined ? `${nome}-erro` : undefined;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={nome}>
        {rotulo}
        {!obrigatorio && <span className="ml-1 text-xs text-content-subtle">(opcional)</span>}
      </Label>

      {children({
        id: nome,
        name: nome,
        required: obrigatorio,
        'aria-invalid': erro !== undefined,
        'aria-describedby': [idErro, idDica].filter(Boolean).join(' ') || undefined,
      })}

      {erro !== undefined && (
        <p id={idErro} role="alert" className="text-xs text-danger">
          {erro}
        </p>
      )}
      {dica !== undefined && (
        <p id={idDica} className="text-xs text-content-subtle">
          {dica}
        </p>
      )}
    </div>
  );
}

/** O que o invólucro entrega pronto para o controle. */
interface AriaDoCampo {
  id: string;
  name: string;
  required: boolean;
  'aria-invalid': boolean;
  'aria-describedby': string | undefined;
}

export function Campo({
  tipo = 'text',
  placeholder,
  padrao,
  referencia,
  ...comum
}: Comum & {
  tipo?: string;
  placeholder?: string;
  padrao?: string;
  referencia?: RefObject<HTMLInputElement | null>;
}) {
  return (
    <Envoltorio {...comum}>
      {(aria) => (
        <Input
          {...aria}
          ref={referencia}
          type={tipo}
          placeholder={placeholder}
          defaultValue={padrao}
        />
      )}
    </Envoltorio>
  );
}

export interface Opcao {
  valor: string;
  texto: string;
}

/**
 * Escolha entre valores que **existem**.
 *
 * As opções sempre vêm de uma consulta já filtrada pelo tenant. Isso não é
 * detalhe de interface: as chaves estrangeiras do CRM são compostas
 * (`tenant_id, id`), então um id de outra empresa é recusado pelo Postgres —
 * mas o erro que chega na tela fala de constraint, não de escolha inválida.
 * Oferecer só o que é desta empresa é o que impede a pessoa de chegar lá.
 */
export function CampoSelecao({
  opcoes,
  vazio,
  padrao,
  ...comum
}: Comum & { opcoes: readonly Opcao[]; vazio?: string; padrao?: string }) {
  return (
    <Envoltorio {...comum}>
      {(aria) => (
        <Select {...aria} defaultValue={padrao ?? ''}>
          {vazio !== undefined && <option value="">{vazio}</option>}
          {opcoes.map((opcao) => (
            <option key={opcao.valor} value={opcao.valor}>
              {opcao.texto}
            </option>
          ))}
        </Select>
      )}
    </Envoltorio>
  );
}

export function CampoTexto({
  placeholder,
  linhas = 3,
  padrao,
  ...comum
}: Comum & { placeholder?: string; linhas?: number; padrao?: string }) {
  return (
    <Envoltorio {...comum}>
      {(aria) => (
        <Textarea {...aria} rows={linhas} placeholder={placeholder} defaultValue={padrao} />
      )}
    </Envoltorio>
  );
}
