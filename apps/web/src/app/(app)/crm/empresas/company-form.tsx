'use client';

import { Pencil, Plus } from 'lucide-react';
import { useActionState, useEffect, useRef, useState } from 'react';

import { Field, describedBy, idDoCampo } from '@/components/form/field';
import { FormError, FormSuccess } from '@/components/form/messages';
import { Submit } from '@/components/form/submit';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input, Select, Textarea } from '@/components/ui/input';

import { criarConta, editarConta } from './actions';
import { CONTA_INICIAL, ESCOPO_DA_CONTA, type ContaFormState, type Opcao } from './state';

export interface ValoresDaConta {
  id: string;
  nome: string;
  razaoSocial: string | null;
  /** Já formatado para leitura. */
  documento: string | null;
  email: string | null;
  telefone: string | null;
  site: string | null;
  responsavelId: string | null;
  notas: string | null;
}

interface Props {
  singular: string;
  membros: readonly Opcao[];
}

/*
 * Os dois cadastros de conta vivem em diálogo, e não abertos na página.
 *
 * Na lista, o formulário embutido empurrava a tabela para baixo da dobra toda
 * vez que alguém clicava em "Cadastrar". No detalhe era pior: o cartão de
 * edição ficava permanentemente aberto e ocupava boa parte da altura da tela,
 * de modo que as notas — o único texto do registro — só existiam como valor de
 * um `<textarea>`, e a página não tinha versão de leitura.
 *
 * O `<dialog>` nativo por trás do primitivo traz foco preso, Escape e inércia
 * do fundo; nada disso precisa ser escrito aqui.
 */

/** O cadastro de uma conta nova. Só o nome é obrigatório. */
export function NewCompanyDialog({ singular, membros }: Props) {
  const [aberto, setAberto] = useState(false);
  const [estado, acao] = useActionState(criarConta, CONTA_INICIAL);
  const formulario = useRef<HTMLFormElement>(null);
  const primeiro = useRef<HTMLInputElement>(null);

  /*
   * Salvou: limpa e devolve o cursor ao primeiro campo, porque quem cadastra
   * uma conta costuma cadastrar três. O diálogo fica aberto de propósito — a
   * confirmação está dentro dele, e fechar sozinho esconderia o aviso.
   */
  useEffect(() => {
    if (estado.salvo === null) return;
    formulario.current?.reset();
    primeiro.current?.focus();
  }, [estado.salvo]);

  return (
    <>
      <Button onClick={() => setAberto(true)}>
        <Plus aria-hidden />
        Cadastrar {singular}
      </Button>

      <Dialog
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        titulo={`Cadastrar ${singular}`}
        descricao="Só o nome é obrigatório. O resto pode entrar depois, pela tela do cadastro."
        tamanho="lg"
      >
        <form ref={formulario} action={acao} className="flex flex-col">
          <Campos membros={membros} singular={singular} estado={estado} primeiro={primeiro} />
          <Rodape
            aoCancelar={() => setAberto(false)}
            enviar="Cadastrar"
            retorno={
              estado.salvo === null ? null : (
                <FormSuccess>{`${estado.salvo} entrou na lista.`}</FormSuccess>
              )
            }
          />
        </form>
      </Dialog>
    </>
  );
}

/** A edição de uma conta existente, a partir da tela dela. */
export function EditCompanyDialog({
  singular,
  membros,
  inicial,
}: Props & { inicial: ValoresDaConta }) {
  const [aberto, setAberto] = useState(false);
  const [estado, acao] = useActionState(editarConta, CONTA_INICIAL);

  return (
    <>
      <Button variant="outline" onClick={() => setAberto(true)}>
        <Pencil aria-hidden />
        Editar cadastro
      </Button>

      <Dialog
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        titulo={`Editar ${singular}`}
        descricao={inicial.nome}
        tamanho="lg"
      >
        <form action={acao} className="flex flex-col">
          <input type="hidden" name="id" value={inicial.id} />
          <Campos membros={membros} singular={singular} estado={estado} inicial={inicial} />
          <Rodape
            aoCancelar={() => setAberto(false)}
            enviar="Salvar alterações"
            retorno={estado.salvo === null ? null : <FormSuccess>Alterações salvas.</FormSuccess>}
          />
        </form>
      </Dialog>
    </>
  );
}

/**
 * A faixa de ação, grudada no pé do corpo que rola.
 *
 * As margens negativas desfazem o `p-4` do corpo do diálogo para a faixa
 * encostar nas bordas. Ela não usa o `rodape` do primitivo porque o `<Submit>`
 * precisa estar DENTRO do `<form>` — `useFormStatus` só enxerga o formulário
 * acima dele, e é essa trava que impede o clique duplo virar dois cadastros.
 */
function Rodape({
  aoCancelar,
  enviar,
  retorno,
}: {
  aoCancelar: () => void;
  enviar: string;
  retorno: React.ReactNode;
}) {
  return (
    <div className="sticky bottom-0 -mx-4 -mb-4 mt-4 flex flex-wrap items-center gap-2 border-t border-line-subtle bg-surface-elevated px-4 py-3">
      <Submit>{enviar}</Submit>
      <Button type="button" variant="ghost" onClick={aoCancelar}>
        Fechar
      </Button>
      {retorno}
    </div>
  );
}

