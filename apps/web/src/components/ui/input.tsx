import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

/**
 * Tamanho compartilhado por Input, Select e Textarea.
 *
 * Exportado porque quem monta uma barra de filtro precisa pedir o mesmo
 * tamanho para os três controles da linha — era a divergência que fazia um
 * select nascer 1,5px mais estreito que o campo ao lado.
 */
export type TamanhoDeCampo = 'sm' | 'md' | 'lg';

/*
 * `px-3` mora na base, e não na tabela de tamanhos, de propósito: o padding
 * horizontal ser igual em Input, Select e Textarea é o conserto, não uma
 * escolha por tamanho. Antes era `px-3` no campo e `px-2.5` no select, e o
 * texto de um começava 2px depois do outro na mesma linha de formulário.
 *
 * A borda em repouso fica em `--line-field` (4:1 sobre branco) porque a WCAG
 * 1.4.11 pede 3:1 para o limite de um campo — é ele que diz onde clicar.
 * O hover sobe para `--content-muted`, e não para `--line-strong` como o
 * contrato escreve ao pé da letra: `--line-strong` (#c5d1df no claro, 24% de
 * branco no escuro) é MAIS FRACO que `--line-field` nos dois temas, então
 * aquele hover apagaria o campo em vez de destacá-lo, e o derrubaria abaixo do
 * mínimo de contraste. `--content-muted` é o passo mais forte disponível, nos
 * dois temas.
 */
const CAMPO = [
  'w-full min-w-0 rounded-control border border-line-field bg-surface px-3 text-content',
  'placeholder:text-content-subtle',
  'transition-[color,background-color,border-color] transition-base',
  // `not-disabled:` porque campo desabilitado que reage ao ponteiro mente.
  'not-disabled:hover:border-content-muted',
  'focus:border-ring',
  'disabled:cursor-not-allowed disabled:opacity-50',
  'aria-invalid:border-danger',
];

/*
 * O corpo do texto só cresce no `lg`, usado em tela de acesso e em ação de
 * balcão — onde o campo é o assunto da tela, não um item de formulário.
 */
const TEXTO: Record<TamanhoDeCampo, string> = {
  sm: 'text-body',
  md: 'text-body',
  lg: 'text-body-lg',
};

/** Alturas dos controles de uma linha. Batem com as do Button de mesmo nome. */
const ALTURA: Record<TamanhoDeCampo, string> = {
  sm: 'h-8',
  md: 'h-9.5',
  lg: 'h-11',
};

/** Textarea cresce, então o tamanho vira piso de altura e respiro vertical. */
const CAIXA: Record<TamanhoDeCampo, string> = {
  sm: 'min-h-16 py-1.5',
  md: 'min-h-20 py-2',
  lg: 'min-h-24 py-2.5',
};

/*
 * `size` sombreia o atributo nativo (largura em caracteres no input, número de
 * linhas visíveis no select) porque é o nome que o contrato dá ao tamanho do
 * controle, e nenhuma tela usa o atributo nativo. Quem precisar dele um dia
 * usa `className` para a largura, que é como já se faz aqui.
 */
export interface InputProps extends Omit<ComponentProps<'input'>, 'size'> {
  size?: TamanhoDeCampo;
}

export function Input({ className, size = 'md', ...props }: InputProps) {
  return <input className={cn(CAMPO, TEXTO[size], ALTURA[size], className)} {...props} />;
}

/* Alias, não interface: uma interface vazia é o próprio supertipo, e o lint reprova. */
export type LabelProps = ComponentProps<'label'>;

export function Label({ className, ...props }: LabelProps) {
  return <label className={cn('text-label text-content-default', className)} {...props} />;
}

export interface SelectProps extends Omit<ComponentProps<'select'>, 'size'> {
  size?: TamanhoDeCampo;
}

/**
 * `<select>` nativo com a mesma cara do campo.
 *
 * Nativo de propósito: no celular abre o seletor do sistema, que é melhor do
 * que qualquer lista desenhada à mão, e funciona com teclado e leitor de tela
 * sem uma linha de código.
 */
export function Select({ className, size = 'md', ...props }: SelectProps) {
  return <select className={cn(CAMPO, TEXTO[size], ALTURA[size], className)} {...props} />;
}

export interface TextareaProps extends Omit<ComponentProps<'textarea'>, 'size'> {
  size?: TamanhoDeCampo;
}

export function Textarea({ className, size = 'md', ...props }: TextareaProps) {
  return <textarea className={cn(CAMPO, TEXTO[size], CAIXA[size], className)} {...props} />;
}
