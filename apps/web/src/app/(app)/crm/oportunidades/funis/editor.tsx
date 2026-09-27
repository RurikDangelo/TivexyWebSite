'use client';

import { ArrowDown, ArrowUp, Check, Pencil, Plus, Star, Trash2, X } from 'lucide-react';
import { type ReactNode, useActionState, useEffect, useRef, useState } from 'react';

import { FormError, FormFeedback } from '@/components/form/messages';
import { Submit } from '@/components/form/submit';
import { Button } from '@/components/ui/button';
import { AlertDialog, type SeveridadeDoAlerta } from '@/components/ui/dialog';
import { Input, Label, Select } from '@/components/ui/input';
import { Tooltip } from '@/components/ui/tooltip';

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

/**
 * Um botão que é um formulário.
 *
 * Mudar ordem e tornar padrão: cada um é uma escrita, e escrita não é link — o
 * navegador pré-carrega link. O erro aparece embaixo do próprio botão, não no
 * topo da página, onde ninguém olha.
 *
 * O que apaga um cadastro não passa por aqui: vai por `<BotaoDeExclusao>`, que
 * pergunta antes.
 */
export function BotaoDeAcao({
  acao,
  campos,
  rotulo,
  icone,
  variante = 'ghost',
  desabilitado = false,
}: {
  acao: 'tornarPadrao' | 'moverEtapa';
  campos: Record<string, string>;
  rotulo: string;
  icone: 'padrao' | 'cima' | 'baixo';
  variante?: 'ghost' | 'outline';
  desabilitado?: boolean;
}) {
  const acoes = { tornarPadrao, moverEtapa };
  const [estado, executar] = useActionState(acoes[acao], ACAO_INICIAL);
  const Icone = { padrao: Star, cima: ArrowUp, baixo: ArrowDown }[icone];
  const soIcone = icone !== 'padrao';

  const botao = (
    <Button
      type="submit"
      variant={variante}
      size={soIcone ? 'icon-sm' : 'sm'}
      disabled={desabilitado}
      aria-label={soIcone ? rotulo : undefined}
    >
      <Icone aria-hidden />
      {!soIcone && rotulo}
    </Button>
  );

  return (
    <form action={executar} className="contents">
      {Object.entries(campos).map(([nome, valor]) => (
        <input key={nome} type="hidden" name={nome} value={valor} />
      ))}
      {/*
       * Dica no lugar do `title=` nativo: aquele demora um segundo, some no
       * toque e nunca aparece no foco por teclado — justamente nos botões que
       * não têm rótulo escrito. O botão desabilitado continua recebendo o
       * ponteiro (o `Button` troca `pointer-events-none` por `cursor-not-allowed`),
       * então a dica explica por que ele está assim.
       */}
      {soIcone ? <Tooltip conteudo={rotulo}>{botao}</Tooltip> : botao}
      {estado.erro !== null && (
        <span className="basis-full">
          <FormError>{estado.erro}</FormError>
        </span>
      )}
    </form>
  );
}

const ACOES_DE_EXCLUSAO = { excluirFunil, excluirEtapa };

/**
 * A exclusão, com a pergunta antes.
 *
 * Era `window.confirm()`: tipografia do sistema, sem tema, sem o verbo
 * destrutivo em destaque, travando a aba inteira — e suprimível pelo navegador,
 * caso em que ele devolve `false` e a ação simplesmente não acontece sem dizer
 * nada. O `<AlertDialog>` diz o que está em jogo antes de acontecer e sabe
 * esperar o servidor.
 *
 * A severidade acompanha o dano: apagar um funil leva junto todas as etapas
 * dele, que é trabalho de configuração; apagar uma etapa vazia se refaz em um
 * clique. Pintar as duas de vermelho ensinaria a ignorar o vermelho.
 */
