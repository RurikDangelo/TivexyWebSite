'use client';

import { useActionState, useRef, useState } from 'react';

import { ERP_UNITS, ERP_UNIT_LABEL } from '@tivexy/core';
import { PainelDeCadastro } from '@/components/crm/create-panel';
import { Campo, CampoSelecao, CampoTexto } from '@/components/ui/field';
import { Label } from '@/components/ui/input';

import { criarProduto } from './actions';
import { type CategoriaOferecida, PRODUTO_INICIAL } from './state';

/**
 * Cadastro de produto ou serviço.
 *
 * **A escolha entre os dois é a primeira pergunta**, e muda o formulário: um
 * serviço não tem estoque, e deixar "controla estoque" ligado por descuido
 * faria "hora de consultoria" aparecer no inventário com saldo negativo
 * eterno.
 */
export function ProductForm({ categorias }: { categorias: readonly CategoriaOferecida[] }) {
  const [estado, acao] = useActionState(criarProduto, PRODUTO_INICIAL);
  const [controlaEstoque, setControlaEstoque] = useState(true);
  const primeiro = useRef<HTMLInputElement>(null);

  return (
    <PainelDeCadastro
      titulo="Novo produto"
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
        placeholder="Café em grãos"
      />
      <Campo
        nome="sku"
        rotulo="Código"
        erro={estado.campos.sku}
        placeholder="CAFE-500"
        dica="Seu código interno. Único quando preenchido."
      />

      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label>Tipo</Label>
        <div className="flex flex-wrap gap-2">
          <Opcao
            nome="track_stock"
            valor="sim"
            marcado={controlaEstoque}
            aoEscolher={() => setControlaEstoque(true)}
            titulo="Produto"
            descricao="Tem estoque para controlar"
          />
          <Opcao
            nome="track_stock"
            valor="nao"
            marcado={!controlaEstoque}
            aoEscolher={() => setControlaEstoque(false)}
            titulo="Serviço"
            descricao="Não entra no inventário"
          />
        </div>
      </div>

      <CampoSelecao
        nome="unit"
        rotulo="Unidade"
        padrao={controlaEstoque ? 'un' : 'h'}
        opcoes={ERP_UNITS.map((u) => ({ valor: u, texto: `${u} — ${ERP_UNIT_LABEL[u]}` }))}
      />

      {categorias.length > 0 && (
        <CampoSelecao
          nome="category_id"
          rotulo="Categoria"
          vazio="Sem categoria"
          opcoes={categorias.map((c) => ({ valor: c.id, texto: c.nome }))}
          dica="Vem do nicho da empresa."
        />
      )}

      <Campo
        nome="price_cents"
        rotulo="Preço de venda"
        erro={estado.campos.price_cents}
        placeholder="45,00"
        dica="Em branco vale zero."
      />
      <Campo
        nome="cost_cents"
        rotulo="Custo"
        erro={estado.campos.cost_cents}
        placeholder="20,00"
        dica="Só você vê. Serve para a margem."
      />

      <CampoTexto
        nome="description"
        rotulo="Descrição"
        className="sm:col-span-2"
        placeholder="O que o cliente precisa saber sobre este item."
      />
    </PainelDeCadastro>
  );
}

/**
 * Um cartão de escolha, no lugar de um `radio` solto.
 *
 * O `input` continua sendo um `radio` de verdade — é ele que carrega o valor e
 * o que o teclado opera. O cartão é só o rótulo, e por isso a navegação por
 * `Tab` e a leitura por leitor de tela continuam funcionando sem nada extra.
 */
function Opcao({
  nome,
  valor,
  marcado,
  aoEscolher,
  titulo,
  descricao,
}: {
  nome: string;
  valor: string;
  marcado: boolean;
  aoEscolher: () => void;
  titulo: string;
  descricao: string;
}) {
  return (
    <label
      className={
        marcado
          ? 'flex-1 cursor-pointer rounded-md border border-content-accent bg-surface-accent-soft px-3 py-2 transition-colors'
          : 'flex-1 cursor-pointer rounded-md border border-line-field px-3 py-2 transition-colors hover:bg-surface-muted'
      }
    >
      <input
        type="radio"
        name={nome}
        value={valor}
        checked={marcado}
        onChange={aoEscolher}
        className="sr-only"
      />
      <span className="block text-sm font-medium text-content">{titulo}</span>
      <span className="block text-xs text-content-subtle">{descricao}</span>
    </label>
  );
}
