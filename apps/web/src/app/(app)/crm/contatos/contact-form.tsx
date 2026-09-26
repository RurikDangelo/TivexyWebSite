'use client';

import { Pencil, Plus, X } from 'lucide-react';
import { useActionState, useEffect, useRef, useState } from 'react';

import { Field, describedBy, idDoCampo } from '@/components/form/field';
import { FormError, FormSuccess } from '@/components/form/messages';
import { Submit } from '@/components/form/submit';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Combobox, type OpcaoDoCombobox } from '@/components/ui/combobox';
import { Input, Select, Textarea } from '@/components/ui/input';
import { SectionLabel } from '@/components/ui/section-label';

import { criarContato, editarContato } from './actions';
import { CONTATO_INICIAL, TETO_DE_CONTAS, type ContatoFormState, type Opcao } from './state';

export interface ValoresDoContato {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  /** Já formatado para leitura: `529.982.247-25`. */
  documento: string | null;
  cargo: string | null;
  /**
   * A empresa vinculada, com nome — não só o id.
   *
   * Vem da própria linha do contato, e não de uma busca na lista de opções:
   * a lista é cortada em `TETO_DE_CONTAS`, e um vínculo fora do corte apareceria
   * como "nenhuma empresa" num formulário que, salvo, apagaria o vínculo.
   */
  conta: Opcao | null;
  responsavelId: string | null;
  notas: string | null;
}

interface Props {
  singular: string;
  rotuloConta: string;
  contas: readonly Opcao[];
  /** A consulta de empresas falhou: lista vazia aqui não significa "não há nenhuma". */
  contasFalharam: boolean;
  membros: readonly Opcao[];
  /** `crm.contact_requires_document`: o campo vira obrigatório, e diz por quê. */
  exigirDocumento: boolean;
}

/**
 * Escopo dos ids deste formulário.
 *
 * Literal e não `useEscopo()`: a colisão é conhecida — em `/crm/contatos/[id]`
 * o cadastro da pessoa e o de atividade geram ambos `responsavel` e `notas`, e
 * clicar no rótulo de um focava o campo do outro. Um prefixo escrito à mão se
 * lê no DOM e sobrevive a um diff; um `useId` muda a cada build.
 */
const ESCOPO = 'contato';

/**
 * O cadastro de pessoa, recolhido até ser pedido.
 *
 * Só o nome é obrigatório — a menos que a empresa exija documento. Quem anota
 * alguém que acabou de ligar raramente tem tudo, e exigir o resto faria a
 * pessoa inventar valores para conseguir salvar.
 */
export function NewContactForm(props: Props) {
  const [aberto, setAberto] = useState(false);
  const [estado, acao] = useActionState(criarContato, CONTATO_INICIAL);
  const formulario = useRef<HTMLFormElement>(null);
  const primeiro = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (estado.salvo === null) return;
    formulario.current?.reset();
    primeiro.current?.focus();
  }, [estado.salvo]);

  if (!aberto) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => setAberto(true)}>
          <Plus aria-hidden />
          Cadastrar {props.singular}
        </Button>
        {estado.salvo !== null && <FormSuccess>{`${estado.salvo} entrou na lista.`}</FormSuccess>}
      </div>
    );
  }

  return (
    /*
     * `w-full` com o contêiner em `flex-wrap`: aberto, o painel desce para uma
     * linha só dele, em vez de dividir a faixa com o campo de busca.
     */
    <form
      ref={formulario}
      action={acao}
      aria-label={`Cadastrar ${props.singular}`}
      className="animate-enter w-full rounded-card border border-line-subtle bg-surface-panel p-4 shadow-card"
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-h2 text-content">Cadastrar {props.singular}</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Fechar cadastro"
          onClick={() => setAberto(false)}
        >
          <X aria-hidden />
        </Button>
      </div>
      {/*
       * `limparApos`: `form.reset()` devolve os campos nativos ao padrão, mas não
       * alcança o combobox, cuja escolha é estado do React. Sem isto, cadastrar
       * duas pessoas seguidas repetiria a empresa da primeira sem avisar.
       */}
      <Campos {...props} estado={estado} primeiro={primeiro} limparApos={estado} />
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Submit>Cadastrar</Submit>
        <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
          Cancelar
        </Button>
        {estado.salvo !== null && <FormSuccess>{`${estado.salvo} entrou na lista.`}</FormSuccess>}
      </div>
    </form>
  );
}