export function BotaoDeExclusao({
  acao,
  campos,
  rotulo,
  titulo,
  descricao,
  severidade,
  detalhes,
}: {
  acao: 'excluirFunil' | 'excluirEtapa';
  campos: Record<string, string>;
  /** Nome acessível do gatilho, que é só um ícone. */
  rotulo: string;
  titulo: string;
  descricao: ReactNode;
  severidade: SeveridadeDoAlerta;
  /** O que mais a pessoa precisa saber antes de decidir. */
  detalhes?: ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const [estado, setEstado] = useState<AcaoState>(ACAO_INICIAL);
  /**
   * O `AlertDialog` fecha sozinho quando a ação termina. Quando ela falha, o
   * diálogo é o único lugar onde a mensagem cabe — a célula de ações da tabela
   * tem largura de um botão. Este sinal engole exatamente esse fechamento
   * automático; o próximo pedido já é da pessoa.
   */
  const segurarUmFechamento = useRef(false);

  async function confirmar(dados: FormData) {
    const resultado = await ACOES_DE_EXCLUSAO[acao](ACAO_INICIAL, dados);
    segurarUmFechamento.current = resultado.erro !== null;
    setEstado(resultado);
  }

  function fechar() {
    if (segurarUmFechamento.current) {
      segurarUmFechamento.current = false;
      return;
    }
    setAberto(false);
  }

  function abrir() {
    segurarUmFechamento.current = false;
    setEstado(ACAO_INICIAL);
    setAberto(true);
  }

  return (
    <>
      <Tooltip conteudo={rotulo}>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={rotulo}
          onClick={abrir}
          className="text-content-muted hover:text-danger"
        >
          <Trash2 aria-hidden />
        </Button>
      </Tooltip>

      <AlertDialog
        aberto={aberto}
        aoFechar={fechar}
        severidade={severidade}
        titulo={titulo}
        descricao={descricao}
        confirmarRotulo="Excluir"
        confirmarAction={confirmar}
      >
        {Object.entries(campos).map(([nome, valor]) => (
          <input key={nome} type="hidden" name={nome} value={valor} />
        ))}
        {detalhes}
        {estado.erro !== null && <FormError>{estado.erro}</FormError>}
      </AlertDialog>
    </>
  );
}

/**
 * O nome, como texto — e o campo só quando alguém quer mudá-lo.
 *
 * Três funis de seis etapas davam 21 caixas de texto empilhadas: a tela de
 * configuração lia como um formulário gigante, sem nenhuma hierarquia entre o
 * nome do funil e o nome da etapa, porque os dois eram o mesmo `<Input h-8>`.
 */
export function Renomear({
  alvo,
  id,
  nome,
  rotulo,
  destaque = false,
}: {
  alvo: 'funil' | 'etapa';
  id: string;
  nome: string;
  rotulo: string;
  /** O nome do funil, que é o título do bloco. Etapa fica no corpo. */
  destaque?: boolean;
}) {
  const [estado, executar] = useActionState(renomear, ACAO_INICIAL);
  const [editando, setEditando] = useState(false);
  const campo = useRef<HTMLInputElement>(null);
  const campoId = `nome-${id}`;

  /*
   * Fechar na virada do retorno, durante a renderização — não num efeito.
   * Um efeito aqui pintaria o campo ainda aberto por um quadro depois de a
   * gravação ter terminado, e a regra `set-state-in-effect` chama isso de
   * renderização em cascata com razão. Comparar com o valor anterior é o que
   * distingue "acabou de salvar" de "salvou há dois cliques": sem isso,
   * reabrir para renomear de novo fecharia sozinho.
   */
  const [retornoAnterior, setRetornoAnterior] = useState(estado.ok);
  if (estado.ok !== retornoAnterior) {
    setRetornoAnterior(estado.ok);
    if (estado.ok !== null) setEditando(false);
  }

  useEffect(() => {
    if (editando) campo.current?.focus();
  }, [editando]);

  if (!editando) {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-1">
        {destaque ? (
          /* `h2`: o `h1` é o da página. O tamanho é o de `CardTitle`, o papel é de seção. */
          <h2 className="min-w-0 flex-1 truncate text-h3 text-content">{nome}</h2>
        ) : (
          <span className="min-w-0 flex-1 truncate text-body text-content">{nome}</span>
        )}
        <Tooltip conteudo={rotulo}>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={rotulo}
            onClick={() => setEditando(true)}
          >
            <Pencil aria-hidden />
          </Button>
        </Tooltip>
      </div>
    );
  }

  return (
    <form action={executar} className="flex min-w-0 flex-1 flex-col gap-1">
      <input type="hidden" name="alvo" value={alvo} />
      <input type="hidden" name="id" value={id} />
      <Label htmlFor={campoId} className="sr-only">
        {rotulo}
      </Label>
      <div className="flex min-w-0 items-center gap-1.5">
        <Input
          ref={campo}
          id={campoId}
          name="nome"
          size="sm"
          defaultValue={nome}
          required
          maxLength={80}
          className="min-w-0 flex-1"
        />
        <Submit variant="ghost" size="icon-sm" pendente="" aria-label={`Salvar: ${rotulo}`}>
          <Check aria-hidden />
        </Submit>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Cancelar a renomeação"
          onClick={() => setEditando(false)}
        >
          <X aria-hidden />
        </Button>
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
          size="sm"
          defaultValue={tipo}
          disabled={travado !== null}
          aria-describedby={travado === null ? undefined : `${campoId}-travado`}
          className="w-36"
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
          <Submit variant="ghost" size="icon-sm" pendente="" aria-label="Salvar tipo da etapa">
            <Check aria-hidden />
          </Submit>
        )}
      </div>
      {/*
       * O motivo fica escrito, não num `title=`: um seletor desabilitado com a
       * explicação escondida atrás do ponteiro é uma trava sem justificativa
       * para quem usa teclado ou toque.
       */}
      {travado !== null && (
        <p id={`${campoId}-travado`} className="text-caption text-content-subtle">
          {travado}
        </p>
      )}
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
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
      <FormFeedback estado={estado} />
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Label htmlFor="novo-funil">Nome do funil</Label>
          <Input id="novo-funil" name="nome" required maxLength={80} placeholder="Vendas" />
        </div>
        <Submit>
          <Plus aria-hidden />
          Criar funil
        </Submit>
      </div>
      <p className="text-caption text-content-subtle">
        Ele nasce com as etapas de ganho e de perda. As do meio são suas.
      </p>
      <FormFeedback estado={estado} />
    </form>
  );
}
