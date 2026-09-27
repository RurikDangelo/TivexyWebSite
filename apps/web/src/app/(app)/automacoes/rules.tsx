'use client';

import type { AutomationTrigger } from '@tivexy/core';
import { Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useActionState, useOptimistic, useState, useTransition } from 'react';

import { FormError, FormFeedback, FormSuccess } from '@/components/form/messages';
import { Submit } from '@/components/form/submit';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertDialog } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { TD, TR } from '@/components/ui/table';
import { Tooltip } from '@/components/ui/tooltip';
import {
  type ModeloDeAutomacao,
  descreverAcao,
  descreverCondicao,
  nomeDoGatilho,
} from '@/lib/automation/rule-text';
import { atrasoDaLinha } from '@/lib/utils';

import { alternarRegra, criarRegra, excluirRegra, salvarRegra } from './actions';
import { type OpcoesDoEditor, type Rascunho, rascunhoDe, rascunhoVazio } from './rule-draft';
import { RuleEditor } from './rule-editor';
import { ACAO_INICIAL, REGRA_INICIAL, type RegraNaTela } from './state';

/** Colunas do cabeçalho em `page.tsx`. O `colSpan` da linha do editor depende disto. */
export const COLUNAS_DA_TABELA = 5;

/**
 * Cadastro: modelos prontos em cima, o editor embaixo.
 *
 * Escolher um modelo preenche o editor — a pessoa confere e salva. Nada é
 * criado sem o clique em "Salvar e ligar".
 */
