'use client';

import { CheckCircle2, Loader2, Plus, X } from 'lucide-react';
import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';

import { criarLead } from './actions';
import { LEAD_INICIAL } from './state';

/**
 * Cadastro rápido de lead.
 *
 * Fica recolhido por padrão e abre no lugar, sem trocar de página: quem usa
 * esta tela está anotando alguém que acabou de ligar, e perder a lista de
 * vista para cadastrar um nome é o que faz a pessoa anotar no papel.
 *
 * Só o nome é obrigatório, e isso é decisão de produto, não descuido. Um lead
 * é justamente o contato de quem ainda não se sabe quase nada — exigir e-mail
 * e telefone faria a pessoa inventar valores para conseguir salvar.
 */
function Enviar() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Salvando…
        </>
      ) : (
        'Cadastrar'
      )}
    </Button>
  );
}

export function LeadForm({ singular }: { singular: string }) {
  const [estado, acao] = useActionState(criarLead, LEAD_INICIAL);
  const [aberto, setAberto] = useState(false);
  const formulario = useRef<HTMLFormElement>(null);
  const primeiro = useRef<HTMLInputElement>(null);

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

  if (!aberto) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => setAberto(true)}>
          <Plus aria-hidden />
          Novo {singular}
        </Button>
        {estado.criado !== null && (
          <p role="status" className="flex items-center gap-1.5 text-sm text-success">
            <CheckCircle2 className="size-4" aria-hidden />
            {estado.criado} foi cadastrado.
          </p>
        )}
      </div>
    );
  }

  return (
    <form
      ref={formulario}
      action={acao}
      className="rounded-lg border border-line-subtle bg-surface-raised p-4"
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-medium text-content">Novo {singular}</h2>
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

      {estado.erro !== null && (
        <p role="alert" className="mb-4 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          {estado.erro}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          nome="name"
          rotulo="Nome"
          obrigatorio
          referencia={primeiro}
          erro={estado.campos.name}
          placeholder="Maria Souza"
        />
        <Campo
          nome="company_name"
          rotulo="Empresa"
          dica="Texto livre — ainda não vira cadastro de conta."
          placeholder="Padaria do Bairro"
        />
        <Campo
          nome="email"
          rotulo="E-mail"
          tipo="email"
          erro={estado.campos.email}
          placeholder="maria@exemplo.com.br"
        />
        <Campo
          nome="phone"
          rotulo="Telefone"
          tipo="tel"
          erro={estado.campos.phone}
          placeholder="(11) 90000-0000"
        />
        <Campo
          nome="source"
          rotulo="Origem"
          dica="De onde veio: indicação, Instagram, feira."
          placeholder="Indicação"
        />
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Enviar />
        <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function Campo({
  nome,
  rotulo,
  tipo = 'text',
  obrigatorio = false,
  dica,
  erro,
  placeholder,
  referencia,
}: {
  nome: string;
  rotulo: string;
  tipo?: string;
  obrigatorio?: boolean;
  dica?: string;
  erro?: string;
  placeholder?: string;
  referencia?: React.RefObject<HTMLInputElement | null>;
}) {
  const idDica = dica !== undefined ? `${nome}-dica` : undefined;
  const idErro = erro !== undefined ? `${nome}-erro` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={nome}>
        {rotulo}
        {!obrigatorio && <span className="ml-1 text-xs text-content-subtle">(opcional)</span>}
      </Label>
      <Input
        ref={referencia}
        id={nome}
        name={nome}
        type={tipo}
        required={obrigatorio}
        placeholder={placeholder}
        aria-invalid={erro !== undefined}
        aria-describedby={[idErro, idDica].filter(Boolean).join(' ') || undefined}
      />
      {erro !== undefined && (
        <p id={idErro} role="alert" className="text-xs text-danger">
          {erro}
        </p>
      )}
      {dica !== undefined && (
        <p id={idDica} className="text-xs text-content-subtle">
          {dica}
        </p>
      )}
    </div>
  );
}
