'use client';

import {
  Ban,
  Check,
  ChevronDown,
  Copy,
  KeyRound,
  Link2,
  ShieldCheck,
  Trash2,
  UserPlus,
  UserRoundCheck,
  X,
} from 'lucide-react';
import { useActionState, useCallback, useEffect, useRef, useState } from 'react';

import { Field, describedBy, idDoCampo } from '@/components/form/field';
import { FormError, FormFeedback, FormWarning } from '@/components/form/messages';
import { Submit } from '@/components/form/submit';
import { Button, buttonVariants } from '@/components/ui/button';
import { AlertDialog, Dialog } from '@/components/ui/dialog';
import { DropdownItem, DropdownMenu, DropdownSeparator } from '@/components/ui/dropdown-menu';
import { Input, Label, Select } from '@/components/ui/input';

import {
  convidarPessoa,
  gerarLinkDeNovo,
  mudarPapel,
  mudarSituacao,
  removerPessoa,
} from './actions';
import { LinhaDaPessoa, colunasDaTabela } from './member-row';
import { EQUIPE_INICIAL, type EquipeState, type MembroNaTela, type Papel } from './state';

/** Erro vazio é o código que `actions.ts` usa para "o que falhou está nos campos". */
function mensagemDeErro(estado: EquipeState): string | null {
  return estado.erro !== null && estado.erro !== '' ? estado.erro : null;
}

/**
 * O link de acesso, uma vez, com o aviso do que ele é.
 *
 * Não é guardado em lugar nenhum: fechar a caixa é perdê-lo, e gerar outro
 * invalida este. É o mesmo cuidado do Super Admin.
 */
function LinkDeAcesso({ link }: { link: string }) {
  const [copiado, setCopiado] = useState(false);

  return (
    <div
      role="status"
      className="flex flex-col gap-2 rounded-card border border-warning/40 bg-warning-soft p-3"
    >
      <p className="flex items-start gap-2 text-body text-content">
        <KeyRound className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
        <span>
          <strong className="font-medium">Este link é credencial.</strong> Quem abrir entra como
          essa pessoa. Vale uma vez e vence — mande só para ela.
        </span>
      </p>
      <div className="flex gap-2">
        <Label htmlFor="link-acesso" className="sr-only">
          Link de acesso
        </Label>
        <Input
          id="link-acesso"
          readOnly
          value={link}
          className="font-mono text-caption"
          onFocus={(e) => e.currentTarget.select()}
        />
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            await navigator.clipboard.writeText(link);
            setCopiado(true);
          }}
        >
          {copiado ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copiado ? 'Copiado' : 'Copiar'}
        </Button>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Convidar
 * ────────────────────────────────────────────────────────────────────────── */

const ESCOPO_DO_CONVITE = 'convite';
const DICA_DO_NOME = 'Obrigatório para conta nova.';
/* Honestidade: o catálogo de permissões existe no banco; a tela que o mostra,
 * não. Dizer isso é melhor que deixar escolher entre "Gestor" e "Colaborador"
 * às cegas — e é o achado de `equipe/page.tsx:79` da auditoria. */
const DICA_DO_PAPEL = 'O que cada papel concede ainda não aparece nesta tela.';

