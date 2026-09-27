'use client';

import { type TenantStatus, previewPlanChange } from '@tivexy/core';
import { useActionState, useState } from 'react';

import { Field, describedBy } from '@/components/form/field';
import { FormFeedback } from '@/components/form/messages';
import { Submit } from '@/components/form/submit';
import { Button } from '@/components/ui/button';
import { AlertDialog } from '@/components/ui/dialog';
import { Input, Select, Textarea } from '@/components/ui/input';
import { SectionLabel } from '@/components/ui/section-label';

import { reativarCliente, salvarCliente, suspenderCliente, trocarPlano } from './actions';
import { CLIENTE_INICIAL, type ClienteState, type ModuloNaTela, type PlanoNaTela } from './state';

/*
 * Os três formulários de decisão sobre um cliente.
 *
 * O `Retorno` local saiu: era a quarta reimplementação de `FormError`/
 * `FormSuccess` no app, com a mesma regra (erro ganha do sucesso) escrita de
 * novo. `FormFeedback` é o componente único.
 *
 * Os dois `window.confirm()` também saíram. O diálogo nativo não tem tema, não
 * tem tipografia, trava a aba, não sabe esperar por uma ação de servidor e não
 * cabe o resumo do que vai mudar — que, no caso da troca de plano, a tela já
 * tinha calculado e não tinha onde mostrar. Pode ainda ser suprimido pelo
 * navegador ("não deixar este site criar mais diálogos"), e aí retorna `false`
 * e a ação simplesmente não acontece, sem nenhum aviso.
 *
 * Onde há `<AlertDialog>`, a ação de servidor é chamada direto dentro da ação
 * de formulário do diálogo — e não por `useActionState`. O dispatch do hook
 * retorna imediatamente, e o diálogo fecharia antes de o servidor responder,
 * deixando o botão de confirmar sem estado pendente e o clique duplo livre.
 */

/** Nome, razão social e documento. O identificador não muda: já está gravado no provisionamento. */
export function DadosForm({
  id,
  nome,
  razaoSocial,
  documento,
}: {
  id: string;
  nome: string;
  razaoSocial: string | null;
  documento: string | null;
}) {
  const [estado, salvar] = useActionState(salvarCliente, CLIENTE_INICIAL);
  const e = estado.campos;

  return (
    <form action={salvar} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field nome="cliente-nome" rotulo="Nome" obrigatorio erro={e.nome}>
          <Input
            id="cliente-nome"
            name="nome"
            defaultValue={nome}
            required
            maxLength={120}
            aria-invalid={e.nome !== undefined}
            aria-describedby={describedBy('cliente-nome', e.nome)}
          />
        </Field>
        <Field nome="cliente-razao" rotulo="Razão social" erro={e.razaoSocial}>
          <Input
            id="cliente-razao"
            name="razaoSocial"
            defaultValue={razaoSocial ?? ''}
            maxLength={200}
            aria-invalid={e.razaoSocial !== undefined}
            aria-describedby={describedBy('cliente-razao', e.razaoSocial)}
          />
        </Field>
        <Field
          nome="cliente-documento"
          rotulo="CNPJ ou CPF"
          erro={e.documento}
          dica="O CNPJ com letras, de 2026, também vale."
        >
          <Input
            id="cliente-documento"
            name="documento"
            defaultValue={documento ?? ''}
            maxLength={20}
            autoComplete="off"
            className="font-mono"
            aria-invalid={e.documento !== undefined}
            aria-describedby={describedBy(
              'cliente-documento',
              e.documento,
              'O CNPJ com letras, de 2026, também vale.',
            )}
          />
        </Field>
      </div>
      <div className="flex flex-col gap-3">
        <Submit variant="outline">Salvar dados</Submit>
        <FormFeedback estado={estado} />
      </div>
    </form>
  );
}

/**
 * Suspender ou reativar.
 *
 * O motivo mudou de lugar: ele é pedido **dentro** do diálogo, no instante da
 * decisão, e não num campo solto que fica na tela esperando alguém esbarrar no
 * botão. É a mesma informação, no momento em que ela é usada — a empresa lê
 * esse texto quando tenta entrar.
 */
