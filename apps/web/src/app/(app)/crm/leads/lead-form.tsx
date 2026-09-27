'use client';

import { Plus } from 'lucide-react';
import { useActionState, useEffect, useRef, useState } from 'react';

import { describedBy, Field, idDoCampo, useEscopo } from '@/components/form/field';
import { FormError, FormSuccess } from '@/components/form/messages';
import { Submit } from '@/components/form/submit';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

import { criarLead } from './actions';
import { LEAD_INICIAL } from './state';

/**
 * Cadastro rápido de lead.
 *
 * Só o nome é obrigatório, e isso é decisão de produto, não descuido. Um lead
 * é justamente o contato de quem ainda não se sabe quase nada — exigir e-mail
 * e telefone faria a pessoa inventar valores para conseguir salvar.
 *
 * O diálogo **não fecha ao salvar**: quem cadastra um lead normalmente cadastra
 * três seguidos, anotando quem acabou de ligar. Salvar limpa os campos, devolve
 * o foco ao primeiro e deixa a confirmação à vista.
 *
 * Os três primitivos que este arquivo reimplementava — `Field`, `Submit` e a
 * faixa de erro — voltaram a ser importados (achado `lead-form.tsx:146`). A
 * cópia local do erro usava `bg-danger/10`, que no tema escuro é salmão e não
 * é a cor de erro do resto do sistema.
 */
export function LeadForm({ singular }: { singular: string }) {
  const [estado, acao] = useActionState(criarLead, LEAD_INICIAL);
  const [aberto, setAberto] = useState(false);
  const formulario = useRef<HTMLFormElement>(null);
  const primeiro = useRef<HTMLInputElement>(null);
  const escopo = useEscopo();

  /*
   * Depois de salvar: limpa e devolve o foco ao primeiro campo. Quem cadastra
   * um lead normalmente cadastra três — e ter que clicar no campo de novo a
   * cada um é o tipo de atrito que só quem usa o dia inteiro sente.
   */
  useEffect(() => {
    if (estado.criado === null) return;
    formulario.current?.reset();
    primeiro.current?.focus();
  }, [estado.criado]);

  return (
    <>
      {/* A única ação `brand` da tela (seção 7, extensão do Button). */}
      <Button type="button" onClick={() => setAberto(true)}>
        <Plus aria-hidden />
        Cadastrar {singular}
      </Button>

      <Dialog
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        titulo={`Cadastrar ${singular}`}
        descricao="Só o nome é obrigatório. O resto entra quando você souber."
        tamanho="lg"
      >
        <form ref={formulario} action={acao} className="flex flex-col gap-4">
          {estado.erro !== null && <FormError>{estado.erro}</FormError>}
          {estado.criado !== null && (
            <FormSuccess>{estado.criado} entrou na lista. Pode cadastrar o próximo.</FormSuccess>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field nome="name" rotulo="Nome" obrigatorio erro={estado.campos.name} escopo={escopo}>
              <Input
                ref={primeiro}
                id={idDoCampo('name', escopo)}
                name="name"
                required
                placeholder="Maria Souza"
                aria-invalid={estado.campos.name !== undefined}
                aria-describedby={describedBy('name', estado.campos.name, undefined, escopo)}
              />
            </Field>

            <Field
              nome="company_name"
              rotulo="Empresa"
              dica="Texto livre — ainda não vira cadastro de conta."
              escopo={escopo}
            >
              <Input
                id={idDoCampo('company_name', escopo)}
                name="company_name"
                placeholder="Padaria do Bairro"
                aria-describedby={describedBy('company_name', undefined, 'dica', escopo)}
              />
            </Field>

            <Field nome="email" rotulo="E-mail" erro={estado.campos.email} escopo={escopo}>
              <Input
                id={idDoCampo('email', escopo)}
                name="email"
                type="email"
                placeholder="maria@exemplo.com.br"
                aria-invalid={estado.campos.email !== undefined}
                aria-describedby={describedBy('email', estado.campos.email, undefined, escopo)}
              />
            </Field>

            <Field nome="phone" rotulo="Telefone" erro={estado.campos.phone} escopo={escopo}>
              <Input
                id={idDoCampo('phone', escopo)}
                name="phone"
                type="tel"
                placeholder="(11) 90000-0000"
                aria-invalid={estado.campos.phone !== undefined}
                aria-describedby={describedBy('phone', estado.campos.phone, undefined, escopo)}
              />
            </Field>

            <Field
              nome="source"
              rotulo="Origem"
              dica="De onde veio: indicação, Instagram, feira."
              escopo={escopo}
            >
              <Input
                id={idDoCampo('source', escopo)}
                name="source"
                placeholder="Indicação"
                aria-describedby={describedBy('source', undefined, 'dica', escopo)}
              />
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Submit>Cadastrar</Submit>
            <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
              Fechar
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
