'use client';

import {
  AUTOMATION_TRIGGERS,
  type AutomationAction,
  type AutomationCondition,
  type AutomationTrigger,
  type CampoDoGatilho,
  type ConditionOperator,
  OPERADORES_POR_TIPO,
  ROTULO_DO_OPERADOR,
  actionAllowedFor,
  formatCentsInput,
  parseCents,
  renderAutomationTemplate,
} from '@tivexy/core';
import { Plus, X } from 'lucide-react';
import { useRef, useState } from 'react';

import { Field, describedBy } from '@/components/form/field';
import { FormError } from '@/components/form/messages';
import { Button } from '@/components/ui/button';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import {
  EXEMPLO_DO_EVENTO,
  type Pessoa,
  descreverAcao,
  descreverCondicao,
  nomeDoGatilho,
} from '@/lib/automation/rule-text';
import type { Terms } from '@/lib/terms/vocabulary';

interface CondicaoRascunho {
  chave: number;
  campo: string;
  operador: ConditionOperator;
  valor: string;
}

/** O que está sendo editado — texto, do jeito que a pessoa digita. */
export interface Rascunho {
  nome: string;
  gatilho: AutomationTrigger;
  condicoes: CondicaoRascunho[];
  acao: AutomationAction;
  destino: 'responsavel' | 'usuario' | 'permissao';
  usuario: string;
  permissao: string;
  titulo: string;
  texto: string;
  dias: string;
  responsavel: string;
}

/** O que a empresa oferece a esta pessoa: gatilhos dos módulos que tem, gente, permissões. */
export interface OpcoesDoEditor {
  gatilhos: readonly AutomationTrigger[];
  podeCriarAtividade: boolean;
  pessoas: readonly Pessoa[];
  permissoes: readonly { codigo: string; rotulo: string }[];
  terms: Terms;
}

const DICA_DO_PRAZO = 'Zero vence no mesmo dia, às 23h59.';

function campos(gatilho: AutomationTrigger): readonly CampoDoGatilho[] {
  return AUTOMATION_TRIGGERS[gatilho].campos;
}

function valorInicial(campo: CampoDoGatilho | undefined): string {
  return campo?.tipo === 'opcao' ? (campo.opcoes?.[0]?.valor ?? '') : '';
}

/** Uma regra salva (ou um modelo) de volta para o que a pessoa editaria. */
export function rascunhoDe(regra: {
  nome: string;
  gatilho: AutomationTrigger;
  condicoes: readonly AutomationCondition[];
  acao: AutomationAction;
  params: Readonly<Record<string, string | number>>;
}): Rascunho {
  const p = regra.params;
  const texto = (v: unknown) => (typeof v === 'string' ? v : '');
  return {
    nome: regra.nome,
    gatilho: regra.gatilho,
    condicoes: regra.condicoes.map((c, i) => {
      const campo = campos(regra.gatilho).find((d) => d.campo === c.campo);
      return {
        chave: i,
        campo: c.campo,
        operador: c.operador,
        valor:
          campo?.tipo === 'dinheiro' && typeof c.valor === 'number'
            ? formatCentsInput(c.valor)
            : String(c.valor),
      };
    }),
    acao: regra.acao,
    destino:
      p.destino === 'usuario' || p.destino === 'responsavel' || p.destino === 'permissao'
        ? p.destino
        : 'permissao',
    usuario: texto(p.usuario),
    permissao: texto(p.permissao),
    titulo: texto(p.titulo),
    texto: texto(p.texto),
    dias: typeof p.dias === 'number' ? String(p.dias) : '1',
    responsavel: texto(p.responsavel) || 'responsavel',
  };
}

export function rascunhoVazio(gatilho: AutomationTrigger): Rascunho {
  return {
    nome: '',
    gatilho,
    condicoes: [],
    acao: 'core.notify',
    destino: AUTOMATION_TRIGGERS[gatilho].temResponsavel ? 'responsavel' : 'permissao',
    usuario: '',
    permissao: '',
    titulo: '',
    texto: '',
    dias: '1',
    responsavel: 'responsavel',
  };
}

