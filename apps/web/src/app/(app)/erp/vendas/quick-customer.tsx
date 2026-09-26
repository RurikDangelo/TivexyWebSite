'use client';

import { UserPlus, X } from 'lucide-react';
import { useRef, useState, useTransition } from 'react';

import { Field, describedBy, idDoCampo } from '@/components/form/field';
import { FormError } from '@/components/form/messages';
import { Button } from '@/components/ui/button';
import { Combobox, type OpcaoDoCombobox } from '@/components/ui/combobox';
import { Input, Label } from '@/components/ui/input';

import { criarClienteRapido } from './actions';
import { CLIENTE_INICIAL, type ClienteRapidoState, type Opcao } from './state';

/** Mais que isto e o painel vira rolagem; a busca é mais rápida que a lista. */
const MAXIMO_NA_LISTA = 12;
const MAIS_RESULTADOS = '__mais__';

function semAcento(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

export interface QuickCustomerProps {
  clientes: readonly Opcao[];
  /** A escolha em vigor. Controlada pelo balcão, que precisa dela para liberar o registro. */
  cliente: OpcaoDoCombobox | null;
  aoEscolher: (cliente: OpcaoDoCombobox | null) => void;
  exige: boolean;
  erro?: string;
  podeCadastrar: boolean;
  /** Vocabulário do nicho: "cliente", "paciente", "aluno". */
  rotulo: string;
}

/**
 * Quem comprou — e o cadastro de quem ainda não existe, sem sair do balcão.
 *
 * O `<select>` que havia aqui carregava até 2.000 opções: não é escolha, é
 * rolagem. O `<Combobox>` filtra enquanto se digita e diz quando cortou a
 * lista, em vez de deixar acreditar que oito é tudo.
 *
 * O cadastro rápido **não** é um `<form>`: ele vive dentro do formulário da
 * venda, e formulário dentro de formulário é HTML inválido — o navegador
 * expulsa o de dentro e o Enter passa a registrar a venda com o nome do
 * cliente pela metade. Por isso os campos são lidos por `ref` e a Server
 * Action é chamada dentro de uma transição.
 */
export function QuickCustomer({
  clientes: iniciais,
  cliente,
  aoEscolher,
  exige,
  erro,
  podeCadastrar,
  rotulo,
}: QuickCustomerProps) {
  const [clientes, setClientes] = useState<readonly Opcao[]>(iniciais);
  const [cadastrando, setCadastrando] = useState(false);
  const [estado, setEstado] = useState<ClienteRapidoState>(CLIENTE_INICIAL);
  const [salvando, iniciar] = useTransition();
  const nomeRef = useRef<HTMLInputElement>(null);
  const documentoRef = useRef<HTMLInputElement>(null);

  function buscar(texto: string): readonly OpcaoDoCombobox[] {
    const termo = semAcento(texto.trim());
    const achados =
      termo === '' ? clientes : clientes.filter((c) => semAcento(c.nome).includes(termo));

    const opcoes: OpcaoDoCombobox[] = achados
      .slice(0, MAXIMO_NA_LISTA)
      .map((c) => ({ valor: c.id, rotulo: c.nome }));

    if (achados.length > MAXIMO_NA_LISTA) {
      opcoes.push({
        valor: MAIS_RESULTADOS,
        rotulo: `mais ${achados.length - MAXIMO_NA_LISTA} — escreva o nome para achar`,
        desabilitado: true,
      });
    }
    return opcoes;
  }

  function cadastrar() {
    const dados = new FormData();
    dados.set('nome', nomeRef.current?.value ?? '');
    dados.set('documento', documentoRef.current?.value ?? '');
    iniciar(async () => {
      const retorno = await criarClienteRapido(CLIENTE_INICIAL, dados);
      setEstado(retorno);
      if (retorno.cliente === null) return;
      const novo = retorno.cliente;
      setClientes((lista) =>
        [...lista, novo].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
      );
      /* Cadastrar aqui é escolher: ninguém cadastra para depois procurar na lista. */
      aoEscolher({ valor: novo.id, rotulo: novo.nome });
      setCadastrando(false);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Field nome="cliente" rotulo={rotulo} obrigatorio={exige} erro={erro}>
        <Combobox
          id={idDoCampo('cliente')}
          nome="cliente"
          rotulo={rotulo}
          placeholder={exige ? 'Procure pelo nome…' : 'Sem identificação'}
          valor={cliente}
          aoEscolher={(opcao) => {
            if (opcao?.valor === MAIS_RESULTADOS) return;
            aoEscolher(opcao);
          }}
          buscar={buscar}
          atrasoMs={0}
          obrigatorio={exige}
          inicialRotulo="Ninguém cadastrado ainda."
          aria-invalid={erro !== undefined}
          aria-describedby={describedBy('cliente', erro)}
        />
      </Field>

      {podeCadastrar && !cadastrando && (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="self-start"
          onClick={() => setCadastrando(true)}
        >
          <UserPlus aria-hidden />
          Cadastrar agora
        </Button>
      )}

      {cadastrando && (
        <div className="animate-enter flex flex-col gap-3 rounded-card border border-line-subtle bg-surface-sunken p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-label text-content">Cadastro rápido</p>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Fechar cadastro rápido"
              onClick={() => setCadastrando(false)}
            >
              <X aria-hidden />
            </Button>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="novo-cliente-nome">Nome</Label>
            <Input
              ref={nomeRef}
              id="novo-cliente-nome"
              autoComplete="off"
              maxLength={160}
              aria-invalid={estado.campos.nome !== undefined}
              aria-describedby={
                estado.campos.nome === undefined ? undefined : 'novo-cliente-nome-erro'
              }
            />
            {estado.campos.nome !== undefined && (
              <p id="novo-cliente-nome-erro" role="alert" className="text-caption text-danger">
                {estado.campos.nome}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="novo-cliente-doc">
              CPF ou CNPJ <span className="text-caption text-content-subtle">(opcional)</span>
            </Label>
            <Input
              ref={documentoRef}
              id="novo-cliente-doc"
              autoComplete="off"
              inputMode="numeric"
              maxLength={20}
              aria-invalid={estado.campos.documento !== undefined}
              aria-describedby={
                estado.campos.documento === undefined ? undefined : 'novo-cliente-doc-erro'
              }
            />
            {estado.campos.documento !== undefined && (
              <p id="novo-cliente-doc-erro" role="alert" className="text-caption text-danger">
                {estado.campos.documento}
              </p>
            )}
          </div>

          {estado.erro !== null && <FormError>{estado.erro}</FormError>}

          {/*
           * `Button` com `carregando`, e não `Submit`: não há `<form>` próprio
           * aqui para o `useFormStatus` enxergar — quem sabe do envio é a
           * transição. É a mesma trava contra o clique duplo, pela outra porta.
           */}
          <Button type="button" variant="outline" carregando={salvando} onClick={cadastrar}>
            Cadastrar e escolher
          </Button>
        </div>
      )}
    </div>
  );
}
