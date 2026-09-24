'use client';

import { useActionState, useRef, useState } from 'react';

import {
  AUTOMATION_ACTIONS,
  AUTOMATION_ACTION_LABEL,
  AUTOMATION_EVENTS,
  AUTOMATION_EVENT_FIELDS,
  AUTOMATION_EVENT_LABEL,
  AUTOMATION_OPERATORS,
  AUTOMATION_OPERATOR_LABEL,
  type AutomationActionKind,
  type AutomationEvent,
  type AutomationOperator,
  needsValue,
} from '@tivexy/core';
import { PainelDeCadastro } from '@/components/crm/create-panel';
import { Campo, CampoSelecao } from '@/components/ui/field';

import { criarRegra } from './actions';
import { REGRA_INICIAL } from './state';

/**
 * Montar uma regra: gatilho → condição → ação.
 *
 * **Os campos disponíveis mudam com o gatilho**, e isso não é enfeite: uma
 * condição sobre um campo que aquele gatilho nunca traz é salva, nunca
 * dispara e não dá erro. `checkRule()` recusa no servidor; oferecer só o que
 * existe é o que impede a pessoa de chegar lá.
 *
 * Uma condição e uma ação, de propósito. O esquema e o motor já aceitam
 * várias — falta a interface, e ela vem quando alguém pedir. Construir a tela
 * grande antes de alguém usar a pequena é o tipo de coisa que se descobre
 * depois que ninguém precisava.
 */
export function RuleForm() {
  const [estado, acao] = useActionState(criarRegra, REGRA_INICIAL);
  const [gatilho, setGatilho] = useState<AutomationEvent>('crm.lead.created');
  const [operador, setOperador] = useState<AutomationOperator>('eq');
  const [tipoAcao, setTipoAcao] = useState<AutomationActionKind>('crm.activity.create');
  const primeiro = useRef<HTMLInputElement>(null);

  const campos = AUTOMATION_EVENT_FIELDS[gatilho];
  const problema = (caminho: string) => estado.problemas.find((p) => p.path === caminho)?.message;

  return (
    <PainelDeCadastro
      titulo="Nova automação"
      acao={acao}
      estado={{ erro: estado.erro, criado: estado.criada }}
      confirmacao={(nome) => `"${nome}" está valendo.`}
      rotuloEnviar="Criar regra"
      aoSalvar={() => primeiro.current?.focus()}
    >
      <Campo
        nome="name"
        rotulo="Nome da regra"
        obrigatorio
        referencia={primeiro}
        erro={problema('name')}
        placeholder="Ligar para todo lead do Instagram"
        className="sm:col-span-2"
      />

      <CampoSelecao
        nome="event"
        rotulo="Quando"
        obrigatorio
        padrao={gatilho}
        erro={problema('event')}
        className="sm:col-span-2"
        opcoes={AUTOMATION_EVENTS.map((e) => ({ valor: e, texto: AUTOMATION_EVENT_LABEL[e] }))}
        aoMudar={(valor) => setGatilho(valor as AutomationEvent)}
      />

      <fieldset className="grid gap-4 rounded-md border border-line-subtle p-3 sm:col-span-2 sm:grid-cols-3">
        <legend className="px-1 text-xs text-content-subtle">
          Só se… <span className="text-content-subtle">(opcional)</span>
        </legend>

        <CampoSelecao
          nome="cond_field"
          rotulo="Campo"
          vazio="Sempre"
          erro={problema('conditions[0].field')}
          /* A chave força o React a remontar quando o gatilho muda: sem ela,
             o campo escolhido do gatilho anterior continuaria selecionado. */
          key={`campo-${gatilho}`}
          opcoes={campos.map((c) => ({ valor: c, texto: c }))}
        />
        <CampoSelecao
          nome="cond_operator"
          rotulo="Condição"
          padrao="eq"
          erro={problema('conditions[0].operator')}
          opcoes={AUTOMATION_OPERATORS.map((o) => ({
            valor: o,
            texto: AUTOMATION_OPERATOR_LABEL[o],
          }))}
          aoMudar={(valor) => setOperador(valor as AutomationOperator)}
        />
        {needsValue(operador) ? (
          <Campo nome="cond_value" rotulo="Valor" erro={problema('conditions[0].value')} />
        ) : (
          /* `exists` e `empty` não usam valor. Mostrar o campo desabilitado
             seria mais ruído que ausência. */
          <p className="self-end text-xs text-content-subtle">
            “{AUTOMATION_OPERATOR_LABEL[operador]}” não precisa de valor.
          </p>
        )}
      </fieldset>

      <fieldset className="grid gap-4 rounded-md border border-line-subtle p-3 sm:col-span-2 sm:grid-cols-2">
        <legend className="px-1 text-xs text-content-subtle">Então</legend>

        <CampoSelecao
          nome="acao_kind"
          rotulo="Ação"
          obrigatorio
          padrao={tipoAcao}
          erro={problema('actions[0].kind')}
          className="sm:col-span-2"
          opcoes={AUTOMATION_ACTIONS.map((a) => ({ valor: a, texto: AUTOMATION_ACTION_LABEL[a] }))}
          aoMudar={(valor) => setTipoAcao(valor as AutomationActionKind)}
        />

        {tipoAcao === 'crm.activity.create' ? (
          <>
            <Campo
              nome="acao_subject"
              rotulo="Assunto"
              obrigatorio
              erro={problema('actions[0].params.subject')}
              placeholder="Ligar para {{name}}"
              dica="Use {{campo}} para trazer o dado do evento."
            />
            <Campo
              nome="acao_dueInDays"
              rotulo="Prazo em dias"
              obrigatorio
              padrao="1"
              erro={problema('actions[0].params.dueInDays')}
            />
          </>
        ) : (
          <>
            <CampoSelecao
              nome="acao_finance_kind"
              rotulo="Tipo"
              obrigatorio
              padrao="receivable"
              erro={problema('actions[0].params.kind')}
              opcoes={[
                { valor: 'receivable', texto: 'A receber' },
                { valor: 'payable', texto: 'A pagar' },
              ]}
            />
            <Campo
              nome="acao_description"
              rotulo="Descrição"
              obrigatorio
              erro={problema('actions[0].params.description')}
              placeholder="Comissão da venda #{{number}}"
            />
            <Campo
              nome="acao_amountCents"
              rotulo="Valor em centavos"
              obrigatorio
              erro={problema('actions[0].params.amountCents')}
              placeholder="{{totalCents}}"
              dica="Centavos inteiros, ou um campo do evento."
            />
            <Campo
              nome="acao_dueInDays"
              rotulo="Vence em quantos dias"
              obrigatorio
              padrao="30"
              erro={problema('actions[0].params.dueInDays')}
            />
          </>
        )}
      </fieldset>

      {estado.problemas.length > 0 && (
        <p role="alert" className="text-sm text-danger sm:col-span-2">
          {estado.problemas.length === 1
            ? 'Há um problema na regra.'
            : `Há ${estado.problemas.length} problemas na regra.`}{' '}
          Eles estão marcados nos campos.
        </p>
      )}
    </PainelDeCadastro>
  );
}
