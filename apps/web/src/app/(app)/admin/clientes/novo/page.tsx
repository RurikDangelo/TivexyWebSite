import { randomUUID } from 'node:crypto';

import { type ModuleCode } from '@tivexy/core';
import { BLUEPRINTS } from '@tivexy/core/blueprints';
import type { Metadata } from 'next';

import { PageHeader } from '@/components/page/header';
import { Page } from '@/components/page/page';
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
    /*
     * `ajuste` é coluna única (seção 3). Antes eram três tetos empilhados —
     * página em `max-w-4xl`, grade de duas colunas dentro dela e um `max-w-xl`
     * no cartão —, e a coluna do formulário acabava com menos de 500px.
     */
    <Page variant="ajuste">
      <PageHeader
        titulo="Novo cliente"
        trilha={[{ rotulo: 'Clientes', href: '/admin' }]}
        descricao="O nicho escolhido decide módulos, papéis e vocabulário. Tudo que aparece na prévia é o plano que será executado — não um resumo dele."
      />

      <NewClientForm blueprints={BLUEPRINTS} modulosPorPlano={mapa} chave={randomUUID()} />
    </Page>
  );
}
