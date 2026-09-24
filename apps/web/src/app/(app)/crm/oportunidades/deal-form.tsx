'use client';

import { useActionState, useRef } from 'react';

import { PainelDeCadastro } from '@/components/crm/create-panel';
import { Campo, CampoSelecao, CampoTexto, type Opcao } from '@/components/ui/field';

import { criarOportunidade } from './actions';
import { type EtapaDoFunil, OPORTUNIDADE_INICIAL } from './state';

/**
 * Cadastro de oportunidade direto no funil.
 *
 * Nem todo negócio começa como lead. Quem já é cliente liga pedindo a segunda
 * compra, e obrigar essa conversa a virar lead para depois ser convertida é
 * burocracia de sistema — o histórico ficaria com um lead que nunca existiu.
 *
 * O funil **não** é um campo: ele é deduzido da etapa, no servidor. Ver o
 * cabeçalho de `actions.ts`.
 */
export function DealForm({
  singular,
  etapas,
  empresas,
  contatos,
  rotuloEmpresa,
  rotuloContato,
}: {
  singular: string;
  etapas: readonly EtapaDoFunil[];
  empresas: readonly Opcao[];
  contatos: readonly Opcao[];
  rotuloEmpresa: string;
  rotuloContato: string;
}) {
  const [estado, acao] = useActionState(criarOportunidade, OPORTUNIDADE_INICIAL);
  const primeiro = useRef<HTMLInputElement>(null);

  /*
   * A primeira etapa aberta é o começo do funil, e é onde a maior parte das
   * oportunidades nasce. Deixar a escolha em branco faria a pessoa abrir a
   * lista toda vez para escolher o óbvio.
   */
  const inicial = etapas.find((e) => e.tipo === 'open')?.id ?? etapas[0]?.id;

  return (
    <PainelDeCadastro
      titulo={`Nova ${singular}`}
      acao={acao}
      estado={estado}
      confirmacao={(titulo) => `${titulo} entrou no funil.`}
      aoSalvar={() => primeiro.current?.focus()}
    >
      <Campo
        nome="title"
        rotulo="Título"
        obrigatorio
        referencia={primeiro}
        erro={estado.campos.title}
        placeholder="Reforma da fachada"
        dica="O que está sendo negociado."
      />
      <CampoSelecao
        nome="stage_id"
        rotulo="Etapa"
        obrigatorio
        padrao={inicial}
        erro={estado.campos.stage_id}
        opcoes={etapas.map((e) => ({ valor: e.id, texto: e.nome }))}
      />
      <Campo
        nome="value_cents"
        rotulo="Valor"
        erro={estado.campos.value_cents}
        placeholder="4.500,00"
        dica="Em branco vale zero — dá para preencher quando souber."
      />
      <Campo
        nome="expected_close_date"
        rotulo="Previsão de fechamento"
        tipo="date"
        erro={estado.campos.expected_close_date}
      />

      {empresas.length > 0 && (
        <CampoSelecao nome="company_id" rotulo={rotuloEmpresa} vazio="Nenhuma" opcoes={empresas} />
      )}
      {contatos.length > 0 && (
        <CampoSelecao nome="contact_id" rotulo={rotuloContato} vazio="Nenhum" opcoes={contatos} />
      )}

      <CampoTexto
        nome="notes"
        rotulo="Observações"
        className="sm:col-span-2"
        placeholder="O que ficou combinado na última conversa."
      />
    </PainelDeCadastro>
  );
}
