'use client';

import { Plus } from 'lucide-react';
import { useActionState } from 'react';

import { Field, describedBy } from '@/components/form/field';
import { FormError, FormSuccess } from '@/components/form/messages';
import { Submit } from '@/components/form/submit';
import { Badge } from '@/components/ui/badge';
import { Input, Select } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { TIPOS_DE_FORMA } from '@/lib/erp/payment-method-input';
import { dias } from '@/lib/format';

import { criarForma, salvarForma } from './actions';
import { FORMA_INICIAL, type FormaNaTela, type FormaState } from './state';

function rotuloDoTipo(codigo: string | null): string {
  return TIPOS_DE_FORMA.find((t) => t.codigo === codigo)?.rotulo ?? 'Outro';
}

function prazoEmTexto(prazo: number): string {
  return prazo === 0 ? 'na hora' : `em ${dias(prazo)}`;
}

function Campos({
  prefixo,
  estado,
  inicial,
}: {
  prefixo: string;
  estado: FormaState;
  inicial?: FormaNaTela;
}) {
  const e = estado.campos;
  const id = (campo: string) => `${prefixo}-${campo}`;
  // A explicação do prazo vai uma vez, no cadastro; nas linhas, ela só repetiria.
  const comDica = inicial === undefined;
  const dicaPrazo =
    'Zero é na hora: a venda já entra no caixa. Mais que zero vira conta a receber.';
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_12rem_8rem]">
      <Field nome={id('nome')} rotulo="Nome" obrigatorio erro={e.nome}>
        <Input
          id={id('nome')}
          name="nome"
          required
          maxLength={60}
          defaultValue={inicial?.nome}
          placeholder="Crédito na maquininha"
          aria-invalid={e.nome !== undefined}
          aria-describedby={describedBy(id('nome'), e.nome)}
        />
      </Field>
      <Field nome={id('codigo')} rotulo="Tipo" obrigatorio erro={e.codigo}>
        <Select id={id('codigo')} name="codigo" defaultValue={inicial?.codigo ?? 'other'}>
          {TIPOS_DE_FORMA.map((t) => (
            <option key={t.codigo} value={t.codigo}>
              {t.rotulo}
            </option>
          ))}
        </Select>
      </Field>
      <Field nome={id('prazo')} rotulo="Prazo (dias)" obrigatorio erro={e.prazo}>
        <Input
          id={id('prazo')}
          name="prazo"
          inputMode="numeric"
          defaultValue={String(inicial?.prazoEmDias ?? 0)}
          className="tabular-nums"
          aria-invalid={e.prazo !== undefined}
          aria-describedby={describedBy(id('prazo'), e.prazo, comDica ? dicaPrazo : undefined)}
        />
      </Field>
      {comDica && (
        <p id={`${id('prazo')}-dica`} className="text-xs text-content-subtle sm:col-span-3">
          {dicaPrazo}
        </p>
      )}
    </div>
  );
}

function Linha({ forma }: { forma: FormaNaTela }) {
  const [estado, acao] = useActionState(salvarForma, FORMA_INICIAL);
  const prefixo = `forma-${forma.id}`;
  return (
    <li className="py-4">
      <form action={acao} className="flex flex-col gap-3">
        <input type="hidden" name="id" value={forma.id} />
        <Campos prefixo={prefixo} estado={estado} inicial={forma} />
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-content-default">
            <Switch name="ativa" defaultChecked={forma.ativa} />
            No balcão
          </label>
          <span className="text-xs text-content-subtle">
            {forma.usos === 0
              ? 'Nenhum uso ainda'
              : `Usada em ${forma.usos.toLocaleString('pt-BR')} ${forma.usos === 1 ? 'pagamento' : 'pagamentos'} — desligue em vez de apagar`}
          </span>
          <Submit variant="outline" size="sm" className="ml-auto">
            Salvar
          </Submit>
        </div>
        {estado.erro !== null && <FormError>{estado.erro}</FormError>}
        {estado.ok !== null && <FormSuccess>{estado.ok}</FormSuccess>}
      </form>
    </li>
  );
}

/**
 * As formas de pagamento: o que aparece no balcão, e quando o dinheiro chega.
 *
 * Quem não administra vê a lista — o caixa precisa saber que crédito cai em
 * 30 dias —, e não edita.
 */
export function PaymentMethods({
  formas,
  podeEditar,
}: {
  formas: readonly FormaNaTela[];
  podeEditar: boolean;
}) {
  const [estado, criar] = useActionState(criarForma, FORMA_INICIAL);

  if (!podeEditar) {
    return formas.length === 0 ? (
      <p className="text-sm text-content-muted">
        Nenhuma forma cadastrada. Quem administra a empresa cadastra aqui.
      </p>
    ) : (
      <ul className="flex flex-col divide-y divide-line-subtle">
        {formas.map((f) => (
          <li key={f.id} className="flex items-center justify-between gap-3 py-3 text-sm">
            <span className="min-w-0">
              <span className="block truncate text-content">{f.nome}</span>
              <span className="text-xs text-content-muted">
                {rotuloDoTipo(f.codigo)} · entra no caixa {prazoEmTexto(f.prazoEmDias)}
              </span>
            </span>
            {!f.ativa && <Badge>Fora do balcão</Badge>}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {formas.length === 0 ? (
        <p className="text-sm text-content-muted">
          Nenhuma forma cadastrada ainda — sem ela, o balcão só registra venda de valor zero.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-line-subtle">
          {formas.map((f) => (
            <Linha key={f.id} forma={f} />
          ))}
        </ul>
      )}
      <form action={criar} className="flex flex-col gap-3 border-t border-line-subtle pt-4">
        <h2 className="text-sm font-medium text-content-default">Nova forma</h2>
        <Campos key={estado.rodada} prefixo="nova" estado={estado} />
        <div className="flex flex-wrap items-center gap-3">
          <Submit variant="outline">
            <Plus aria-hidden />
            Adicionar
          </Submit>
          {estado.erro !== null && <FormError>{estado.erro}</FormError>}
          {estado.ok !== null && <FormSuccess>{estado.ok}</FormSuccess>}
        </div>
      </form>
    </div>
  );
}