function Campos({
  membros,
  estado,
  inicial,
  primeiro,
}: Props & {
  estado: ContaFormState;
  inicial?: ValoresDaConta;
  primeiro?: React.RefObject<HTMLInputElement | null>;
}) {
  const e = estado.campos;
  const dicaDocumento = 'CNPJ — inclusive o novo, com letras — ou CPF.';
  /* Um lugar só para o prefixo: ver `ESCOPO_DA_CONTA` e os ids duplicados que ele resolve. */
  const id = (nome: string) => idDoCampo(nome, ESCOPO_DA_CONTA);

  return (
    <div className="flex flex-col gap-3">
      {estado.erro !== null && <FormError>{estado.erro}</FormError>}

      {/*
       * Consulta de contêiner, não de viewport: este mesmo formulário aparece
       * num diálogo largo e pode vir a aparecer numa coluna estreita. `sm:`
       * mediria a janela e abriria duas colunas de 140px dentro dela.
       */}
      <div className="@container">
        <div className="grid gap-3 @md:grid-cols-2">
          <Field
            nome="nome"
            escopo={ESCOPO_DA_CONTA}
            rotulo="Nome"
            obrigatorio
            erro={e.nome}
            dica="Como a equipe chama."
          >
            <Input
              ref={primeiro}
              id={id('nome')}
              name="nome"
              required
              maxLength={160}
              autoComplete="off"
              defaultValue={inicial?.nome}
              placeholder="Padaria do Bairro"
              aria-invalid={e.nome !== undefined}
              aria-describedby={describedBy(
                'nome',
                e.nome,
                'Como a equipe chama.',
                ESCOPO_DA_CONTA,
              )}
            />
          </Field>

          <Field
            nome="razaoSocial"
            escopo={ESCOPO_DA_CONTA}
            rotulo="Razão social"
            erro={e.razaoSocial}
          >
            <Input
              id={id('razaoSocial')}
              name="razaoSocial"
              maxLength={200}
              autoComplete="off"
              defaultValue={inicial?.razaoSocial ?? ''}
              placeholder="Padaria do Bairro Ltda."
              aria-invalid={e.razaoSocial !== undefined}
              aria-describedby={describedBy(
                'razaoSocial',
                e.razaoSocial,
                undefined,
                ESCOPO_DA_CONTA,
              )}
            />
          </Field>

          <Field
            nome="documento"
            escopo={ESCOPO_DA_CONTA}
            rotulo="CNPJ ou CPF"
            erro={e.documento}
            dica={dicaDocumento}
          >
            <Input
              id={id('documento')}
              name="documento"
              maxLength={20}
              autoComplete="off"
              defaultValue={inicial?.documento ?? ''}
              placeholder="12.ABC.345/01DE-35"
              aria-invalid={e.documento !== undefined}
              aria-describedby={describedBy(
                'documento',
                e.documento,
                dicaDocumento,
                ESCOPO_DA_CONTA,
              )}
            />
          </Field>

          <Field nome="site" escopo={ESCOPO_DA_CONTA} rotulo="Site" erro={e.site}>
            <Input
              id={id('site')}
              name="site"
              inputMode="url"
              autoComplete="off"
              defaultValue={inicial?.site ?? ''}
              placeholder="padariadobairro.com.br"
              aria-invalid={e.site !== undefined}
              aria-describedby={describedBy('site', e.site, undefined, ESCOPO_DA_CONTA)}
            />
          </Field>

          <Field nome="email" escopo={ESCOPO_DA_CONTA} rotulo="E-mail" erro={e.email}>
            <Input
              id={id('email')}
              name="email"
              type="email"
              autoComplete="off"
              defaultValue={inicial?.email ?? ''}
              placeholder="contato@exemplo.com.br"
              aria-invalid={e.email !== undefined}
              aria-describedby={describedBy('email', e.email, undefined, ESCOPO_DA_CONTA)}
            />
          </Field>

          <Field nome="telefone" escopo={ESCOPO_DA_CONTA} rotulo="Telefone" erro={e.telefone}>
            <Input
              id={id('telefone')}
              name="telefone"
              type="tel"
              autoComplete="off"
              defaultValue={inicial?.telefone ?? ''}
              placeholder="(11) 3333-4444"
              aria-invalid={e.telefone !== undefined}
              aria-describedby={describedBy('telefone', e.telefone, undefined, ESCOPO_DA_CONTA)}
            />
          </Field>

          <Field nome="responsavel" escopo={ESCOPO_DA_CONTA} rotulo="Responsável">
            <Select
              id={id('responsavel')}
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

          <Field
            nome="notas"
            escopo={ESCOPO_DA_CONTA}
            rotulo="Notas"
            erro={e.notas}
            className="@md:col-span-2"
          >
            <Textarea
              id={id('notas')}
              name="notas"
              maxLength={5000}
              defaultValue={inicial?.notas ?? ''}
              placeholder="O que a equipe precisa saber antes de falar com esta conta."
              aria-invalid={e.notas !== undefined}
              aria-describedby={describedBy('notas', e.notas, undefined, ESCOPO_DA_CONTA)}
            />
          </Field>
        </div>
      </div>
    </div>
  );
}
