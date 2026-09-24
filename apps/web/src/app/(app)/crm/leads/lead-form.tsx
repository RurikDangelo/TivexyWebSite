'use client';

import { useActionState, useRef } from 'react';

import { PainelDeCadastro } from '@/components/crm/create-panel';
import { Campo } from '@/components/ui/field';

import { criarLead } from './actions';
import { LEAD_INICIAL } from './state';

/**
 * Cadastro rápido de lead.
 *
 * O painel, a limpeza depois de salvar e o botão que desabilita enquanto grava
 * vivem em `components/crm/create-panel.tsx` — saíram daqui quando a terceira
 * tela de CRM precisou do mesmo comportamento. Aqui ficam só os campos, que
 * são desta tela.
 *
 * Só o nome é obrigatório, e isso é decisão de produto, não descuido. Um lead
 * é justamente o contato de quem ainda não se sabe quase nada — exigir e-mail
 * e telefone faria a pessoa inventar valores para conseguir salvar.
 */
export function LeadForm({ singular }: { singular: string }) {
  const [estado, acao] = useActionState(criarLead, LEAD_INICIAL);
  const primeiro = useRef<HTMLInputElement>(null);

  return (
    <PainelDeCadastro
      titulo={`Novo ${singular}`}
      acao={acao}
      estado={estado}
      confirmacao={(nome) => `${nome} foi cadastrado.`}
      aoSalvar={() => primeiro.current?.focus()}
    >
      <Campo
        nome="name"
        rotulo="Nome"
        obrigatorio
        referencia={primeiro}
        erro={estado.campos.name}
        placeholder="Maria Souza"
      />
      <Campo
        nome="company_name"
        rotulo="Empresa"
        dica="Texto livre — ainda não vira cadastro de conta."
        placeholder="Padaria do Bairro"
      />
      <Campo
        nome="email"
        rotulo="E-mail"
        tipo="email"
        erro={estado.campos.email}
        placeholder="maria@exemplo.com.br"
      />
      <Campo
        nome="phone"
        rotulo="Telefone"
        tipo="tel"
        erro={estado.campos.phone}
        placeholder="(11) 90000-0000"
      />
      <Campo
        nome="source"
        rotulo="Origem"
        dica="De onde veio: indicação, Instagram, feira."
        placeholder="Indicação"
      />
    </PainelDeCadastro>
  );
}
