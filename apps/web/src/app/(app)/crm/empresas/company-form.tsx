'use client';

import { useActionState, useRef } from 'react';

import { PainelDeCadastro } from '@/components/crm/create-panel';
import { Campo, CampoTexto } from '@/components/ui/field';

import { criarEmpresa } from './actions';
import { EMPRESA_INICIAL } from './state';

/**
 * Cadastro de empresa.
 *
 * Só o nome é obrigatório, e isso não é descuido: uma conta costuma nascer de
 * uma conversa — "a padaria da esquina fechou com a gente" — e exigir CNPJ e
 * razão social nesse momento faz a pessoa preencher qualquer coisa para
 * conseguir salvar. O dado inventado é pior que o campo vazio, porque parece
 * verdadeiro.
 */
export function CompanyForm({ singular }: { singular: string }) {
  const [estado, acao] = useActionState(criarEmpresa, EMPRESA_INICIAL);
  const primeiro = useRef<HTMLInputElement>(null);

  return (
    <PainelDeCadastro
      titulo={`Nova ${singular}`}
      acao={acao}
      estado={estado}
      confirmacao={(nome) => `${nome} foi cadastrada.`}
      aoSalvar={() => primeiro.current?.focus()}
    >
      <Campo
        nome="name"
        rotulo="Nome"
        obrigatorio
        referencia={primeiro}
        erro={estado.campos.name}
        placeholder="Padaria do Bairro"
        dica="Como vocês chamam. Não precisa ser a razão social."
      />
      <Campo
        nome="legal_name"
        rotulo="Razão social"
        placeholder="Padaria do Bairro Comércio de Alimentos Ltda"
      />
      <Campo
        nome="document"
        rotulo="CNPJ ou CPF"
        erro={estado.campos.document}
        placeholder="12.345.678/0001-95"
        dica="Pode colar com pontuação."
      />
      <Campo
        nome="email"
        rotulo="E-mail"
        tipo="email"
        erro={estado.campos.email}
        placeholder="contato@exemplo.com.br"
      />
      <Campo
        nome="phone"
        rotulo="Telefone"
        tipo="tel"
        erro={estado.campos.phone}
        placeholder="(11) 3000-0000"
      />
      <Campo
        nome="website"
        rotulo="Site"
        erro={estado.campos.website}
        placeholder="exemplo.com.br"
      />
      <CampoTexto
        nome="notes"
        rotulo="Observações"
        className="sm:col-span-2"
        placeholder="O que é bom lembrar antes da próxima conversa."
      />
    </PainelDeCadastro>
  );
}
