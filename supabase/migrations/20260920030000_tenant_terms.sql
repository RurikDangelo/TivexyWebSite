-- Tivexy Core — o vocabulário do nicho passa a ser gravado
--
-- O Blueprint sempre pôde traduzir os rótulos: uma clínica lê "paciente" onde
-- uma consultoria lê "contato". `checkBlueprint()` valida cada chave contra o
-- catálogo desde o começo, e `termFor()` resolve o rótulo com padrão.
--
-- Só que **nada gravava**. O plano de provisionamento não tinha operação para
-- isso, e o tenant nascia com módulos, papéis e sementes do nicho — e sem o
-- vocabulário. A promessa do produto ("mudam papéis, categorias e
-- vocabulário") ficava dois terços verdadeira, e a parte que faltava não dava
-- erro nenhum: a interface simplesmente mostrava o nome genérico.
--
-- Isto apareceu quando a primeira tela de módulo de negócio precisou escolher
-- entre dizer "Leads" e dizer o que o nicho chama de lead. Antes disso não
-- havia como perceber, porque não havia tela que perguntasse.
--
-- ## Coluna própria, não dentro de `settings`
--
-- `settings` responde "como esta empresa opera" — moeda, fuso, se a venda
-- exige cliente. `terms` responde "como esta empresa chama as coisas". Juntar
-- as duas num jsonb só faria `resolveSettings()` ter que ignorar chaves que
-- não são configuração, e a próxima pessoa a ler o objeto teria que saber
-- disso de cabeça.

alter table public.tenants
  add column terms jsonb not null default '{}'::jsonb;

comment on column public.tenants.terms is
  'Vocabulário do nicho: chave do catálogo → {singular, plural}. Vem do Blueprint.';
