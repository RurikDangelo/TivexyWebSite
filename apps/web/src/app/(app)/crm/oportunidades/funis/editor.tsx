'use client';

import { ArrowDown, ArrowUp, Check, Plus, Star, Trash2 } from 'lucide-react';
import { useActionState, useEffect, useRef } from 'react';

import { FormError, FormSuccess } from '@/components/form/messages';
import { Submit } from '@/components/form/submit';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';

import {
  criarEtapa,
  criarFunil,
  excluirEtapa,
  excluirFunil,
  moverEtapa,
  mudarTipo,
  renomear,
  tornarPadrao,
} from './actions';
import { ACAO_INICIAL, type AcaoState, TIPOS_DE_ETAPA } from './state';

type Acao = (anterior: AcaoState, form: FormData) => Promise<AcaoState>;

/** O retorno de uma ação, onde ela aconteceu. */
function Retorno({ estado }: { estado: AcaoState }) {
  if (estado.erro !== null) return <FormError>{estado.erro}</FormError>;
  if (estado.ok !== null) return <FormSuccess>{estado.ok}</FormSuccess>;
  return null;
}

/**
 * Um botão que é um formulário.
 *
 * Mudar ordem, tornar padrão, excluir: cada um é uma escrita, e escrita não é
 * link — o navegador pré-carrega link. O erro aparece embaixo do próprio
 * botão, não no topo da página, onde ninguém olha.
 */
export function BotaoDeAcao({
  acao,
  campos,
  rotulo,
  icone,
  variante = 'ghost',
  confirmar,
  desabilitado = false,
}: {
  acao: 'tornarPadrao' | 'excluirFunil' | 'moverEtapa' | 'excluirEtapa';
  campos: Record<string, string>;
  rotulo: string;
  icone: 'padrao' | 'excluir' | 'cima' | 'baixo';
  variante?: 'ghost' | 'outline';
  /** Pergunta antes de agir. Só para o que não se desfaz com um clique. */
  confirmar?: string;
  desabilitado?: boolean;
}) {
  const acoes: Record<typeof acao, Acao> = { tornarPadrao, excluirFunil, moverEtapa, excluirEtapa };
  const [estado, executar] = useActionState(acoes[acao], ACAO_INICIAL);
  const Icone = { padrao: Star, excluir: Trash2, cima: ArrowUp, baixo: ArrowDown }[icone];
  const soIcone = icone === 'cima' || icone === 'baixo' || icone === 'excluir';

  return (
    <form
      action={executar}
      onSubmit={(e) => {
        if (confirmar !== undefined && !window.confirm(confirmar)) e.preventDefault();
      }}
      className="contents"
    >
      {Object.entries(campos).map(([nome, valor]) => (
        <input key={nome} type="hidden" name={nome} value={valor} />
      ))}
      <Button
        type="submit"
        variant={variante}
        size={soIcone ? 'icon' : 'sm'}
        disabled={desabilitado}
        aria-label={soIcone ? rotulo : undefined}
        title={soIcone ? rotulo : undefined}
        className={soIcone ? 'size-8' : undefined}
      >
        <Icone aria-hidden />
        {!soIcone && rotulo}
      </Button>
      {estado.erro !== null && (
        <span className="basis-full">
          <FormError>{estado.erro}</FormError>
        </span>
      )}
    </form>
  );
}

/** Renomear no lugar: o nome é o campo. */
export function Renomear({
  alvo,
  id,
  nome,
  rotulo,
}: {
  alvo: 'funil' | 'etapa';
  id: string;
  nome: string;
  rotulo: string;
}) {
  const [estado, executar] = useActionState(renomear, ACAO_INICIAL);
  const campoId = `nome-${id}`;

  return (
    <form action={executar} className="flex min-w-0 flex-1 flex-col gap-1">
      <input type="hidden" name="alvo" value={alvo} />
      <input type="hidden" name="id" value={id} />
      <Label htmlFor={campoId} className="sr-only">
        {rotulo}
      </Label>
      <div className="flex min-w-0 items-center gap-1.5">
        <Input
          id={campoId}
          name="nome"
          defaultValue={nome}
          required
          maxLength={80}
          className="h-8 min-w-0 flex-1"
        />
        <Submit
          variant="ghost"
          size="icon"
          className="size-8"
          pendente=""
          aria-label={`Salvar ${rotulo.toLowerCase()}`}
        >
          <Check aria-hidden />
        </Submit>
      </div>
      {estado.erro !== null && <FormError>{estado.erro}</FormError>}
    </form>
  );
}