/**
 * Só quem pode escrever recebe as listas de vínculo.
 *
 * União discriminada, e não `Props` com `podeEditar` opcional: mandar 500 nomes
 * de empresa para o cliente em nome de um formulário que aquela pessoa não pode
 * abrir é peso puro — e o tipo agora impede que aconteça por descuido.
 */
export type ContactRecordProps =
  | { podeEditar: false; notas: string | null }
  | (Props & { podeEditar: true; inicial: ValoresDoContato });

/**
 * O cadastro na tela de detalhe: leitura por padrão, formulário sob demanda.
 *
 * Antes o formulário ficava sempre aberto e o card trocava de título conforme
 * o papel de quem olhava ("Editar cadastro" ou "Notas") — duas pessoas
 * descreviam a mesma tela por nomes diferentes, e as notas, que são o único
 * texto do registro, só existiam como valor de um `<textarea>`.
 */
export function ContactRecord(props: ContactRecordProps) {
  const [editando, setEditando] = useState(false);
  const [estado, acao] = useActionState(editarContato, CONTATO_INICIAL);

  const notas = (props.podeEditar ? props.inicial.notas : props.notas) ?? '';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cadastro</CardTitle>
        {props.podeEditar && (
          <CardAction>
            <Button
              variant={editando ? 'ghost' : 'outline'}
              size="sm"
              onClick={() => setEditando((v) => !v)}
            >
              {editando ? (
                'Cancelar'
              ) : (
                <>
                  <Pencil aria-hidden />
                  Editar
                </>
              )}
            </Button>
          </CardAction>
        )}
      </CardHeader>

      <CardContent>
        {props.podeEditar && editando ? (
          <form action={acao} className="flex flex-col gap-4">
            <input type="hidden" name="id" value={props.inicial.id} />
            <Campos
              singular={props.singular}
              rotuloConta={props.rotuloConta}
              contas={props.contas}
              contasFalharam={props.contasFalharam}
              membros={props.membros}
              exigirDocumento={props.exigirDocumento}
              estado={estado}
              inicial={props.inicial}
            />
            <div className="flex flex-wrap items-center gap-3">
              <Submit>Salvar alterações</Submit>
              {estado.salvo !== null && <FormSuccess>Alterações salvas.</FormSuccess>}
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-2">
            <SectionLabel>Notas</SectionLabel>
            {notas === '' ? (
              <p className="text-body text-content-subtle">
                {props.podeEditar
                  ? 'Sem notas. Use “Editar” para registrar o que importa lembrar desta pessoa.'
                  : 'Sem notas. Quem tem permissão de escrita pode registrar aqui.'}
              </p>
            ) : (
              /* `max-w-prose` no parágrafo, não no cartão: medida de leitura é do texto. */
              <p className="max-w-prose text-body whitespace-pre-wrap text-content">{notas}</p>
            )}
            {/* O sucesso continua visível depois de fechar o formulário — é a confirmação do que acabou de ser salvo. */}
            {estado.salvo !== null && <FormSuccess>Alterações salvas.</FormSuccess>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Quantas empresas o painel do combobox mostra de uma vez. Acima disso, a busca é o caminho. */
const OPCOES_VISIVEIS = 50;

function Campos({
  contas,
  contasFalharam,
  membros,
  rotuloConta,
  exigirDocumento,
  estado,
  inicial,
  primeiro,
  limparApos,
}: Props & {
  estado: ContatoFormState;
  inicial?: ValoresDoContato;
  primeiro?: React.RefObject<HTMLInputElement | null>;
  /** Presente, o vínculo volta a vazio a cada cadastro salvo. Só o formulário de criação passa. */
  limparApos?: ContatoFormState;
}) {
  const e = estado.campos;
  const dicaDocumento = exigirDocumento
    ? 'Esta empresa exige documento no cadastro.'
    : 'CPF, ou CNPJ — inclusive o novo, com letras.';

  /*
   * O que a tela pode afirmar sobre a lista de empresas, e nada além disso:
   * ou a leitura falhou, ou ela veio cheia até o teto (e então pode haver mais
   * lá fora), ou está inteira. Antes era um `<select>` de até 500 `<option>`
   * que não dizia nenhuma das três coisas.
   */
  const dicaConta = contasFalharam
    ? 'Não consegui carregar a lista agora. O vínculo pode ser feito depois, pela edição.'
    : contas.length >= TETO_DE_CONTAS
      ? `A lista traz as primeiras ${TETO_DE_CONTAS} em ordem alfabética; pode haver mais fora do corte.`
      : undefined;

  return (
    <div className="flex flex-col gap-4">
      {estado.erro !== null && <FormError>{estado.erro}</FormError>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field nome="nome" rotulo="Nome" escopo={ESCOPO} obrigatorio erro={e.nome}>
          <Input
            ref={primeiro}
            id={idDoCampo('nome', ESCOPO)}
            name="nome"
            required
            maxLength={160}
            autoComplete="off"
            defaultValue={inicial?.nome}
            placeholder="Maria Souza"
            aria-invalid={e.nome !== undefined}
            aria-describedby={describedBy('nome', e.nome, undefined, ESCOPO)}
          />
        </Field>

        <Field
          nome="documento"
          rotulo="CPF ou CNPJ"
          escopo={ESCOPO}
          obrigatorio={exigirDocumento}
          erro={e.documento}
          dica={dicaDocumento}
        >
          <Input
            id={idDoCampo('documento', ESCOPO)}
            name="documento"
            required={exigirDocumento}
            maxLength={20}
            autoComplete="off"
            defaultValue={inicial?.documento ?? ''}
            placeholder="529.982.247-25"
            aria-invalid={e.documento !== undefined}
            aria-describedby={describedBy('documento', e.documento, dicaDocumento, ESCOPO)}
          />
        </Field>

        <Field nome="email" rotulo="E-mail" escopo={ESCOPO} erro={e.email}>
          <Input
            id={idDoCampo('email', ESCOPO)}
            name="email"
            type="email"
            autoComplete="off"
            defaultValue={inicial?.email ?? ''}
            placeholder="maria@exemplo.com.br"
            aria-invalid={e.email !== undefined}
            aria-describedby={describedBy('email', e.email, undefined, ESCOPO)}
          />
        </Field>

        <Field nome="telefone" rotulo="Telefone" escopo={ESCOPO} erro={e.telefone}>
          <Input
            id={idDoCampo('telefone', ESCOPO)}
            name="telefone"
            type="tel"
            autoComplete="off"
            defaultValue={inicial?.telefone ?? ''}
            placeholder="(11) 90000-0000"
            aria-invalid={e.telefone !== undefined}
            aria-describedby={describedBy('telefone', e.telefone, undefined, ESCOPO)}
          />
        </Field>

        <Field nome="cargo" rotulo="Cargo ou função" escopo={ESCOPO} erro={e.cargo}>
          <Input
            id={idDoCampo('cargo', ESCOPO)}
            name="cargo"
            maxLength={120}
            defaultValue={inicial?.cargo ?? ''}
            placeholder="Compras"
            aria-invalid={e.cargo !== undefined}
            aria-describedby={describedBy('cargo', e.cargo, undefined, ESCOPO)}
          />
        </Field>

        <Field nome="conta" rotulo={rotuloConta} escopo={ESCOPO} dica={dicaConta}>
          <CampoDeConta
            rotulo={rotuloConta}
            contas={contas}
            inicial={inicial?.conta ?? null}
            limparApos={limparApos}
            descritoPor={describedBy('conta', undefined, dicaConta, ESCOPO)}
          />
        </Field>

        <Field nome="responsavel" rotulo="Responsável" escopo={ESCOPO}>
          {/* Continua `<select>`: a equipe cabe na tela, e o nativo é melhor no celular. */}
          <Select
            id={idDoCampo('responsavel', ESCOPO)}
            name="responsavel"
            defaultValue={inicial?.responsavelId ?? ''}
          >
            <option value="">{inicial === undefined ? 'Você' : 'Ninguém'}</option>
            {membros.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </Select>
        </Field>

        <Field nome="notas" rotulo="Notas" escopo={ESCOPO} erro={e.notas} className="sm:col-span-2">
          <Textarea
            id={idDoCampo('notas', ESCOPO)}
            name="notas"
            maxLength={5000}
            defaultValue={inicial?.notas ?? ''}
            aria-invalid={e.notas !== undefined}
            aria-describedby={describedBy('notas', e.notas, undefined, ESCOPO)}
          />
        </Field>
      </div>
    </div>
  );
}

/**
 * O vínculo com a empresa: busca com lista, no lugar de um `<select>` de 500.
 *
 * Numa lista nativa sem busca, escolher entre centenas é rolagem, não escolha.
 * O filtro roda em memória sobre o que o servidor já mandou — não há consulta
 * nova, e por isso o painel diz quantas ficaram de fora em vez de fingir que
 * mostrou tudo.
 */
function CampoDeConta({
  rotulo,
  contas,
  inicial,
  limparApos,
  descritoPor,
}: {
  rotulo: string;
  contas: readonly Opcao[];
  inicial: Opcao | null;
  limparApos?: ContatoFormState;
  descritoPor?: string;
}) {
  const [escolhida, setEscolhida] = useState<OpcaoDoCombobox | null>(
    inicial === null ? null : { valor: inicial.id, rotulo: inicial.nome },
  );

  /*
   * Acompanha o resultado da ação durante a renderização — é o padrão do React
   * para seguir uma prop, e é o que o próprio `Combobox` faz por dentro. Um
   * efeito aqui custaria uma renderização a mais e uma piscada com a escolha
   * antiga; e o lint da casa, com razão, não aceita `setState` dentro de efeito.
   */
  const [ultimoResultado, setUltimoResultado] = useState(limparApos);
  if (limparApos !== undefined && ultimoResultado !== limparApos) {
    setUltimoResultado(limparApos);
    if (limparApos.salvo !== null) setEscolhida(null);
  }

  function buscar(texto: string): readonly OpcaoDoCombobox[] {
    const alvo = texto.trim().toLocaleLowerCase('pt-BR');
    const achadas =
      alvo === '' ? contas : contas.filter((c) => c.nome.toLocaleLowerCase('pt-BR').includes(alvo));

    const visiveis: OpcaoDoCombobox[] = achadas
      .slice(0, OPCOES_VISIVEIS)
      .map((c) => ({ valor: c.id, rotulo: c.nome }));

    if (achadas.length > OPCOES_VISIVEIS) {
      /* Opção desabilitada: aparece e é anunciada, mas não é escolhível — é aviso, não dado. */
      visiveis.push({
        valor: '__restantes',
        rotulo: `…e mais ${achadas.length - OPCOES_VISIVEIS}. Escreva mais para estreitar.`,
        desabilitado: true,
      });
    }
    return visiveis;
  }

  return (
    <Combobox
      id={idDoCampo('conta', ESCOPO)}
      nome="conta"
      rotulo={rotulo}
      placeholder={`Procurar ${rotulo.toLocaleLowerCase('pt-BR')}`}
      valor={escolhida}
      aoEscolher={setEscolhida}
      buscar={buscar}
      inicialRotulo="Escreva para filtrar, ou escolha na lista."
      vazioRotulo="Nenhuma com esse nome nesta lista."
      aria-describedby={descritoPor}
    />
  );
}
