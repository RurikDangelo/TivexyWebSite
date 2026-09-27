'use client';

import { CalendarClock, Check, Plus, Trash2 } from 'lucide-react';
import { useActionState, useEffect, useRef, useState } from 'react';

import { FormError, FormFeedback } from '@/components/form/messages';
import { Submit } from '@/components/form/submit';
import { Button } from '@/components/ui/button';
import { AlertDialog } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';
import { TBody, TD, TR, Table, TableEmpty } from '@/components/ui/table';
import { Tooltip } from '@/components/ui/tooltip';

import { criarTipo, excluirTipo, renomearTipo } from './actions';
import { CONFIG_INICIAL } from './state';

/** Nome e ações. Sem cabeçalho visível: duas colunas cujo conteúdo se explica. */
const COLUNAS = 2;

export interface TipoNaTela {
  id: string;
  nome: string;
}

/**
 * Excluir um tipo de atividade, com o diálogo da casa.
 *
 * A frase é a mesma que estava no `window.confirm` — ela já era boa; o que era
 * ruim era o recipiente, que ignora tema, tipografia e severidade, e que o
 * navegador pode suprimir (e aí ele devolve `false` e a ação some em silêncio).
 */
function ExcluirTipo({
  tipo,
  aoFalhar,
}: {
  tipo: TipoNaTela;
  aoFalhar: (erro: string | null) => void;
}) {
  const [aberto, setAberto] = useState(false);

  async function confirmar() {
    aoFalhar(null);
    const dados = new FormData();
    dados.set('id', tipo.id);
    const r = await excluirTipo(CONFIG_INICIAL, dados);
    aoFalhar(r.erro);
  }

  return (
    <>
      <Tooltip conteudo="Excluir">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Excluir ${tipo.nome}`}
          onClick={() => setAberto(true)}
        >
          <Trash2 aria-hidden />
        </Button>
      </Tooltip>
      <AlertDialog
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        /*
         * `warning`, não `danger`: nenhuma atividade é apagada. A chave é
         * `on delete set null`, e as atividades desse tipo ficam sem tipo —
         * pintar isso de vermelho ensinaria a ignorar o vermelho de verdade.
         */
        severidade="warning"
        titulo={`Excluir "${tipo.nome}"?`}
        descricao="As atividades desse tipo continuam existindo — elas ficam sem tipo, e você pode reclassificá-las depois."
        confirmarRotulo="Excluir tipo"
        confirmarAction={confirmar}
      />
    </>
  );
}

/** Uma linha: o nome editável no lugar, e o botão de excluir ao lado. */
function TipoLinha({ tipo, podeEditar }: { tipo: TipoNaTela; podeEditar: boolean }) {
  const [renomeado, renomearAcao] = useActionState(renomearTipo, CONFIG_INICIAL);
  const [erroDaExclusao, setErroDaExclusao] = useState<string | null>(null);

  if (!podeEditar) {
    return (
      <TR>
        <TD rotulo="Tipo">{tipo.nome}</TD>
        <TD acoes>
          <span className="text-caption text-content-subtle">somente leitura</span>
        </TD>
      </TR>
    );
  }

  const erro = erroDaExclusao ?? renomeado.erro;

  return (
    <>
      <TR>
        <TD rotulo="Tipo">
          <form action={renomearAcao} className="flex min-w-0 flex-1 items-center gap-1.5">
            <input type="hidden" name="id" value={tipo.id} />
            <Label htmlFor={`tipo-${tipo.id}`} className="sr-only">
              Nome do tipo {tipo.nome}
            </Label>
            <Input
              id={`tipo-${tipo.id}`}
              name="nome"
              defaultValue={tipo.nome}
              required
              maxLength={60}
              size="sm"
              className="max-w-xs"
            />
            <Submit
              variant="ghost"
              size="icon-sm"
              pendente=""
              aria-label={`Salvar o nome de ${tipo.nome}`}
            >
              <Check aria-hidden />
            </Submit>
          </form>
        </TD>
        <TD acoes>
          <ExcluirTipo tipo={tipo} aoFalhar={setErroDaExclusao} />
        </TD>
      </TR>
      {erro !== null && (
        <TR>
          <TD colSpan={COLUNAS}>
            <div className="min-w-0 flex-1">
              <FormError>{erro}</FormError>
            </div>
          </TD>
        </TR>
      )}
    </>
  );
}

export interface TiposDeAtividadeProps {
  tipos: readonly TipoNaTela[];
  podeEditar: boolean;
  plural: string;
  /** A leitura falhou. Lista vazia então não significa "ainda não há tipos". */
  erro: boolean;
}

/**
 * Os tipos que separam uma atividade da outra na agenda.
 *
 * Tabela densa em vez da lista de 11 cópias: com o campo de renomear dentro da
 * linha, cabem quinze tipos na tela sem rolagem.
 */
export function TiposDeAtividade({ tipos, podeEditar, plural, erro }: TiposDeAtividadeProps) {
  const [estado, acao] = useActionState(criarTipo, CONFIG_INICIAL);
  const formulario = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (estado.ok !== null) formulario.current?.reset();
  }, [estado.ok]);

  return (
    <div className="flex flex-col gap-4">
      <Table rotulo={`Tipos de ${plural}`} densidade="densa" moldura="nenhuma">
        <TBody>
          {erro ? (
            <TableEmpty colunas={COLUNAS} icone={CalendarClock} titulo="Não consegui ler os tipos">
              Pode haver tipos cadastrados que não aparecem aqui. Recarregue a página antes de criar
              outro, para não duplicar.
            </TableEmpty>
          ) : tipos.length === 0 ? (
            <TableEmpty colunas={COLUNAS} icone={CalendarClock} titulo="Ainda não há tipos">
              Sem eles, {plural} ficam “sem tipo” — funciona, mas não dá para separar uma coisa da
              outra na agenda.
              {podeEditar ? ' Crie o primeiro no campo abaixo.' : ''}
            </TableEmpty>
          ) : (
            tipos.map((t) => <TipoLinha key={t.id} tipo={t} podeEditar={podeEditar} />)
          )}
        </TBody>
      </Table>

      {podeEditar && (
        <form ref={formulario} action={acao} className="flex flex-col gap-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Label htmlFor="novo-tipo">Novo tipo</Label>
              <Input id="novo-tipo" name="nome" required maxLength={60} placeholder="Visita" />
            </div>
            <Submit variant="outline">
              <Plus aria-hidden />
              Adicionar
            </Submit>
          </div>
          {estado.campos.nome !== undefined && <FormError>{estado.campos.nome}</FormError>}
          <FormFeedback estado={{ erro: estado.erro, ok: estado.ok }} />
        </form>
      )}
    </div>
  );
}