/** O JSON que a ação do servidor lê — ver `parseRuleForm`. */
function serializar(r: Rascunho): string {
  const params: Record<string, string> = { titulo: r.titulo };
  if (r.acao === 'core.notify') {
    params.destino = r.destino;
    if (r.texto.trim() !== '') params.texto = r.texto;
    if (r.destino === 'usuario') params.usuario = r.usuario;
    if (r.destino === 'permissao') params.permissao = r.permissao;
  } else {
    params.dias = r.dias;
    params.responsavel = r.responsavel;
  }
  return JSON.stringify({
    nome: r.nome,
    gatilho: r.gatilho,
    condicoes: r.condicoes.map(({ campo, operador, valor }) => ({ campo, operador, valor })),
    acao: r.acao,
    params,
  });
}

/** A frase da regra enquanto ela é montada — a mesma que a lista mostra depois. */
function resumo(r: Rascunho, opcoes: OpcoesDoEditor): string {
  const condicoes = r.condicoes.flatMap((c) => {
    const campo = campos(r.gatilho).find((d) => d.campo === c.campo);
    if (campo === undefined || c.valor.trim() === '') return [];
    const valor = campo.tipo === 'dinheiro' ? parseCents(c.valor) : c.valor.trim();
    if (valor === null) return [];
    return [descreverCondicao(r.gatilho, { campo: c.campo, operador: c.operador, valor })];
  });
  const params: Record<string, unknown> = {
    destino: r.destino,
    usuario: r.usuario,
    permissao: r.permissao,
    dias: Number(r.dias),
    responsavel: r.responsavel,
  };
  const se = condicoes.length === 0 ? '' : `, se ${condicoes.join(' e ')}`;
  return `Quando ${nomeDoGatilho(r.gatilho, opcoes.terms)}${se}, então ${descreverAcao(r.acao, params, opcoes)}.`;
}

/**
 * Montar uma automação: quando, se, então.
 *
 * Controlado de ponta a ponta, porque as partes dependem umas das outras: o
 * gatilho decide os campos das condições, o tipo do campo decide as
 * comparações, e a ação decide o que se pergunta embaixo. O que sai daqui é um
 * campo escondido com a regra inteira.
 */
