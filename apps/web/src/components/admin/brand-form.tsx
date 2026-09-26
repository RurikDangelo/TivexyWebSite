'use client';

import {
  type BrandScale,
  CONTRAST_AA,
  CONTRAST_AA_LARGE,
  brandScale,
  checkBrandColor,
} from '@tivexy/core';
import { type CSSProperties, useActionState, useState } from 'react';

import { Field, describedBy } from '@/components/form/field';
import { FormFeedback, FormMessage } from '@/components/form/messages';
import { Submit } from '@/components/form/submit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SectionLabel } from '@/components/ui/section-label';
import { salvarCor } from '@/lib/admin/brand';
import { MARCA_INICIAL } from '@/lib/admin/state';

/*
 * A cor do cliente, com a prévia do que ela faz e o contraste medido.
 *
 * A prévia não é enfeite. A cor é escolhida olhando um quadradinho e vivida
 * num botão com texto por cima — e é no texto que ela falha. Amarelo é o caso
 * que ensina: bonito no quadrado, ilegível no botão, invisível como barra de
 * menu sobre o painel branco. As três coisas aparecem aqui, antes de salvar.
 *
 * O contraste sai de `brandScale`, no Core, que mede pela WCAG 2 e tem teste
 * com cores extremas. A tela não repete a conta — só mostra o número.
 *
 * E o número **não** trava o botão. A marca é do cliente: ele pode ter motivo
 * para uma cor que reprova, e a decisão é do dono da plataforma. O que não
 * pode é ele descobrir depois. Por isso a mensagem é grande, diz o valor
 * medido e diz o que vai acontecer.
 */

/** O azul da Tivexy, o mesmo `--tvx-blue-600`, usado quando a empresa não tem cor. */
const AZUL_TIVEXY = '#1648a6';

export interface BrandFormProps {
  tenantId: string;
  /** A cor gravada, ou `null` quando a empresa usa a da Tivexy. */
  corAtual: string | null;
}

export function BrandForm({ tenantId, corAtual }: BrandFormProps) {
  const [estado, salvar] = useActionState(salvarCor, MARCA_INICIAL);
  const [texto, setTexto] = useState(corAtual ?? '');
  const [tocado, setTocado] = useState(false);

  const vazio = texto.trim() === '';
  const conferida = checkBrandColor(texto);
  const escala = brandScale(conferida.ok ? conferida.value : AZUL_TIVEXY);

  /*
   * O erro de formato só aparece quando já dá para ter acertado — seis dígitos
   * digitados, ou o campo abandonado. Acusar "#1" de inválido enquanto a
   * pessoa digita é ruído, e ruído treina a ignorar o alerta que importa.
   */
  const completo = texto.replace(/[^0-9a-z]/gi, '').length >= 6;
  const erroDeFormato =
    !vazio && !conferida.ok && (tocado || completo) ? conferida.error : undefined;
  const erroDoCampo = estado.cor ?? erroDeFormato;

  const dica = 'Seis dígitos, como #1648a6. Em branco, a empresa usa o azul da Tivexy.';

  return (
    <form action={salvar} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={tenantId} />

      <div className="flex flex-wrap items-start gap-3">
        <Field nome="marca-cor" rotulo="Cor principal" erro={erroDoCampo} dica={dica}>
          <div className="flex items-center gap-2">
            <Input
              id="marca-cor"
              name="cor"
              value={texto}
              onChange={(ev) => setTexto(ev.target.value)}
              onBlur={() => setTocado(true)}
              maxLength={7}
              spellCheck={false}
              autoComplete="off"
              placeholder={AZUL_TIVEXY}
              className="w-36 font-mono"
              aria-invalid={erroDoCampo !== undefined}
              aria-describedby={describedBy('marca-cor', erroDoCampo, dica)}
            />
            {/*
             * O seletor nativo é atalho, não fonte da verdade: o campo de texto
             * é que envia. Ele não tem `name` de propósito — dois campos com o
             * mesmo nome mandariam dois valores, e o servidor leria o primeiro.
             */}
            <input
              type="color"
              value={escala.base}
              onChange={(ev) => setTexto(ev.target.value)}
              aria-label="Escolher a cor num seletor"
              className="size-9 shrink-0 cursor-pointer rounded-control border border-line-strong bg-surface p-0.5"
            />
          </div>
        </Field>
      </div>

      <Previa escala={escala} usandoPadrao={vazio || !conferida.ok} />
      <Contraste escala={escala} />

      <div className="flex flex-wrap items-center gap-3">
        <Submit variant="outline">Salvar cor</Submit>
        {/* Só limpa o campo; quem grava é o Salvar ao lado. Dois botões que salvam, um deles sem avisar, seria surpresa. */}
        {!vazio && (
          <Button type="button" variant="ghost" onClick={() => setTexto('')}>
            Limpar a cor
          </Button>
        )}
      </div>
      <FormFeedback estado={estado} />
    </form>
  );
}