export function SituacaoForm({
  id,
  nomeDaEmpresa,
  situacao,
  motivo,
}: {
  id: string;
  nomeDaEmpresa: string;
  situacao: TenantStatus;
  motivo: string | null;
}) {
  const [suspensao, setSuspensao] = useState<ClienteState>(CLIENTE_INICIAL);
  const [reativacao, setReativacao] = useState<ClienteState>(CLIENTE_INICIAL);
  const [confirmando, setConfirmando] = useState(false);

  async function suspender(dados: FormData) {
    setSuspensao(await suspenderCliente(suspensao, dados));
  }

  async function reativar(dados: FormData) {
    setReativacao(await reativarCliente(reativacao, dados));
  }

  if (situacao === 'active') {
    return (
      <div className="flex flex-col gap-3">
        <Button type="button" variant="danger" onClick={() => setConfirmando(true)}>
          Suspender
        </Button>
        {/* O sucesso da reativação continua visível depois que a empresa volta a ser `active`. */}
        <FormFeedback estado={{ erro: suspensao.erro, ok: reativacao.ok ?? suspensao.ok }} />

        <AlertDialog
          aberto={confirmando}
          aoFechar={() => setConfirmando(false)}
          severidade="danger"
          titulo={`Suspender ${nomeDaEmpresa}?`}
          descricao="Ninguém da empresa entra até reativar — nem pela tela, nem pela API. Os dados ficam onde estão, e reativar devolve tudo."
          confirmarRotulo="Suspender"
          confirmarAction={suspender}
        >
          <input type="hidden" name="id" value={id} />
          <Field
            nome="cliente-motivo"
            rotulo="Motivo da suspensão"
            obrigatorio
            dica="A empresa lê este texto quando tenta entrar."
          >
            <Textarea
              id="cliente-motivo"
              name="motivo"
              required
              maxLength={500}
              rows={2}
              placeholder="Pagamento de setembro em aberto."
              aria-describedby={describedBy(
                'cliente-motivo',
                undefined,
                'A empresa lê este texto quando tenta entrar.',
              )}
            />
          </Field>
        </AlertDialog>
      </div>
    );
  }

  if (situacao === 'suspended') {
    return (
      <form action={reativar} className="flex flex-col gap-3">
        <input type="hidden" name="id" value={id} />
        <div className="flex flex-col gap-1 rounded-control bg-surface-sunken px-3 py-2">
          <SectionLabel>Motivo informado</SectionLabel>
          <p className="text-body text-content-default">{motivo ?? 'nenhum registrado'}</p>
        </div>
        <div className="flex flex-col gap-3">
          <Submit pendente="Reativando…">Reativar</Submit>
          <FormFeedback estado={{ erro: reativacao.erro, ok: suspensao.ok ?? reativacao.ok }} />
        </div>
      </form>
    );
  }

  return (
    <p className="text-body text-content-muted">
      {situacao === 'provisioning'
        ? 'Em provisionamento: não se suspende nem reativa. Retome ou desfaça na lista de clientes.'
        : 'Cancelada: não volta por aqui.'}
    </p>
  );
}

/**
 * Trocar o plano, vendo antes o que muda nos módulos — a mesma conta que o
 * banco vai fazer (`previewPlanChange` × `admin_change_plan`, com teste).
 *
 * A prévia aparece duas vezes de propósito: na tela, enquanto se experimenta os
 * planos; e dentro do diálogo, na hora de confirmar — porque é ali que ela
 * responde "o que estou aceitando?", e era exatamente o que não cabia num
 * `window.confirm`.
 */