export function RuleEditor({
  prefixo,
  inicial,
  opcoes,
  problemas,
}: {
  prefixo: string;
  inicial: Rascunho;
  opcoes: OpcoesDoEditor;
  problemas: Readonly<Record<string, string>>;
}) {
  const [r, setR] = useState(inicial);
  const proximaChave = useRef(inicial.condicoes.length);
  const tituloRef = useRef<HTMLInputElement>(null);
  const textoRef = useRef<HTMLTextAreaElement>(null);
  const alvo = useRef<'titulo' | 'texto'>('titulo');

  const id = (campo: string) => `${prefixo}-${campo}`;
  const definicao = AUTOMATION_TRIGGERS[r.gatilho];
  const mudar = (parcial: Partial<Rascunho>) => setR((atual) => ({ ...atual, ...parcial }));

  function trocarGatilho(gatilho: AutomationTrigger) {
    const nova = AUTOMATION_TRIGGERS[gatilho];
    setR((atual) => ({
      ...atual,
      gatilho,
      // Os campos são outros: condição de venda não vale para lead.
      condicoes: [],
      acao: actionAllowedFor(atual.acao, gatilho) ? atual.acao : 'core.notify',
      destino:
        atual.destino === 'responsavel' && !nova.temResponsavel ? 'permissao' : atual.destino,
    }));
  }

  function mudarCondicao(chave: number, parcial: Partial<CondicaoRascunho>) {
    setR((atual) => ({
      ...atual,
      condicoes: atual.condicoes.map((c) => {
        if (c.chave !== chave) return c;
        const nova = { ...c, ...parcial };
        if (parcial.campo !== undefined && parcial.campo !== c.campo) {
          // Outro campo, outro tipo: a comparação e o valor recomeçam.
          const campo = campos(atual.gatilho).find((d) => d.campo === parcial.campo);
          nova.operador = campo === undefined ? 'eq' : (OPERADORES_POR_TIPO[campo.tipo][0] ?? 'eq');
          nova.valor = valorInicial(campo);
        }
        return nova;
      }),
    }));
  }

  function adicionarCondicao() {
    const campo = definicao.campos[0];
    if (campo === undefined) return;
    proximaChave.current += 1;
    const chave = proximaChave.current;
    setR((atual) => ({
      ...atual,
      condicoes: [
        ...atual.condicoes,
        {
          chave,
          campo: campo.campo,
          operador: OPERADORES_POR_TIPO[campo.tipo][0] ?? 'eq',
          valor: valorInicial(campo),
        },
      ],
    }));
  }

  /** Põe `{{variavel}}` onde está o cursor — no título ou no texto, o último que teve foco. */
  function inserirVariavel(variavel: string) {
    const qual = r.acao === 'core.notify' ? alvo.current : 'titulo';
    const el = qual === 'texto' ? textoRef.current : tituloRef.current;
    const atual = r[qual];
    const inicio = el?.selectionStart ?? atual.length;
    const fim = el?.selectionEnd ?? atual.length;
    const trecho = `{{${variavel}}}`;
    const novo = atual.slice(0, inicio) + trecho + atual.slice(fim);
    mudar(qual === 'texto' ? { texto: novo } : { titulo: novo });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(inicio + trecho.length, inicio + trecho.length);
    });
  }

  const exemplo = EXEMPLO_DO_EVENTO[r.gatilho];
  const previaTitulo = renderAutomationTemplate(r.titulo, exemplo).trim();
  const previaTexto = renderAutomationTemplate(r.texto, exemplo).trim();
  const acoes: { valor: AutomationAction; rotulo: string }[] = [
    { valor: 'core.notify', rotulo: 'Avisar alguém aqui dentro' },
  ];
  if (opcoes.podeCriarAtividade && actionAllowedFor('crm.activity.create', r.gatilho)) {
    acoes.push({ valor: 'crm.activity.create', rotulo: 'Criar atividade no CRM' });
  }

  return (
    <div className="flex flex-col gap-5">
      <input type="hidden" name="regra" value={serializar(r)} />

      <Field nome={id('nome')} rotulo="Nome" obrigatorio erro={problemas.nome}>
        <Input
          id={id('nome')}
          value={r.nome}
          onChange={(e) => mudar({ nome: e.target.value })}
          maxLength={120}
          placeholder="Aviso de venda grande"
          aria-invalid={problemas.nome !== undefined}
          aria-describedby={describedBy(id('nome'), problemas.nome)}
        />
      </Field>

      {/* ── Quando ─────────────────────────────────────────────────── */}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 font-mono text-xs uppercase tracking-wider text-content-subtle">
          Quando
        </legend>
        <Label htmlFor={id('gatilho')} className="sr-only">
          Evento que dispara
        </Label>
        <Select
          id={id('gatilho')}
          value={r.gatilho}
          onChange={(e) => trocarGatilho(e.target.value as AutomationTrigger)}
          aria-invalid={problemas.gatilho !== undefined}
          aria-describedby={describedBy(id('gatilho'), problemas.gatilho)}
        >
          {opcoes.gatilhos.map((g) => (
            <option key={g} value={g}>
              {nomeDoGatilho(g, opcoes.terms)}
            </option>
          ))}
        </Select>
        {problemas.gatilho !== undefined && (
          <p id={`${id('gatilho')}-erro`} role="alert" className="text-xs text-danger">
            {problemas.gatilho}
          </p>
        )}
      </fieldset>

      {/* ── Se ─────────────────────────────────────────────────────── */}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 font-mono text-xs uppercase tracking-wider text-content-subtle">
          Se
        </legend>
        {r.condicoes.length === 0 && (
          <p className="text-sm text-content-muted">Sem condição: vale para todo evento.</p>
        )}
        <ol className="flex flex-col gap-2">
          {r.condicoes.map((c, i) => {
            const campo = definicao.campos.find((d) => d.campo === c.campo);
            const erro = problemas[`condicoes.${i}`];
            const cid = id(`cond-${c.chave}`);
            return (
              <li key={c.chave} className="flex flex-col gap-1">
                <div className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto]">
                  <div className="col-span-2 grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-2 sm:contents">
                    <Label htmlFor={`${cid}-campo`} className="sr-only">
                      {`Campo da condição ${i + 1}`}
                    </Label>
                    <Select
                      id={`${cid}-campo`}
                      value={c.campo}
                      onChange={(e) => mudarCondicao(c.chave, { campo: e.target.value })}
                    >
                      {definicao.campos.map((d) => (
                        <option key={d.campo} value={d.campo}>
                          {d.rotulo}
                        </option>
                      ))}
                    </Select>
                    <Label htmlFor={`${cid}-op`} className="sr-only">
                      {`Comparação da condição ${i + 1}`}
                    </Label>
                    <Select
                      id={`${cid}-op`}
                      value={c.operador}
                      onChange={(e) =>
                        mudarCondicao(c.chave, { operador: e.target.value as ConditionOperator })
                      }
                    >
                      {(campo === undefined ? [] : OPERADORES_POR_TIPO[campo.tipo]).map((op) => (
                        <option key={op} value={op}>
                          {ROTULO_DO_OPERADOR[op]}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Label htmlFor={`${cid}-valor`} className="sr-only">
                    {`Valor da condição ${i + 1}`}
                  </Label>
                  {campo?.tipo === 'opcao' ? (
                    <Select
                      id={`${cid}-valor`}
                      value={c.valor}
                      onChange={(e) => mudarCondicao(c.chave, { valor: e.target.value })}
                    >
                      {(campo.opcoes ?? []).map((o) => (
                        <option key={o.valor} value={o.valor}>
                          {o.rotulo}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <div className="relative">
                      {campo?.tipo === 'dinheiro' && (
                        <span
                          aria-hidden
                          className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-content-subtle"
                        >
                          R$
                        </span>
                      )}
                      <Input
                        id={`${cid}-valor`}
                        value={c.valor}
                        onChange={(e) => mudarCondicao(c.chave, { valor: e.target.value })}
                        inputMode={campo?.tipo === 'dinheiro' ? 'decimal' : undefined}
                        maxLength={120}
                        placeholder={campo?.tipo === 'dinheiro' ? '1.000,00' : 'texto'}
                        className={campo?.tipo === 'dinheiro' ? 'pl-9 tabular-nums' : undefined}
                        aria-invalid={erro !== undefined}
                        aria-describedby={erro === undefined ? undefined : `${cid}-erro`}
                      />
                    </div>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-9"
                    aria-label={`Remover condição ${i + 1}`}
                    title="Remover condição"
                    onClick={() =>
                      setR((atual) => ({
                        ...atual,
                        condicoes: atual.condicoes.filter((x) => x.chave !== c.chave),
                      }))
                    }
                  >
                    <X aria-hidden />
                  </Button>
                </div>
                {erro !== undefined && (
                  <p id={`${cid}-erro`} role="alert" className="text-xs text-danger">
                    {erro}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
        {problemas.condicoes !== undefined && <FormError>{problemas.condicoes}</FormError>}
        {r.condicoes.length < 10 && (
          <div>
            <Button type="button" variant="outline" size="sm" onClick={adicionarCondicao}>
              <Plus aria-hidden />
              Condição
            </Button>
          </div>
        )}
        {r.condicoes.length > 1 && (
          <p className="text-xs text-content-subtle">Todas precisam valer ao mesmo tempo.</p>
        )}
      </fieldset>

      {/* ── Então ──────────────────────────────────────────────────── */}
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1.5 font-mono text-xs uppercase tracking-wider text-content-subtle">
          Então
        </legend>
        <Field nome={id('acao')} rotulo="O que fazer" obrigatorio erro={problemas.acao}>
          <Select
            id={id('acao')}
            value={r.acao}
            onChange={(e) => mudar({ acao: e.target.value as AutomationAction })}
            aria-invalid={problemas.acao !== undefined}
            aria-describedby={describedBy(id('acao'), problemas.acao)}
          >
            {acoes.map((a) => (
              <option key={a.valor} value={a.valor}>
                {a.rotulo}
              </option>
            ))}
          </Select>
        </Field>

        {r.acao === 'core.notify' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field nome={id('destino')} rotulo="Quem recebe" obrigatorio erro={problemas.destino}>
              <Select
                id={id('destino')}
                value={r.destino}
                onChange={(e) => mudar({ destino: e.target.value as Rascunho['destino'] })}
                aria-invalid={problemas.destino !== undefined}
                aria-describedby={describedBy(id('destino'), problemas.destino)}
              >
                {definicao.temResponsavel && (
                  <option value="responsavel">A pessoa responsável pelo registro</option>
                )}
                <option value="permissao">Um grupo, pela permissão</option>
                <option value="usuario">Uma pessoa da equipe</option>
              </Select>
            </Field>
            {r.destino === 'permissao' && (
              <Field nome={id('permissao')} rotulo="Grupo" obrigatorio>
                <Select
                  id={id('permissao')}
                  value={r.permissao}
                  onChange={(e) => mudar({ permissao: e.target.value })}
                >
                  <option value="" disabled>
                    Escolha…
                  </option>
                  {opcoes.permissoes.map((p) => (
                    <option key={p.codigo} value={p.codigo}>
                      {p.rotulo}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {r.destino === 'usuario' && (
              <Field nome={id('usuario')} rotulo="Pessoa" obrigatorio>
                <Select
                  id={id('usuario')}
                  value={r.usuario}
                  onChange={(e) => mudar({ usuario: e.target.value })}
                >
                  <option value="" disabled>
                    Escolha…
                  </option>
                  {opcoes.pessoas.map((p) => (
                    <option key={p.userId} value={p.userId}>
                      {p.nome}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
            <Field
              nome={id('responsavel')}
              rotulo="Para quem"
              obrigatorio
              erro={problemas.responsavel}
            >
              <Select
                id={id('responsavel')}
                value={r.responsavel}
                onChange={(e) => mudar({ responsavel: e.target.value })}
                aria-invalid={problemas.responsavel !== undefined}
                aria-describedby={describedBy(id('responsavel'), problemas.responsavel)}
              >
                <option value="responsavel">A pessoa responsável pelo registro</option>
                {opcoes.pessoas.map((p) => (
                  <option key={p.userId} value={p.userId}>
                    {p.nome}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              nome={id('dias')}
              rotulo="Prazo (dias)"
              obrigatorio
              erro={problemas.dias}
              dica={DICA_DO_PRAZO}
            >
              <Input
                id={id('dias')}
                value={r.dias}
                onChange={(e) => mudar({ dias: e.target.value })}
                inputMode="numeric"
                className="tabular-nums"
                aria-invalid={problemas.dias !== undefined}
                aria-describedby={describedBy(id('dias'), problemas.dias, DICA_DO_PRAZO)}
              />
            </Field>
          </div>
        )}

        <Field
          nome={id('titulo')}
          rotulo={r.acao === 'core.notify' ? 'Título do aviso' : 'Assunto da atividade'}
          obrigatorio
          erro={problemas.titulo}
        >
          <Input
            ref={tituloRef}
            id={id('titulo')}
            value={r.titulo}
            onChange={(e) => mudar({ titulo: e.target.value })}
            onFocus={() => {
              alvo.current = 'titulo';
            }}
            maxLength={200}
            aria-invalid={problemas.titulo !== undefined}
            aria-describedby={describedBy(id('titulo'), problemas.titulo)}
          />
        </Field>
        {r.acao === 'core.notify' && (
          <Field nome={id('texto')} rotulo="Texto" erro={problemas.texto}>
            <Textarea
              ref={textoRef}
              id={id('texto')}
              value={r.texto}
              onChange={(e) => mudar({ texto: e.target.value })}
              onFocus={() => {
                alvo.current = 'texto';
              }}
              rows={2}
              maxLength={1000}
              aria-invalid={problemas.texto !== undefined}
              aria-describedby={describedBy(id('texto'), problemas.texto)}
            />
          </Field>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-content-subtle">Variáveis do evento:</span>
          {definicao.variaveis.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => inserirVariavel(v)}
              aria-label={`Inserir a variável ${v}`}
              className="rounded-md border border-line-subtle bg-surface-subtle px-1.5 py-0.5 font-mono text-xs text-content-muted transition-colors hover:border-line hover:text-content focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {`{{${v}}}`}
            </button>
          ))}
        </div>
        {previaTitulo !== '' && (
          <div className="rounded-md border border-dashed border-line bg-surface-subtle px-3 py-2 text-sm">
            <p className="text-xs text-content-subtle">
              Prévia com valores de exemplo, não de um registro real
            </p>
            <p className="mt-0.5 font-medium break-words text-content">{previaTitulo}</p>
            {r.acao === 'core.notify' && previaTexto !== '' && (
              <p className="mt-0.5 break-words text-content-muted">{previaTexto}</p>
            )}
          </div>
        )}
      </fieldset>

      <p className="rounded-md bg-surface-accent-soft px-3 py-2 text-sm text-content-default">
        {resumo(r, opcoes)}
      </p>
      {problemas.regra !== undefined && <FormError>{problemas.regra}</FormError>}
    </div>
  );
}