/**
 * Como a cor fica onde ela é usada.
 *
 * Tudo aqui é `aria-hidden`: são amostras, não controles. Um botão falso
 * focável seria um destino de tabulação que não faz nada, e o leitor de tela
 * anunciaria "botão" três vezes. A informação equivalente vai em texto, logo
 * abaixo, em `Contraste`.
 */
function Previa({ escala, usandoPadrao }: { escala: BrandScale; usandoPadrao: boolean }) {
  const variaveis = {
    '--previa': escala.base,
    '--previa-hover': escala.hover,
    '--previa-active': escala.active,
    '--previa-tinta': escala.ink,
  } as CSSProperties;

  return (
    <div className="flex flex-col gap-2" style={variaveis}>
      <SectionLabel>Prévia{usandoPadrao ? ' — azul da Tivexy, que é o padrão' : ''}</SectionLabel>

      <div
        aria-hidden
        className="flex flex-wrap items-center gap-4 rounded-card bg-surface-sunken p-4"
      >
        <div className="flex flex-col items-start gap-1.5">
          <span className="text-micro text-content-subtle">Botão principal</span>
          <div className="flex items-center gap-2">
            <Amostra fundo="var(--previa)" legenda="normal" />
            <Amostra fundo="var(--previa-hover)" legenda="ponteiro" />
            <Amostra fundo="var(--previa-active)" legenda="apertado" />
          </div>
        </div>

        <div className="flex flex-col items-start gap-1.5">
          <span className="text-micro text-content-subtle">Menu, item ativo</span>
          <div className="relative flex w-44 items-center gap-2 overflow-hidden rounded-control bg-[color-mix(in_srgb,var(--previa)_14%,transparent)] py-2 pr-3 pl-4 text-label text-content">
            <span className="absolute inset-y-1 left-0 w-[3px] rounded-e-pill bg-[var(--previa)]" />
            <span className="size-4 rounded-xs bg-[var(--previa)]" />
            Painel
          </div>
        </div>
      </div>
    </div>
  );
}

/** Um estado do botão, com o texto na tinta que o contraste escolheu. */
function Amostra({ fundo, legenda }: { fundo: string; legenda: string }) {
  return (
    <span className="flex flex-col items-center gap-1">
      <span
        className="inline-flex items-center rounded-control px-3 py-1.5 text-label shadow-card"
        style={{ backgroundColor: fundo, color: 'var(--previa-tinta)' }}
      >
        Salvar
      </span>
      <span className="text-micro text-content-subtle">{legenda}</span>
    </span>
  );
}

/**
 * O número, sempre — não só quando dá ruim.
 *
 * Quem escolhe uma cor precisa saber quanto ela mede para poder ajustar; um
 * alerta que só aparece no erro esconde que a escolha anterior passou raspando.
 */
function Contraste({ escala }: { escala: BrandScale }) {
  const valor = escala.contrast.toFixed(2);
  const tinta = escala.inkIsLight ? 'branco' : 'quase preto';
  const somemNoPainel = escala.onLightSurface < CONTRAST_AA_LARGE;

  if (!escala.meetsAA) {
    return (
      <FormMessage tom={escala.meetsAALarge ? 'warning' : 'danger'} anuncio="status">
        Texto {tinta} sobre esta cor dá <strong>{valor}:1</strong> no pior estado do botão, e a WCAG
        AA pede {CONTRAST_AA}:1
        {escala.meetsAALarge ? ' (texto grande passa com 3:1)' : ''}. Dá para salvar, mas o rótulo
        do botão fica difícil de ler — escurecer ou clarear a cor resolve.
      </FormMessage>
    );
  }

  return (
    <div role="status" className="flex flex-col gap-1 text-caption text-content-muted">
      <p>
        Contraste do rótulo: <strong className="text-content">{valor}:1</strong> no pior estado do
        botão, com texto {tinta}. Passa na WCAG AA ({CONTRAST_AA}:1).
      </p>
      {somemNoPainel && (
        <p className="text-warning">
          Como realce sobre o painel claro — a barra e o ícone do menu ativo — esta cor dá apenas{' '}
          {escala.onLightSurface.toFixed(2)}:1 e praticamente desaparece.
        </p>
      )}
    </div>
  );
}
