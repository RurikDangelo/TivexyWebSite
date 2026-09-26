'use client';

import type { FinanceDirection } from '@tivexy/core';
import { Plus, X } from 'lucide-react';
import { useActionState, useState } from 'react';

import { Field, describedBy } from '@/components/form/field';
import { FormError, FormSuccess } from '@/components/form/messages';
import { Submit } from '@/components/form/submit';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

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
  { botao: string; quem: string; exemploQuem: string; exemplo: string; pago: string }
> = {
  receivable: {
    botao: 'Lançar conta a receber',
    quem: 'De quem',
    exemploQuem: 'Condomínio Solar',
    exemplo: 'Serviço de outubro',
    pago: 'Já recebido',
  },
  payable: {
    botao: 'Lançar conta a pagar',
    quem: 'Para quem',
    exemploQuem: 'Imobiliária Centro',
    exemplo: 'Aluguel de outubro',
    pago: 'Já pago',
  },
};

/**
 * O lançamento avulso — o dinheiro da empresa que não veio de uma venda.
 *
 * "Já pago" registra o que aconteceu e ficou sem lançar: o aluguel de ontem.
 * Sem ele, o lançamento nasce em aberto, e o vencimento decide o previsto.
 */
export function EntryForm(props: Props) {
  const [aberto, setAberto] = useState(false);
  const [estado, acao] = useActionState(criarLancamento, LANCAMENTO_INICIAL);
  const t = TEXTOS[props.direcao];

  if (!aberto) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => setAberto(true)}>
          <Plus aria-hidden />
          {t.botao}
        </Button>
        {estado.ok !== null && <FormSuccess>{estado.ok}</FormSuccess>}
      </div>
    );
  }

  return (
    <form
      action={acao}
      className="animate-enter rounded-lg border border-line-subtle bg-surface-raised p-4 shadow-xs"
    >
      <input type="hidden" name="direcao" value={props.direcao} />
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="font-medium text-content">{t.botao}</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Fechar"
          onClick={() => setAberto(false)}
        >
          <X aria-hidden />
        </Button>
      </div>
      <Campos key={estado.rodada} {...props} estado={estado} />
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Submit>Lançar</Submit>
        <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
          Cancelar
        </Button>
        {estado.ok !== null && <FormSuccess>{estado.ok}</FormSuccess>}
      </div>
    </form>
  );
}

function Campos({ direcao, hoje, categorias, estado }: Props & { estado: LancamentoFormState }) {
  const e = estado.campos;
  const t = TEXTOS[direcao];
  const [jaPago, setJaPago] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      {estado.erro !== null && <FormError>{estado.erro}</FormError>}
      <div className="grid gap-4 sm:grid-cols-2">
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
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-content-subtle"
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

        <div className="flex flex-col gap-3 rounded-md border border-line-subtle p-3 sm:col-span-2">
          <label className="flex items-center gap-3 text-sm font-medium text-content-default">
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
