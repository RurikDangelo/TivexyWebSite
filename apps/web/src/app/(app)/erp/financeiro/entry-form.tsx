'use client';

import { AlertTriangle } from 'lucide-react';
import { useActionState, useRef, useState } from 'react';

import { PainelDeCadastro } from '@/components/crm/create-panel';
import { Campo, CampoSelecao, type Opcao } from '@/components/ui/field';
import { Label } from '@/components/ui/input';

import { criarLancamento } from './actions';
import { LANCAMENTO_INICIAL } from './state';

/**
 * Lançar uma conta a pagar ou a receber.
 *
 * **A primeira pergunta é qual dos dois**, e não um campo no meio do
 * formulário: pagar e receber são operações com permissões diferentes no
 * banco, e trocar um pelo outro por descuido é o erro mais caro desta tela.
 */
export function EntryForm({ clientes }: { clientes: readonly Opcao[] }) {
  const [estado, acao] = useActionState(criarLancamento, LANCAMENTO_INICIAL);
  const [tipo, setTipo] = useState<'receivable' | 'payable'>('receivable');
  const primeiro = useRef<HTMLInputElement>(null);

  return (
    <PainelDeCadastro
      titulo="Novo lançamento"
      acao={acao}
      estado={estado}
      confirmacao={(descricao) => `"${descricao}" entrou no financeiro.`}
      rotuloEnviar="Lançar"
      aoSalvar={() => primeiro.current?.focus()}
    >
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label>Tipo</Label>
        <div className="flex flex-wrap gap-2">
          <Escolha
            valor="receivable"
            marcado={tipo === 'receivable'}
            aoEscolher={() => setTipo('receivable')}
            titulo="A receber"
            descricao="Dinheiro que entra"
            cor="var(--tvx-blue-500)"
          />
          <Escolha
            valor="payable"
            marcado={tipo === 'payable'}
            aoEscolher={() => setTipo('payable')}
            titulo="A pagar"
            descricao="Dinheiro que sai"
            cor="var(--tvx-danger-500)"
          />
        </div>
      </div>

      <Campo
        nome="description"
        rotulo="Descrição"
        obrigatorio
        referencia={primeiro}
        erro={estado.campos.description}
        placeholder={tipo === 'payable' ? 'Aluguel de outubro' : 'Serviço prestado em setembro'}
      />
      <Campo
        nome="amount_cents"
        rotulo="Valor"
        obrigatorio
        erro={estado.campos.amount_cents}
        placeholder="1.500,00"
      />
      <Campo
        nome="due_date"
        rotulo="Vencimento"
        tipo="date"
        obrigatorio
        erro={estado.campos.due_date}
        dica="É um dia no calendário, não um horário."
      />

      {clientes.length > 0 && (
        <CampoSelecao
          nome="company_id"
          rotulo="Empresa"
          vazio="Nenhuma"
          opcoes={clientes}
          dica="Vem do CRM."
        />
      )}

      <p className="flex items-start gap-1.5 text-xs text-warning sm:col-span-2">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>
          Isto é um <strong>livro de contas</strong>. Não gera boleto, não cobra e não fala com
          banco — o Tivexy não tem integração bancária nem emissão fiscal.
        </span>
      </p>
    </PainelDeCadastro>
  );
}

/**
 * A escolha entre pagar e receber.
 *
 * O `input` continua sendo um `radio` de verdade, escondido com `sr-only` — é
 * ele que carrega o valor e o que o teclado opera. O cartão é só o rótulo,
 * então `Tab` e leitor de tela seguem funcionando sem nada extra.
 *
 * O quadradinho colorido é o **mesmo** das séries do gráfico logo acima. Ver
 * a mesma cor nos dois lugares é o que liga o lançamento que a pessoa acabou
 * de fazer à barra que ele vai mexer.
 */
function Escolha({
  valor,
  marcado,
  aoEscolher,
  titulo,
  descricao,
  cor,
}: {
  valor: string;
  marcado: boolean;
  aoEscolher: () => void;
  titulo: string;
  descricao: string;
  cor: string;
}) {
  return (
    <label
      className={
        marcado
          ? 'flex flex-1 cursor-pointer items-start gap-2 rounded-md border border-content-accent bg-surface-accent-soft px-3 py-2 transition-colors'
          : 'flex flex-1 cursor-pointer items-start gap-2 rounded-md border border-line-field px-3 py-2 transition-colors hover:bg-surface-muted'
      }
    >
      <input
        type="radio"
        name="kind"
        value={valor}
        checked={marcado}
        onChange={aoEscolher}
        className="sr-only"
      />
      <span
        aria-hidden
        className="mt-1 size-2.5 shrink-0 rounded-[2px]"
        style={{ backgroundColor: cor }}
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-content">{titulo}</span>
        <span className="block text-xs text-content-subtle">{descricao}</span>
      </span>
    </label>
  );
}
