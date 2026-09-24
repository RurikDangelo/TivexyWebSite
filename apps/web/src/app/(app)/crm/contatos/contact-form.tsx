'use client';

import { useActionState, useRef } from 'react';

import { PainelDeCadastro } from '@/components/crm/create-panel';
import { Campo, CampoSelecao, CampoTexto } from '@/components/ui/field';

import { criarContato } from './actions';
import { CONTATO_INICIAL, type EmpresaOferecida } from './state';

/**
 * Cadastro de pessoa.
 *
 * A conta é opcional, e o esquema concorda: `company_id` é nulo por padrão,
 * com o comentário "pessoa sem conta é comum e legítimo — consumidor final,
 * indicação". Numa clínica, a maior parte dos contatos nunca vai pertencer a
 * empresa nenhuma.
 *
 * Quando ainda não há conta cadastrada, a escolha some em vez de aparecer
 * vazia: um `select` com uma opção só, dizendo "nenhuma", faz a pessoa
 * procurar o que fazer ali.
 */
export function ContactForm({
  singular,
  rotuloEmpresa,
  empresas,
}: {
  singular: string;
  rotuloEmpresa: string;
  empresas: readonly EmpresaOferecida[];
}) {
  const [estado, acao] = useActionState(criarContato, CONTATO_INICIAL);
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
        nome="title"
        rotulo="Cargo"
        placeholder="Compras"
        dica="Texto livre: cada negócio usa o seu."
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

      {empresas.length > 0 && (
        <CampoSelecao
          nome="company_id"
          rotulo={rotuloEmpresa}
          erro={estado.campos.company_id}
          vazio="Nenhuma — pessoa sozinha"
          opcoes={empresas.map((e) => ({ valor: e.id, texto: e.nome }))}
          dica="Só aparecem as que já estão cadastradas."
        />
      )}

      <CampoTexto
        nome="notes"
        rotulo="Observações"
        className="sm:col-span-2"
        placeholder="O que é bom lembrar antes da próxima conversa."
      />
    </PainelDeCadastro>
  );
}
