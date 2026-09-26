'use client';

import type { FinanceDirection } from '@tivexy/core';
import { Plus } from 'lucide-react';
import { useActionState, useEffect, useRef, useState } from 'react';

import { Field, describedBy } from '@/components/form/field';
import { FormError } from '@/components/form/messages';
import { Submit } from '@/components/form/submit';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';

import { criarLancamento } from './actions';
import { LANCAMENTO_INICIAL, type LancamentoFormState } from './state';

interface Props {
  direcao: FinanceDirection;
  hoje: string;
  /** Categorias já usadas nesta empresa, para o campo sugerir e ninguém digitar "aluguel" e "Aluguel". */
  categorias: readonly string[];
}

const TEXTOS: Record<
  FinanceDirection,
  { botao: string; quem: string; exemploQuem: string; exemplo: string; pago: string; ajuda: string }
> = {
  receivable: {
    botao: 'Lançar conta a receber',
    quem: 'De quem',
    exemploQuem: 'Condomínio Solar',
    exemplo: 'Serviço de outubro',
    pago: 'Já recebido',
    ajuda: 'Venda a prazo já entra sozinha. Aqui é o que não veio de venda.',
  },
  payable: {
    botao: 'Lançar conta a pagar',
    quem: 'Para quem',
    exemploQuem: 'Imobiliária Centro',
    exemplo: 'Aluguel de outubro',
    pago: 'Já pago',
    ajuda: 'Aluguel, luz, fornecedor: o vencimento entra no fluxo de caixa.',
  },
};

/**
 * O lançamento avulso — o dinheiro da empresa que não veio de uma venda.
 *
 * Em diálogo, e não num painel que empurra a lista: o formulário tem oito
 * campos e abria acima da tabela, jogando os lançamentos para fora da primeira
 * tela justamente quando a pessoa precisava conferir se já não havia lançado
 * aquilo. Assim o gatilho mora no cabeçalho da página — a única ação `brand`
 * da tela — e a lista continua visível atrás.
 *
 * A confirmação é toast: um `FormSuccess` que fica para sempre ao lado do
 * botão acaba sendo lido como o retorno do lançamento seguinte.
 */
export function EntryForm(props: Props) {
  const [aberto, setAberto] = useState(false);
  const [estado, acao] = useActionState(criarLancamento, LANCAMENTO_INICIAL);
  const { mostrar } = useToast();
  const t = TEXTOS[props.direcao];

  /*
   * `rodada` só avança quando o insert passou — é o sinal de sucesso que o
   * estado já carregava para limpar os campos. Comparar com o valor anterior
   * evita reagir a uma renderização qualquer.
   */
  const rodadaVista = useRef(estado.rodada);
  useEffect(() => {
    if (estado.rodada === rodadaVista.current) return;
    rodadaVista.current = estado.rodada;
    mostrar({ tom: 'sucesso', titulo: estado.ok ?? 'Lançamento feito.' });
    setAberto(false);
  }, [estado, mostrar]);

  return (
    <>
      <Button type="button" onClick={() => setAberto(true)}>
        <Plus aria-hidden />
        {t.botao}
      </Button>

      <Dialog
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        tamanho="lg"
        titulo={t.botao}
        descricao={t.ajuda}
      >
        <form action={acao} className="flex flex-col gap-4">
          <input type="hidden" name="direcao" value={props.direcao} />
          <Campos key={estado.rodada} {...props} estado={estado} />
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line-subtle pt-4">
            <Button type="button" variant="outline" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Submit pendente="Lançando…">Lançar</Submit>
          </div>
        </form>
      </Dialog>
    </>
  );
}

function Campos({ direcao, hoje, categorias, estado }: Props & { estado: LancamentoFormState }) {
  const e = estado.campos;
  const t = TEXTOS[direcao];
  const [jaPago, setJaPago] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      {estado.erro !== null && <FormError>{estado.erro}</FormError>}
      {/* `gap-3`: campos de um mesmo formulário, não regiões de página (seção 5). */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          nome="descricao"
          rotulo="Descrição"
          obrigatorio
          erro={e.descricao}
          className="sm:col-span-2"
        >
          <Input
            id="descricao"
            name="descricao"
            required
            maxLength={160}
            autoComplete="off"
            placeholder={t.exemplo}
            aria-invalid={e.descricao !== undefined}
            aria-describedby={describedBy('descricao', e.descricao)}
          />
        </Field>
        <Field nome="valor" rotulo="Valor" obrigatorio erro={e.valor}>
          <div className="relative">
            <span
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-body text-content-subtle"
              aria-hidden
            >
              R$
            </span>
            <Input
              id="valor"
              name="valor"
              required
              inputMode="decimal"
              autoComplete="off"
              placeholder="2.500,00"
              className="pl-9 tabular-nums"
              aria-invalid={e.valor !== undefined}
              aria-describedby={describedBy('valor', e.valor)}
            />
          </div>
        </Field>
        <Field nome="vencimento" rotulo="Vencimento" obrigatorio erro={e.vencimento}>
          <Input
            id="vencimento"
            name="vencimento"
            type="date"
            required
            defaultValue={hoje}
            aria-invalid={e.vencimento !== undefined}
            aria-describedby={describedBy('vencimento', e.vencimento)}
          />
        </Field>
        <Field nome="contraparte" rotulo={t.quem} erro={e.contraparte}>
          <Input
            id="contraparte"
            name="contraparte"
            maxLength={160}
            autoComplete="off"
            placeholder={t.exemploQuem}
            aria-invalid={e.contraparte !== undefined}
            aria-describedby={describedBy('contraparte', e.contraparte)}
          />
        </Field>
        <Field nome="categoria" rotulo="Categoria" erro={e.categoria}>
          <Input
            id="categoria"
            name="categoria"
            maxLength={60}
            autoComplete="off"
            list="categorias-usadas"
            placeholder="Aluguel, Luz, Fornecedores"
            aria-invalid={e.categoria !== undefined}
            aria-describedby={describedBy('categoria', e.categoria)}
          />
          <datalist id="categorias-usadas">
            {categorias.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>

        <div className="flex flex-col gap-3 rounded-control border border-line-subtle p-3 sm:col-span-2">
          <label className="flex items-center gap-3 text-label text-content-default">
            <Switch
              name="jaPago"
              checked={jaPago}
              onChange={(ev) => setJaPago(ev.target.checked)}
            />
            {t.pago}
          </label>
          {jaPago && (
            <Field nome="pagoEm" rotulo="Em que dia" obrigatorio erro={e.pagoEm}>
              <Input
                id="pagoEm"
                name="pagoEm"
                type="date"
                required
                max={hoje}
                defaultValue={hoje}
                className="sm:max-w-48"
                aria-invalid={e.pagoEm !== undefined}
                aria-describedby={describedBy('pagoEm', e.pagoEm)}
              />
            </Field>
          )}
        </div>

        <Field nome="observacao" rotulo="Observação" erro={e.observacao} className="sm:col-span-2">
          <Textarea id="observacao" name="observacao" maxLength={1000} className="min-h-16" />
        </Field>
      </div>
    </div>
  );
}
