'use client';

import type { AutomationTrigger } from '@tivexy/core';
import { Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useActionState, useOptimistic, useState, useTransition } from 'react';

import { FormError, FormSuccess } from '@/components/form/messages';
import { Submit } from '@/components/form/submit';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  type ModeloDeAutomacao,
  descreverAcao,
  descreverCondicao,
  nomeDoGatilho,
} from '@/lib/automation/rule-text';

import { alternarRegra, criarRegra, excluirRegra, salvarRegra } from './actions';
import {
  type OpcoesDoEditor,
  type Rascunho,
  RuleEditor,
  rascunhoDe,
  rascunhoVazio,
} from './rule-editor';
import { ACAO_INICIAL, REGRA_INICIAL, type RegraNaTela } from './state';

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
      <p className="text-sm text-content-muted">
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
          <p className="flex items-center gap-1.5 text-sm font-medium text-content-default">
            <Sparkles className="size-4 text-content-accent" aria-hidden />
            Comece por um modelo
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {modelos.map((m) => (
              <li key={m.chave}>
                <button
                  type="button"
                  onClick={() => usarModelo(m)}
                  aria-pressed={aberto && inicial?.chave === m.chave}
                  className="flex h-full w-full flex-col gap-1 rounded-lg border border-line-subtle bg-surface px-3 py-2.5 text-left transition-colors hover:border-line hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-pressed:border-line-strong aria-pressed:bg-surface-subtle"
                >
                  <span className="text-sm font-medium text-content">{m.titulo}</span>
                  <span className="text-xs text-content-muted">{m.descricao}</span>
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
          className="flex flex-col gap-4 rounded-lg border border-line-subtle p-4"
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

function Interruptor({ regra, podeEditar }: { regra: RegraNaTela; podeEditar: boolean }) {
  const [ativa, setAtiva] = useOptimistic(regra.ativa);
  const [, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <label className="flex items-center gap-2 text-sm text-content-muted">
        <span className="hidden sm:inline">{ativa ? 'Em vigor' : 'Em pausa'}</span>
        <Switch
          checked={ativa}
          disabled={!podeEditar}
          aria-label={`${regra.nome}: ${ativa ? 'em vigor' : 'em pausa'}`}
          onChange={(e) => {
            const nova = e.target.checked;
            setErro(null);
            iniciar(async () => {
              setAtiva(nova);
              const r = await alternarRegra(regra.id, nova);
              if (r.erro !== null) setErro(r.erro);
            });
          }}
        />
      </label>
      {erro !== null && <FormError>{erro}</FormError>}
    </div>
  );
}

function Excluir({ regra }: { regra: RegraNaTela }) {
  const [estado, executar] = useActionState(excluirRegra, ACAO_INICIAL);
  return (
    <form
      action={executar}
      onSubmit={(e) => {
        if (!window.confirm(`Excluir "${regra.nome}"? O registro de execuções vai junto.`)) {
          e.preventDefault();
        }
      }}
      className="contents"
    >
      <input type="hidden" name="id" value={regra.id} />
      <Submit variant="ghost" size="sm" pendente="Excluindo…">
        <Trash2 aria-hidden />
        Excluir
      </Submit>
      {estado.erro !== null && (
        <span className="basis-full">
          <FormError>{estado.erro}</FormError>
        </span>
      )}
    </form>
  );
}

/**
 * Uma automação na lista: a frase, o interruptor, e editar no lugar.
 *
 * "Em vigor" e "em pausa", e não "ligada": o nicho pode renomear automação
 * para um nome masculino, e o adjetivo não acompanharia.
 */
export function RuleCard({
  regra,
  opcoes,
  podeEditar,
  ultimaExecucao,
}: {
  regra: RegraNaTela;
  opcoes: OpcoesDoEditor;
  podeEditar: boolean;
  ultimaExecucao: string | null;
}) {
  const [editando, setEditando] = useState(false);
  const [estado, salvar] = useActionState(salvarRegra, REGRA_INICIAL);
  const [rodadaVista, setRodadaVista] = useState(estado.rodada);
  if (estado.rodada !== rodadaVista) {
    setRodadaVista(estado.rodada);
    setEditando(false);
  }

  const gatilhoDisponivel = opcoes.gatilhos.includes(regra.gatilho as AutomationTrigger);

  return (
    <li className="py-4">
      <article className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-sans font-semibold tracking-normal break-words text-content">
              {regra.nome}
            </h3>
            {ultimaExecucao !== null && (
              <p className="text-xs text-content-subtle">{ultimaExecucao}</p>
            )}
          </div>
          <Interruptor regra={regra} podeEditar={podeEditar} />
        </div>

        <dl className="grid gap-x-3 gap-y-1 text-sm sm:grid-cols-[4.5rem_1fr]">
          <dt className="font-mono text-xs uppercase tracking-wider text-content-subtle sm:pt-0.5">
            Quando
          </dt>
          <dd className="text-content-default">{nomeDoGatilho(regra.gatilho, opcoes.terms)}</dd>
          {regra.condicoes.length > 0 && (
            <>
              <dt className="font-mono text-xs uppercase tracking-wider text-content-subtle sm:pt-0.5">
                Se
              </dt>
              <dd className="text-content-default">
                {regra.condicoes.map((c) => descreverCondicao(regra.gatilho, c)).join(' e ')}
              </dd>
            </>
          )}
          <dt className="font-mono text-xs uppercase tracking-wider text-content-subtle sm:pt-0.5">
            Então
          </dt>
          <dd className="text-content-default">
            {descreverAcao(regra.acao, regra.params, opcoes)}
            {typeof regra.params.titulo === 'string' && (
              <span className="text-content-muted">
                {': '}
                <span className="font-mono text-xs break-words">{regra.params.titulo}</span>
              </span>
            )}
          </dd>
        </dl>

        {!gatilhoDisponivel && (
          <p className="text-xs text-warning">
            O módulo deste evento está desligado nesta empresa: a automação não dispara até ele
            voltar.
          </p>
        )}

        {podeEditar && !editando && (
          <div className="flex flex-wrap items-center gap-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditando(true)}>
              <Pencil aria-hidden />
              Editar
            </Button>
            <Excluir regra={regra} />
            {estado.ok !== null && <FormSuccess>{estado.ok}</FormSuccess>}
          </div>
        )}

        {podeEditar && editando && (
          <form
            action={salvar}
            className="flex flex-col gap-4 rounded-lg border border-line-subtle p-4"
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
              {estado.erro !== null && <FormError>{estado.erro}</FormError>}
              {Object.keys(estado.problemas).length > 0 && (
                <FormError>Confira os campos marcados.</FormError>
              )}
            </div>
          </form>
        )}
      </article>
    </li>
  );
}