function DialogoDeConvite({
  aberto,
  aoFechar,
  papeis,
}: {
  aberto: boolean;
  aoFechar: () => void;
  papeis: readonly Papel[];
}) {
  /* `useActionState` só aqui: é a única ação com erro por campo, que é o que
   * ele resolve bem. As ações de linha sabem o desfecho na hora — ver abaixo. */
  const [estado, acao] = useActionState(convidarPessoa, EQUIPE_INICIAL);
  const formulario = useRef<HTMLFormElement>(null);
  const e = estado.campos;
  const padrao = papeis.find((p) => p.nome === 'Colaborador')?.id ?? papeis[0]?.id;

  useEffect(() => {
    /* Convite criado: o formulário volta ao branco para o próximo, mas o
     * diálogo fica aberto — o link de acesso só existe enquanto ele estiver. */
    if (estado.ok !== null) formulario.current?.reset();
  }, [estado.ok]);

  return (
    <Dialog
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Convidar pessoa"
      descricao="Quem entra assume o papel que você escolher. Dá para trocar o papel, suspender ou remover o acesso depois, na própria lista."
    >
      <form ref={formulario} action={acao} className="flex flex-col gap-4">
        <FormWarning>
          O convite não sai por e-mail ainda. Para conta nova, o link de acesso aparece aqui e você
          o repassa pelo canal que já usa com a pessoa.
        </FormWarning>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            nome="email"
            escopo={ESCOPO_DO_CONVITE}
            rotulo="E-mail"
            obrigatorio
            erro={e.email}
            className="sm:col-span-2"
          >
            <Input
              id={idDoCampo('email', ESCOPO_DO_CONVITE)}
              name="email"
              type="email"
              required
              autoComplete="off"
              placeholder="pessoa@empresa.com.br"
              aria-invalid={e.email !== undefined}
              aria-describedby={describedBy('email', e.email, undefined, ESCOPO_DO_CONVITE)}
            />
          </Field>

          <Field
            nome="nome"
            escopo={ESCOPO_DO_CONVITE}
            rotulo="Nome"
            erro={e.nome}
            dica={DICA_DO_NOME}
          >
            <Input
              id={idDoCampo('nome', ESCOPO_DO_CONVITE)}
              name="nome"
              autoComplete="off"
              maxLength={120}
              aria-invalid={e.nome !== undefined}
              aria-describedby={describedBy('nome', e.nome, DICA_DO_NOME, ESCOPO_DO_CONVITE)}
            />
          </Field>

          <Field
            nome="papel"
            escopo={ESCOPO_DO_CONVITE}
            rotulo="Papel"
            obrigatorio
            erro={e.papel}
            dica={DICA_DO_PAPEL}
          >
            <Select
              id={idDoCampo('papel', ESCOPO_DO_CONVITE)}
              name="papel"
              required
              defaultValue={padrao}
              aria-invalid={e.papel !== undefined}
              aria-describedby={describedBy('papel', e.papel, DICA_DO_PAPEL, ESCOPO_DO_CONVITE)}
            >
              {papeis.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <FormFeedback estado={estado} />
        {estado.link !== null && <LinkDeAcesso link={estado.link} />}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={aoFechar}>
            Fechar
          </Button>
          <Submit pendente="Convidando…">
            <UserPlus aria-hidden />
            Convidar
          </Submit>
        </div>
      </form>
    </Dialog>
  );
}

/**
 * A porta de entrada da equipe: o único botão da marca desta tela.
 *
 * O diálogo só é montado depois do primeiro clique — e, uma vez montado, fica
 * (fechado). Desmontá-lo ao fechar arrancaria do DOM o `<dialog>` que devolve
 * o foco ao botão, e o foco cairia no `<body>`.
 */
export function InviteForm({ papeis }: { papeis: readonly Papel[] }) {
  const [jaAbriu, setJaAbriu] = useState(false);
  const [aberto, setAberto] = useState(false);
  const fechar = useCallback(() => setAberto(false), []);

  return (
    <>
      <Button
        onClick={() => {
          setJaAbriu(true);
          setAberto(true);
        }}
      >
        <UserPlus aria-hidden />
        Convidar pessoa
      </Button>
      {jaAbriu && <DialogoDeConvite aberto={aberto} aoFechar={fechar} papeis={papeis} />}
    </>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Ações de uma pessoa
 * ────────────────────────────────────────────────────────────────────────── */

function DialogoDePapel({
  aberto,
  aoFechar,
  membro,
  papeis,
}: {
  aberto: boolean;
  aoFechar: () => void;
  membro: MembroNaTela;
  papeis: readonly Papel[];
}) {
  const [erro, setErro] = useState<string | null>(null);
  const id = `papel-${membro.vinculoId}`;

  /*
   * Ação direta, não `useActionState`: fechar no acerto e ficar aberto no erro
   * exige saber o desfecho onde ele chega. Com o hook isso só se descobre num
   * efeito que observa o estado — um passo a mais para dizer o que o `await`
   * já disse. O `useFormStatus` do `<Submit>` continua valendo, porque quem o
   * alimenta é o `<form action>`, não o hook.
   */
  async function enviar(dados: FormData) {
    const resultado = await mudarPapel(EQUIPE_INICIAL, dados);
    const mensagem = mensagemDeErro(resultado);
    setErro(mensagem);
    if (mensagem === null) aoFechar();
  }

  return (
    <Dialog
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Mudar papel"
      descricao={`O papel decide o que ${membro.nome} enxerga e pode fazer nesta empresa.`}
      tamanho="sm"
    >
      <form action={enviar} className="flex flex-col gap-3">
        <input type="hidden" name="vinculo" value={membro.vinculoId} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id}>Papel</Label>
          <Select id={id} name="papel" defaultValue={membro.papelId}>
            {papeis.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </Select>
          <p className="text-caption text-content-subtle">
            {DICA_DO_PAPEL} O banco recusa dar um papel com mais poder que o seu, e recusa deixar a
            empresa sem administrador.
          </p>
        </div>

        {erro !== null && <FormError>{erro}</FormError>}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={aoFechar}>
            Cancelar
          </Button>
          <Submit pendente="Salvando…">Salvar papel</Submit>
        </div>
      </form>
    </Dialog>
  );
}

function DialogoDeLink({
  aberto,
  aoFechar,
  membro,
}: {
  aberto: boolean;
  aoFechar: () => void;
  membro: MembroNaTela;
}) {
  const [resultado, setResultado] = useState<EquipeState | null>(null);

  async function enviar(dados: FormData) {
    setResultado(await gerarLinkDeNovo(EQUIPE_INICIAL, dados));
  }

  return (
    <Dialog
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Gerar link de acesso"
      descricao={`${membro.nome} foi convidada e ainda não entrou. Como o envio por e-mail não existe, o link é o caminho.`}
    >
      <form action={enviar} className="flex flex-col gap-3">
        <input type="hidden" name="vinculo" value={membro.vinculoId} />
        <p className="max-w-prose text-body text-content-muted">
          Gerar um link novo invalida o anterior. Ele vale uma vez, vence, e não fica guardado em
          lugar nenhum — fechar esta caixa é perdê-lo.
        </p>

        {resultado !== null && <FormFeedback estado={resultado} />}
        {resultado?.link != null && <LinkDeAcesso link={resultado.link} />}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={aoFechar}>
            Fechar
          </Button>
          <Submit pendente="Gerando…">
            <Link2 aria-hidden />
            Gerar link
          </Submit>
        </div>
      </form>
    </Dialog>
  );
}

export interface MemberRowProps {
  membro: MembroNaTela;
  papeis: readonly Papel[];
  animar?: boolean;
  indice: number;
}

type AcaoDaLinha = 'papel' | 'link' | 'situacao' | 'remover';

/**
 * Uma pessoa da equipe e o que se pode fazer com ela.
 *
 * Três decisões que a tela anterior não tomava:
 *
 * 1. As ações moram num menu por linha, e o gatilho diz "Gerenciar" em vez de
 *    ser três pontinhos mudos. A queixa do dono foi não reconhecer a tela como
 *    gestão de equipe; um alvo sem rótulo não a corrige.
 * 2. Nada monta antes da hora. Antes eram quatro `useActionState` e um
 *    `<select>` por linha — 200 estados de ação numa empresa de 50 pessoas.
 *    Agora existe, no máximo, o diálogo da ação escolhida, depois do clique.
 * 3. Tirar a si mesmo da empresa continua impossível pela tela: é o engano que
 *    ninguém queria cometer, e quem precisa sair pede a outra pessoa
 *    administradora. O item fica no menu, desabilitado, dizendo isso — item
 *    que some é regra que ninguém descobre.
 */
export function MemberRow({ membro, papeis, animar = false, indice }: MemberRowProps) {
  /*
   * `acao` é o que está MONTADO; `aberto`, o que está à vista. Separar os dois
   * é o que permite fechar pelo `<dialog>` nativo, que é quem devolve o foco
   * ao gatilho — desmontar na hora deixaria o foco no `<body>`.
   */
  const [acao, setAcao] = useState<AcaoDaLinha | null>(null);
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const fechar = useCallback(() => setAberto(false), []);
  const aoFalhar = useCallback((estado: EquipeState) => setErro(mensagemDeErro(estado)), []);

  function abrir(qual: AcaoDaLinha) {
    setErro(null);
    setAcao(qual);
    setAberto(true);
  }

  const convitePendente = membro.status === 'invited';
  const suspender = membro.status !== 'suspended';

  const acoes = (
    <>
      <DropdownMenu
        rotulo={`Ações de ${membro.nome}`}
        alinhamento="fim"
        classNameGatilho={buttonVariants({ variant: 'outline', size: 'sm' })}
        gatilho={
          <>
            Gerenciar
            <ChevronDown aria-hidden />
          </>
        }
      >
        <DropdownItem Icone={ShieldCheck} onSelect={() => abrir('papel')}>
          Mudar papel
        </DropdownItem>

        {convitePendente && !membro.voce && (
          <DropdownItem Icone={Link2} onSelect={() => abrir('link')}>
            Gerar link de acesso
          </DropdownItem>
        )}

        {!convitePendente && !membro.voce && (
          <DropdownItem Icone={suspender ? Ban : UserRoundCheck} onSelect={() => abrir('situacao')}>
            {suspender ? 'Suspender acesso' : 'Reativar acesso'}
          </DropdownItem>
        )}

        <DropdownSeparator />

        {membro.voce ? (
          <DropdownItem desabilitado Icone={Trash2}>
            Só outra pessoa remove o seu acesso
          </DropdownItem>
        ) : (
          <DropdownItem destrutivo Icone={Trash2} onSelect={() => abrir('remover')}>
            {convitePendente ? 'Cancelar convite' : 'Remover da equipe'}
          </DropdownItem>
        )}
      </DropdownMenu>

      {/*
       * Irmãos do menu, não filhos: o painel do menu vive num portal que some
       * ao escolher o item, e um diálogo montado lá dentro sumiria junto.
       * `showModal()` põe o `<dialog>` na camada superior do navegador, então
       * morar dentro de um `<td>` não o recorta nem o esconde.
       */}
      {acao === 'papel' && (
        <DialogoDePapel aberto={aberto} aoFechar={fechar} membro={membro} papeis={papeis} />
      )}

      {acao === 'link' && <DialogoDeLink aberto={aberto} aoFechar={fechar} membro={membro} />}

      {acao === 'situacao' && (
        <AlertDialog
          aberto={aberto}
          aoFechar={fechar}
          severidade="warning"
          titulo={
            suspender
              ? `Suspender o acesso de ${membro.nome}?`
              : `Reativar o acesso de ${membro.nome}?`
          }
          descricao={
            suspender
              ? 'A pessoa para de entrar nesta empresa na hora. O vínculo e o histórico ficam, e reativar devolve tudo.'
              : 'A pessoa volta a entrar nesta empresa, com o mesmo papel que tinha.'
          }
          confirmarRotulo={suspender ? 'Suspender acesso' : 'Reativar acesso'}
          confirmarAction={async (dados) => aoFalhar(await mudarSituacao(EQUIPE_INICIAL, dados))}
        >
          <input type="hidden" name="vinculo" value={membro.vinculoId} />
          <input type="hidden" name="para" value={suspender ? 'suspended' : 'active'} />
        </AlertDialog>
      )}

      {acao === 'remover' && (
        <AlertDialog
          aberto={aberto}
          aoFechar={fechar}
          severidade="danger"
          titulo={
            convitePendente
              ? `Cancelar o convite de ${membro.nome}?`
              : `Tirar ${membro.nome} da equipe?`
          }
          descricao={
            convitePendente
              ? 'O convite deixa de valer, e qualquer link já gerado para ele para de funcionar.'
              : 'O acesso desta pessoa a esta empresa acaba agora.'
          }
          confirmarRotulo={convitePendente ? 'Cancelar convite' : 'Remover da equipe'}
          cancelarRotulo="Voltar"
          confirmarAction={async (dados) => aoFalhar(await removerPessoa(EQUIPE_INICIAL, dados))}
        >
          <input type="hidden" name="vinculo" value={membro.vinculoId} />
          {!convitePendente && (
            <ul className="flex list-disc flex-col gap-1 pl-4 text-caption text-content-muted">
              <li>A conta continua existindo — se ela participa de outra empresa, entra lá.</li>
              <li>O que ela cadastrou aqui fica, sem responsável.</li>
              <li>Para devolver o acesso, é preciso convidar de novo.</li>
            </ul>
          )}
        </AlertDialog>
      )}
    </>
  );

  return (
    <>
      <LinhaDaPessoa membro={membro} acoes={acoes} animar={animar} indice={indice} />
      {erro !== null && (
        /*
         * A falha de uma ação de linha aparece na linha, e fica até ser
         * dispensada: o que ninguém leu, ninguém corrigiu. O acerto não ganha
         * faixa nenhuma — a tabela já mudou, e é isso que ele tinha a dizer.
         */
        <tr>
          <td colSpan={colunasDaTabela(true)} className="px-4 pb-3">
            <div className="flex items-start gap-2">
              <FormError className="min-w-0 flex-1">{erro}</FormError>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Dispensar aviso"
                onClick={() => setErro(null)}
              >
                <X aria-hidden />
              </Button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
