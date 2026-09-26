'use client';

import { CreditCard, Plus } from 'lucide-react';
import { useActionState } from 'react';

import { Field, describedBy } from '@/components/form/field';
import { FormFeedback } from '@/components/form/messages';
import { Submit } from '@/components/form/submit';
import { EmptyState } from '@/components/page/empty-state';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
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

/*
 * A linha de campos de uma forma.
 *
 * `md` e não `sm`: a 640px o nome cairia abaixo de 180px e "Crédito na
 * maquininha" ficaria com meia palavra visível. A partir daí a forma inteira
 * cabe numa linha, que é o que faz esta tela ser densa sem ser apertada.
 */
const GRADE_DOS_CAMPOS = 'grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_7rem]';

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
    <div className={GRADE_DOS_CAMPOS}>
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
          className="text-right tabular-nums"
          aria-invalid={e.prazo !== undefined}
          aria-describedby={describedBy(id('prazo'), e.prazo, comDica ? dicaPrazo : undefined)}
        />
      </Field>
      {/*
       * A dica fica fora do `Field` e atravessa a grade: dentro dele herdaria a
       * coluna de 7rem do prazo, e uma frase de duas linhas num campo de três
       * dígitos empurra a linha inteira para baixo.
       */}
      {comDica && (
        <p id={`${id('prazo')}-dica`} className="text-caption text-content-subtle md:col-span-3">
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
    <li className="border-b border-line-subtle p-4 last:border-b-0">
      <form action={acao} className="flex flex-col gap-3">
        <input type="hidden" name="id" value={forma.id} />
        <Campos prefixo={prefixo} estado={estado} inicial={forma} />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="flex items-center gap-2 text-label text-content-default">
            <Switch name="ativa" defaultChecked={forma.ativa} />
            No balcão
          </label>
          <span className="text-caption text-content-subtle">
            {forma.usos === 0
              ? 'Nenhum uso ainda'
              : `Usada em ${forma.usos.toLocaleString('pt-BR')} ${forma.usos === 1 ? 'pagamento' : 'pagamentos'} — desligue em vez de apagar`}
          </span>
          {/*
           * `Submit`, e não `Button type="submit"`: é ele que chama
           * `useFormStatus`, e é o `pending` daí que impede o clique duplo
           * gravar a mesma alteração duas vezes (risco R6).
           */}
          <Submit variant="outline" size="sm" className="ml-auto">
            Salvar
          </Submit>
        </div>
        <FormFeedback estado={estado} />
      </form>
    </li>
  );
}

/**
 * As formas de pagamento: o que aparece no balcão, e quando o dinheiro chega.
 *
 * Quem não administra vê a lista — o caixa precisa saber que crédito cai em
 * 30 dias —, e não edita. São dois desenhos porque são dois usos: consultar é
 * tabela, configurar é formulário.
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
    if (formas.length === 0) {
      return (
        <EmptyState icone={CreditCard} titulo="Nenhuma forma cadastrada">
          Sem forma de pagamento o balcão só registra venda de valor zero. Quem administra a
          empresa cadastra nesta tela.
        </EmptyState>
      );
    }

    return (
      <Table densidade="larga" rotulo="Formas de pagamento">
        <THead>
          <TR>
            <TH>Forma</TH>
            <TH>Tipo</TH>
            <TH>Entra no caixa</TH>
            <TH alinhamento="fim">No balcão</TH>
          </TR>
        </THead>
        <TBody>
          {formas.map((f) => (
            <TR key={f.id}>
              <TD rotulo="Forma" truncar className="text-content">
                {f.nome}
              </TD>
              <TD rotulo="Tipo" className="text-content-muted">
                {rotuloDoTipo(f.codigo)}
              </TD>
              <TD rotulo="Entra no caixa" className="text-content-muted">
                {prazoEmTexto(f.prazoEmDias)}
              </TD>
              <TD rotulo="No balcão" alinhamento="fim">
                {/* Cor nunca sozinha: os dois estados trazem a palavra, e o ativo trazem o símbolo do tom. */}
                {f.ativa ? <Badge tone="success">Ativa</Badge> : <Badge>Fora do balcão</Badge>}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {formas.length === 0 ? (
        <EmptyState icone={CreditCard} titulo="Nenhuma forma cadastrada ainda">
          Sem ela o balcão só registra venda de valor zero. Comece pela que a empresa mais usa —
          dinheiro, Pix ou a maquininha — no formulário abaixo.
        </EmptyState>
      ) : (
        <ul className="overflow-clip rounded-card border border-line-subtle bg-surface-panel shadow-card">
          {formas.map((f) => (
            <Linha key={f.id} forma={f} />
          ))}
        </ul>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Nova forma</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={criar} className="flex flex-col gap-3">
            {/* `key` na rodada: cada cadastro bem-sucedido devolve o formulário em branco. */}
            <Campos key={estado.rodada} prefixo="nova" estado={estado} />
            <div className="flex flex-wrap items-center gap-3">
              <Submit variant="outline">
                <Plus aria-hidden />
                Adicionar
              </Submit>
              <FormFeedback estado={estado} className="min-w-0 flex-1" />
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
