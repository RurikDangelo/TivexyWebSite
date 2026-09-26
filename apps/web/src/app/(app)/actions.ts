'use server';

/**
 * Trocar a empresa ativa.
 *
 * Server Action, e não um link: um `<a href="/empresas/acme">` que grava cookie
 * é uma mudança de estado por GET. O navegador pré-carrega link, o antivírus
 * abre link, o leitor de tela percorre link — qualquer um deles trocaria a
 * empresa da pessoa sem que ela clicasse.
 *
 * A conferência abaixo existe para dar erro claro, não para conter acesso —
 * ver `lembrarEmpresa()`.
 */

import { redirect } from 'next/navigation';

import { currentSession } from '@/lib/auth/session';
import { lembrarEmpresa } from '@/lib/auth/tenant-cookie';

export async function trocarEmpresa(form: FormData): Promise<void> {
  const bruto = form.get('slug');
  const slug = typeof bruto === 'string' ? bruto.trim().toLowerCase() : '';

  const { options } = await currentSession();
  const escolhida = options.find((o) => o.slug.toLowerCase() === slug);
  if (escolhida === undefined) redirect('/empresas');

  await lembrarEmpresa(escolhida.slug);
  redirect('/painel');
}
