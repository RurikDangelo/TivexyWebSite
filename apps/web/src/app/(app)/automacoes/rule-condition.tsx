'use client';

import {
  type CampoDoGatilho,
  type ConditionOperator,
  OPERADORES_POR_TIPO,
  ROTULO_DO_OPERADOR,
} from '@tivexy/core';
import { X } from 'lucide-react';

import { Field, describedBy } from '@/components/form/field';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Tooltip } from '@/components/ui/tooltip';

import type { CondicaoRascunho } from './rule-draft';

export interface CondicaoLinhaProps {
  condicao: CondicaoRascunho;
  /** Todos os campos que o gatilho atual oferece. */
  opcoesDeCampo: readonly CampoDoGatilho[];
  /** Posição na lista, só para o rótulo acessível — a identidade é `condicao.chave`. */
  indice: number;
  /** Ids únicos: a mesma regra pode estar aberta duas vezes na página. */
  prefixo: string;
  erro: string | undefined;
  aoMudar: (parcial: Partial<CondicaoRascunho>) => void;
  aoRemover: () => void;
}

/**
 * Uma condição: campo, comparação e valor, mais o botão de tirar.
 *
 * Os três controles passam por `Field rotuloOculto` em vez do par
 * `<Label className="sr-only">` + `<p role="alert">` escrito à mão: era a
 * reimplementação do contrato de acessibilidade que o `Field` já tem, e cada
 * cópia podia errar o `aria-describedby` de um jeito diferente.
 */
export function CondicaoLinha({
  condicao,
  opcoesDeCampo,
  indice,
  prefixo,
  erro,
  aoMudar,
  aoRemover,
}: CondicaoLinhaProps) {
  const cid = `${prefixo}-cond-${condicao.chave}`;
  const ordinal = indice + 1;
  const campo = opcoesDeCampo.find((d) => d.campo === condicao.campo);
  const dinheiro = campo?.tipo === 'dinheiro';
  const idDoValor = `${cid}-valor`;

  return (
    <li
      /*
       * Três colunas no celular para o botão de remover subir para a primeira
       * linha: empilhado embaixo, ele ficava a uma altura de dedo do valor da
       * condição seguinte.
       */
      className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-start gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto]"
    >
      <Field
        nome={`${cid}-campo`}
        rotulo={`Campo da condição ${ordinal}`}
        rotuloOculto
        obrigatorio
        className="col-span-2 sm:col-span-1"
      >
        <Select
          id={`${cid}-campo`}
          value={condicao.campo}
          onChange={(e) => aoMudar({ campo: e.target.value })}
        >
          {opcoesDeCampo.map((d) => (
            <option key={d.campo} value={d.campo}>
              {d.rotulo}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        nome={`${cid}-op`}
        rotulo={`Comparação da condição ${ordinal}`}
        rotuloOculto
        obrigatorio
        className="col-start-1 row-start-2 sm:col-start-auto sm:row-start-auto"
      >
        <Select
          id={`${cid}-op`}
          value={condicao.operador}
          onChange={(e) => aoMudar({ operador: e.target.value as ConditionOperator })}
        >
          {(campo === undefined ? [] : OPERADORES_POR_TIPO[campo.tipo]).map((op) => (
            <option key={op} value={op}>
              {ROTULO_DO_OPERADOR[op]}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        nome={idDoValor}
        rotulo={`Valor da condição ${ordinal}`}
        rotuloOculto
        obrigatorio
        erro={erro}
        className="col-start-2 row-start-2 sm:col-start-auto sm:row-start-auto"
      >
        {campo?.tipo === 'opcao' ? (
          <Select
            id={idDoValor}
            value={condicao.valor}
            onChange={(e) => aoMudar({ valor: e.target.value })}
            aria-invalid={erro !== undefined}
            aria-describedby={describedBy(idDoValor, erro)}
          >
            {(campo.opcoes ?? []).map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </Select>
        ) : (
          <div className="relative">
            {dinheiro && (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-body text-content-subtle"
              >
                R$
              </span>
            )}
            <Input
              id={idDoValor}
              value={condicao.valor}
              onChange={(e) => aoMudar({ valor: e.target.value })}
              inputMode={dinheiro ? 'decimal' : undefined}
              maxLength={120}
              placeholder={dinheiro ? '1.000,00' : 'texto'}
              className={dinheiro ? 'pl-9 tabular-nums' : undefined}
              aria-invalid={erro !== undefined}
              aria-describedby={describedBy(idDoValor, erro)}
            />
          </div>
        )}
      </Field>

      {/*
       * `title=` nativo não aparece no foco por teclado — e este botão só tem
       * ícone. A colocação é explícita porque o botão vem por último no
       * documento (ordem de leitura e de tabulação certas) e precisa aparecer
       * na primeira linha do celular, ao lado do campo.
       */}
      <Tooltip
        conteudo="Remover condição"
        className="col-start-3 row-start-1 sm:col-start-auto sm:row-start-auto"
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Remover condição ${ordinal}`}
          onClick={aoRemover}
        >
          <X aria-hidden />
        </Button>
      </Tooltip>
    </li>
  );
}