export function NovaAutomacao({
  opcoes,
  modelos,
}: {
  opcoes: OpcoesDoEditor;
  modelos: readonly ModeloDeAutomacao[];
}) {
  const [estado, criar] = useActionState(criarRegra, REGRA_INICIAL);
  const primeiro = opcoes.gatilhos[0];
  const [inicial, setInicial] = useState<{ chave: string; rascunho: Rascunho } | null>(null);
  const [aberto, setAberto] = useState(false);

  // Depois de salvar, o editor volta vazio e fechado. Ajuste durante a
  // renderização — o padrão do React para "estado que segue outro".
  const [rodadaVista, setRodadaVista] = useState(estado.rodada);
  if (estado.rodada !== rodadaVista) {
    setRodadaVista(estado.rodada);
    setAberto(false);
    setInicial(null);
  }

  if (primeiro === undefined) {
    return (
      <p className="text-body text-content-muted">
        Nenhum módulo com eventos está ligado nesta empresa — as automações escutam CRM, vendas e
        estoque.
      </p>
    );
  }

  function usarModelo(modelo: ModeloDeAutomacao) {
    setInicial({ chave: modelo.chave, rascunho: rascunhoDe(modelo.regra) });
    setAberto(true);
  }

  return (
    <div className="flex flex-col gap-4">
      {modelos.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="flex items-center gap-1.5 text-label text-content-default">
            <Sparkles className="size-4 text-content-accent" aria-hidden />
            Comece por um modelo
          </p>
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {modelos.map((m) => (
              <li key={m.chave}>
                <button
                  type="button"
                  onClick={() => usarModelo(m)}
                  aria-pressed={aberto && inicial?.chave === m.chave}
                  className="flex h-full w-full flex-col gap-1 rounded-card border border-line-subtle bg-surface px-3 py-2.5 text-left transition-colors transition-base hover:border-line hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-pressed:border-line-strong aria-pressed:bg-surface-subtle"
                >
                  <span className="text-label text-content">{m.titulo}</span>
                  <span className="text-caption text-content-muted">{m.descricao}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!aberto ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant={modelos.length > 0 ? 'outline' : undefined}
            onClick={() => {
              setInicial(null);
              setAberto(true);
            }}
          >
            <Plus aria-hidden />
            Montar do zero
          </Button>
          {estado.ok !== null && <FormSuccess>{estado.ok}</FormSuccess>}
        </div>
      ) : (
        <form
          action={criar}
          className="flex flex-col gap-4 rounded-card border border-line-subtle p-4"
        >
          <RuleEditor
            key={`${estado.rodada}-${inicial?.chave ?? 'zero'}`}
            prefixo="nova"
            inicial={inicial?.rascunho ?? rascunhoVazio(primeiro)}
            opcoes={opcoes}
            problemas={estado.problemas}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Submit>Salvar e ligar</Submit>
            <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            {estado.erro !== null && <FormError>{estado.erro}</FormError>}
            {Object.keys(estado.problemas).length > 0 && (
              <FormError>Confira os campos marcados.</FormError>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

/**
 * Em vigor ou em pausa, com a palavra sempre ao lado do interruptor.
 *
 * "Em vigor" e "em pausa", e não "ligada": o nicho pode renomear automação
 * para um nome masculino, e o adjetivo não acompanharia.
 */
function Interruptor({
  regra,
  podeEditar,
  aoFalhar,
}: {
  regra: RegraNaTela;
  podeEditar: boolean;
  aoFalhar: (erro: string | null) => void;
}) {
  const [ativa, setAtiva] = useOptimistic(regra.ativa);
  const [, iniciar] = useTransition();

  return (
    <label className="inline-flex items-center gap-2 text-body text-content-muted">
      <Switch
        checked={ativa}
        disabled={!podeEditar}
        aria-label={`${regra.nome}: ${ativa ? 'em vigor' : 'em pausa'}`}
        onChange={(e) => {
          const nova = e.target.checked;
          aoFalhar(null);
          iniciar(async () => {
            setAtiva(nova);
            const r = await alternarRegra(regra.id, nova);
            if (r.erro !== null) aoFalhar(r.erro);
          });
        }}
      />
      <span>{ativa ? 'Em vigor' : 'Em pausa'}</span>
    </label>
  );
}

/**
 * Excluir uma automação — com o diálogo da casa, não com o `window.confirm`.
 *
 * A Server Action é chamada direto, e não por `useActionState`: é o `await`
 * dentro do formulário do diálogo que faz o `useFormStatus` dele acender, e é
 * isso que impede o clique duplo virar duas exclusões.
 */
function ExcluirRegra({
  regra,
  aoFalhar,
}: {
  regra: RegraNaTela;
  aoFalhar: (erro: string | null) => void;
}) {
  const [aberto, setAberto] = useState(false);

  async function confirmar() {
    aoFalhar(null);
    /*
     * O `FormData` é montado aqui, e não lido do diálogo: quem sabe qual regra
     * está em jogo é esta linha, e um `<input type="hidden">` dentro do corpo
     * do alerta seria mais um lugar de onde o id poderia sumir sem aviso.
     */
    const dados = new FormData();
    dados.set('id', regra.id);
    const r = await excluirRegra(ACAO_INICIAL, dados);
    aoFalhar(r.erro);
  }

  return (
    <>
      <Tooltip conteudo="Excluir">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Excluir ${regra.nome}`}
          onClick={() => setAberto(true)}
        >
          <Trash2 aria-hidden />
        </Button>
      </Tooltip>
      <AlertDialog
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        severidade="danger"
        titulo={`Excluir "${regra.nome}"?`}
        descricao="O registro de execuções desta automação vai junto, e não há como desfazer. Para só parar de disparar, use o interruptor de pausa."
        confirmarRotulo="Excluir"
        confirmarAction={confirmar}
      />
    </>
  );
}

export interface RuleRowProps {
  regra: RegraNaTela;
  opcoes: OpcoesDoEditor;
  podeEditar: boolean;
  ultimaExecucao: string | null;
  /** Cadência única de entrada da lista — `atrasoDaLinha(i)`. */
  indice: number;
}

/**
 * Uma automação na tabela: a frase, o interruptor, e editar no lugar.
 *
 * Devolve duas linhas quando o editor está aberto — a segunda atravessa a
 * tabela inteira, porque um formulário espremido numa coluna não é editável.
 */
export function RuleRow({ regra, opcoes, podeEditar, ultimaExecucao, indice }: RuleRowProps) {
  const [editando, setEditando] = useState(false);
  const [erroDaLinha, setErroDaLinha] = useState<string | null>(null);
  const [estado, salvar] = useActionState(salvarRegra, REGRA_INICIAL);
  const [rodadaVista, setRodadaVista] = useState(estado.rodada);
  if (estado.rodada !== rodadaVista) {
    setRodadaVista(estado.rodada);
    setEditando(false);
  }

  const gatilhoDisponivel = opcoes.gatilhos.includes(regra.gatilho as AutomationTrigger);
  const titulo = typeof regra.params.titulo === 'string' ? regra.params.titulo : null;
  const idDoEditor = `editor-${regra.id}`;

  return (
    <>
      <TR
        ativo={editando}
        className="animate-enter"
        style={{ animationDelay: atrasoDaLinha(indice) }}
      >
        <TD rotulo="Automação">
          <span className="flex min-w-0 flex-col">
            <span className="font-medium break-words text-content">{regra.nome}</span>
            {ultimaExecucao !== null && (
              <span className="text-caption text-content-subtle">{ultimaExecucao}</span>
            )}
          </span>
        </TD>

        <TD rotulo="Quando">
          <span className="flex min-w-0 flex-col gap-1">
            <span className="break-words">{nomeDoGatilho(regra.gatilho, opcoes.terms)}</span>
            {regra.condicoes.length > 0 && (
              <span className="text-caption break-words text-content-muted">
                se {regra.condicoes.map((c) => descreverCondicao(regra.gatilho, c)).join(' e ')}
              </span>
            )}
            {!gatilhoDisponivel && (
              /* Cor nunca sozinha: o selo `warning` já traz o próprio triângulo. */
              <Badge tone="warning" tamanho="xs" className="self-start">
                módulo desligado — não dispara
              </Badge>
            )}
          </span>
        </TD>

        <TD rotulo="Então">
          <span className="flex min-w-0 flex-col">
            <span className="break-words">{descreverAcao(regra.acao, regra.params, opcoes)}</span>
            {titulo !== null && (
              <span className="font-mono text-caption break-words text-content-muted">
                {titulo}
              </span>
            )}
          </span>
        </TD>

        <TD rotulo="Situação">
          <Interruptor regra={regra} podeEditar={podeEditar} aoFalhar={setErroDaLinha} />
        </TD>

        <TD acoes rotulo="Ações">
          {podeEditar ? (
            <span className="inline-flex items-center gap-1">
              <Tooltip conteudo={editando ? 'Fechar o editor' : 'Editar'}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-expanded={editando}
                  /* Só aponta para o que existe: o formulário só está no DOM aberto. */
                  aria-controls={editando ? idDoEditor : undefined}
                  aria-label={
                    editando ? `Fechar o editor de ${regra.nome}` : `Editar ${regra.nome}`
                  }
                  onClick={() => setEditando((v) => !v)}
                >
                  <Pencil aria-hidden />
                </Button>
              </Tooltip>
              <ExcluirRegra regra={regra} aoFalhar={setErroDaLinha} />
            </span>
          ) : (
            <span className="text-caption text-content-subtle">somente leitura</span>
          )}
        </TD>
      </TR>

      {(erroDaLinha !== null || estado.ok !== null) && (
        <TR>
          <TD colSpan={COLUNAS_DA_TABELA}>
            <div className="min-w-0 flex-1">
              {erroDaLinha !== null ? (
                <FormError>{erroDaLinha}</FormError>
              ) : (
                <FormSuccess>{estado.ok}</FormSuccess>
              )}
            </div>
          </TD>
        </TR>
      )}

      {podeEditar && editando && (
        <TR ativo>
          {/*
           * `flex-1` no filho: no modo de blocos a própria tabela transforma
           * cada célula em flex, e sem isso o formulário encolheria para a
           * largura do conteúdo no celular.
           */}
          <TD colSpan={COLUNAS_DA_TABELA}>
            <form
              id={idDoEditor}
              action={salvar}
              className="flex min-w-0 flex-1 flex-col gap-4 py-2"
            >
              <input type="hidden" name="id" value={regra.id} />
              <RuleEditor
                prefixo={`regra-${regra.id}`}
                inicial={rascunhoDe(regra)}
                opcoes={
                  gatilhoDisponivel
                    ? opcoes
                    : { ...opcoes, gatilhos: [regra.gatilho, ...opcoes.gatilhos] }
                }
                problemas={estado.problemas}
              />
              <div className="flex flex-wrap items-center gap-3">
                <Submit>Salvar</Submit>
                <Button type="button" variant="ghost" onClick={() => setEditando(false)}>
                  Cancelar
                </Button>
                <FormFeedback estado={{ erro: estado.erro }} />
                {Object.keys(estado.problemas).length > 0 && (
                  <FormError>Confira os campos marcados.</FormError>
                )}
              </div>
            </form>
          </TD>
        </TR>
      )}
    </>
  );
}