export function PlanoForm({
  id,
  planoAtual,
  planos,
  modulos,
}: {
  id: string;
  planoAtual: string | null;
  planos: readonly PlanoNaTela[];
  modulos: readonly ModuloNaTela[];
}) {
  const [estado, setEstado] = useState<ClienteState>(CLIENTE_INICIAL);
  const [confirmando, setConfirmando] = useState(false);
  const outros = planos.filter((p) => p.codigo !== planoAtual);
  const [escolhido, setEscolhido] = useState(outros[0]?.codigo ?? '');
  const [desligar, setDesligar] = useState(false);

  // Depois de trocar, o escolhido pode ser o plano atual, que saiu da lista.
  const valor = outros.some((p) => p.codigo === escolhido) ? escolhido : (outros[0]?.codigo ?? '');
  const plano = planos.find((p) => p.codigo === valor);
  const nome = (codigo: string) => modulos.find((m) => m.codigo === codigo)?.nome ?? codigo;
  const ligados = modulos.filter((m) => m.ligado).map((m) => m.codigo);
  const previa =
    plano === undefined
      ? null
      : previewPlanChange({ planModules: plano.modulos, enabled: ligados, disableOutside: true });
  const foraDoPlano = previa?.disable ?? [];

  async function trocar(dados: FormData) {
    setEstado(await trocarPlano(estado, dados));
  }

  if (outros.length === 0) {
    return <p className="text-body text-content-muted">Não há outro plano à venda.</p>;
  }

  const liga = previa === null || previa.enable.length === 0 ? null : previa.enable.map(nome);
  const desliga = foraDoPlano.length === 0 ? null : foraDoPlano.map(nome);

  return (
    <div className="flex flex-col gap-3">
      <Field nome="cliente-plano" rotulo="Plano novo" obrigatorio>
        <Select
          id="cliente-plano"
          name="plano"
          value={valor}
          onChange={(ev) => setEscolhido(ev.target.value)}
          className="sm:max-w-xs"
        >
          {outros.map((p) => (
            <option key={p.codigo} value={p.codigo}>
              {p.nome}
            </option>
          ))}
        </Select>
      </Field>

      {previa !== null && <ResumoDaTroca liga={liga} desliga={desliga} anunciar />}

      {desliga !== null && (
        <label className="flex items-start gap-2 text-body text-content-default">
          <input
            type="checkbox"
            checked={desligar}
            onChange={(ev) => setDesligar(ev.target.checked)}
            className="mt-0.5 size-4 accent-[var(--surface-brand)]"
          />
          <span>
            Desligar o que ficou fora do plano ({desliga.join(', ')}). Os dados ficam; o acesso sai,
            e religar devolve tudo. Sem marcar, continuam ligados — como módulo vendido à parte.
          </span>
        </label>
      )}

      <div className="flex flex-col gap-3">
        <Button type="button" variant="outline" onClick={() => setConfirmando(true)}>
          Trocar plano
        </Button>
        <FormFeedback estado={estado} />
      </div>

      <AlertDialog
        aberto={confirmando}
        aoFechar={() => setConfirmando(false)}
        /* Reversível: dá para trocar de volta. O vermelho fica para o que não volta. */
        severidade="warning"
        titulo={`Trocar para o plano ${plano?.nome ?? valor}?`}
        descricao="O plano é o padrão de origem; quem decide acesso são os módulos ligados. É isto que muda:"
        confirmarRotulo="Trocar plano"
        confirmarAction={trocar}
      >
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="plano" value={valor} />
        {/*
         * A ação lê `desligar === 'on'`, que é o valor de uma caixa marcada. O
         * campo só existe quando a pessoa marcou lá fora — ausente é "não".
         */}
        {desligar && desliga !== null && <input type="hidden" name="desligar" value="on" />}

        <ResumoDaTroca liga={liga} desliga={desliga} />

        {desliga !== null && (
          <p className="text-body text-content-muted">
            {desligar
              ? 'Os módulos fora do plano novo serão desligados. Os dados ficam, e religar devolve tudo.'
              : 'Os módulos fora do plano novo continuam ligados, como módulo vendido à parte.'}
          </p>
        )}
      </AlertDialog>
    </div>
  );
}

/**
 * O que a troca liga e o que ela tira do plano.
 *
 * Um componente só porque o mesmo resumo aparece na tela e no diálogo — duas
 * cópias divergiriam na primeira mudança de texto.
 */
function ResumoDaTroca({
  liga,
  desliga,
  anunciar = false,
}: {
  liga: readonly string[] | null;
  desliga: readonly string[] | null;
  /** Na tela o resumo muda ao trocar o select, e o leitor de tela precisa saber. No diálogo ele é estático. */
  anunciar?: boolean;
}) {
  return (
    <div
      role={anunciar ? 'status' : undefined}
      className="flex flex-col gap-1 rounded-control bg-surface-sunken px-3 py-2 text-body"
    >
      <p>
        <span className="font-medium text-content">Liga: </span>
        <span className="text-content-muted">
          {liga === null ? 'nada — já tem tudo' : liga.join(', ')}
        </span>
      </p>
      <p>
        <span className="font-medium text-content">Fora do plano novo: </span>
        <span className="text-content-muted">{desliga === null ? 'nada' : desliga.join(', ')}</span>
      </p>
    </div>
  );
}
