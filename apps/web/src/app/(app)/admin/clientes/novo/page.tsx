import { randomUUID } from 'node:crypto';

import { type ModuleCode } from '@tivexy/core';
import { BLUEPRINTS } from '@tivexy/core/blueprints';
import type { Metadata } from 'next';
import Link from 'next/link';

import { embeddedCode } from '@/lib/supabase/embedded';
import { supabaseServer } from '@/lib/supabase/server';

import { NewClientForm } from './new-client-form';

export const metadata: Metadata = { title: 'Novo cliente' };

/*
 * A chave de idempotência nasce aqui, no servidor, uma por abertura da página.
 * Gerá-la no navegador funcionaria, mas `crypto.randomUUID()` exige contexto
 * seguro — em HTTP simples ele não existe, e a tela quebraria justamente na
 * máquina de quem está testando fora de localhost.
 *
 * `dynamic` porque a chave precisa ser nova a cada visita. Uma página estática
 * serviria a mesma chave para todo mundo, e a segunda criação seria recusada
 * como repetida — um cliente que "não é criado" sem erro nenhum.
 */
export const dynamic = 'force-dynamic';

/**
 * Os módulos de cada plano, do banco.
 *
 * Carregado aqui para que a prévia do formulário rode `planProvisioning` com os
 * mesmos dados que o servidor vai usar. Sem isso, a prévia mostraria os módulos
 * do blueprint — que podem ser mais do que o plano contratado inclui, e a tela
 * prometeria o que o plano não entrega.
 */
async function modulosPorPlano(): Promise<Record<string, ModuleCode[]>> {
  const supabase = await supabaseServer();
  const { data } = await supabase.from('plan_modules').select('plans(code), modules(code)');

  const mapa: Record<string, ModuleCode[]> = {};
  for (const linha of data ?? []) {
    const plano = embeddedCode(linha.plans);
    const modulo = embeddedCode(linha.modules);
    if (plano === null || modulo === null) continue;
    (mapa[plano] ??= []).push(modulo as ModuleCode);
  }
  return mapa;
}

export default async function NovoClientePage() {
  const mapa = await modulosPorPlano();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <Link
          href="/admin"
          className="text-sm text-content-accent underline-offset-4 hover:underline"
        >
          ← Clientes
        </Link>
        <h1 className="mt-2 font-display text-2xl font-bold text-content">Novo cliente</h1>
        <p className="mt-1 max-w-prose text-content-muted">
          O nicho escolhido decide módulos, papéis e vocabulário. Tudo que aparece na prévia é o
          plano que será executado — não um resumo dele.
        </p>
      </header>

      <NewClientForm blueprints={BLUEPRINTS} modulosPorPlano={mapa} chave={randomUUID()} />
    </div>
  );
}