/** O tipo de uma etapa. Travado quando há negócio dentro — o banco recusaria. */
export function TipoDaEtapa({
  id,
  funil,
  tipo,
  travado,
}: {
  id: string;
  funil: string;
  tipo: string;
  travado: string | null;
}) {
  const [estado, executar] = useActionState(mudarTipo, ACAO_INICIAL);
  const campoId = `tipo-${id}`;

  return (
    <form action={executar} className="flex flex-col gap-1">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="funil" value={funil} />
      <Label htmlFor={campoId} className="sr-only">
        Tipo da etapa
      </Label>
      <div className="flex items-center gap-1.5">
        <Select
          id={campoId}
          name="tipo"
          defaultValue={tipo}
          disabled={travado !== null}
          title={travado ?? undefined}
          className="h-8 w-36"
        >
          {TIPOS_DE_ETAPA.map((t) => (
            <option key={t.valor} value={t.valor}>
              {t.rotulo}
            </option>
          ))}
        </Select>
        {/*
         * Salvar é um clique à parte, e não a troca do seletor: com teclado,
         * cada seta muda o valor, e salvar na troca gravaria um tipo por tecla.
         */}
        {travado === null && (
          <Submit
            variant="ghost"
            size="icon"
            className="size-8"
            pendente=""
            aria-label="Salvar tipo da etapa"
          >
            <Check aria-hidden />
          </Submit>
        )}
      </div>
      {travado !== null && <p className="text-xs text-content-subtle">{travado}</p>}
      {estado.erro !== null && <FormError>{estado.erro}</FormError>}
    </form>
  );
}

export function NovaEtapa({ funil }: { funil: string }) {
  const [estado, executar] = useActionState(criarEtapa, ACAO_INICIAL);
  const formulario = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (estado.ok !== null) formulario.current?.reset();
  }, [estado.ok]);

  return (
    <form ref={formulario} action={executar} className="flex flex-col gap-2">
      <input type="hidden" name="funil" value={funil} />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Label htmlFor={`nova-etapa-${funil}`}>Nova etapa</Label>
          <Input
            id={`nova-etapa-${funil}`}
            name="nome"
            required
            maxLength={80}
            placeholder="Proposta enviada"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`novo-tipo-${funil}`}>Tipo</Label>
          <Select id={`novo-tipo-${funil}`} name="tipo" defaultValue="open" className="sm:w-40">
            {TIPOS_DE_ETAPA.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.rotulo}
              </option>
            ))}
          </Select>
        </div>
        <Submit variant="outline">
          <Plus aria-hidden />
          Adicionar
        </Submit>
      </div>
      <Retorno estado={estado} />
    </form>
  );
}

export function NovoFunil() {
  const [estado, executar] = useActionState(criarFunil, ACAO_INICIAL);
  const formulario = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (estado.ok !== null) formulario.current?.reset();
  }, [estado.ok]);

  return (
    <form ref={formulario} action={executar} className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Label htmlFor="novo-funil">Nome do funil</Label>
          <Input id="novo-funil" name="nome" required maxLength={80} placeholder="Vendas" />
        </div>
        <Submit>
          <Plus aria-hidden />
          Criar funil
        </Submit>
      </div>
      <p className="text-xs text-content-subtle">
        Ele nasce com as etapas de ganho e de perda. As do meio são suas.
      </p>
      <Retorno estado={estado} />
    </form>
  );
}
