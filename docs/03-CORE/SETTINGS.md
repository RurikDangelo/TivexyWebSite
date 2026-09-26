# Configurações do tenant

> O que uma empresa pode ajustar no Tivexy, onde isso mora e quem pode mudar.
> A tela é `/configuracoes`. 🟡 _Testado, não verificado contra o banco real
> (25/09/2026)._

## O catálogo é do Core; o valor é do tenant

`TENANT_SETTINGS`, em `packages/core/src/settings.ts`, diz **que**
configurações existem, de que tipo são, o padrão, o rótulo e a descrição. O
Blueprint escolhe valores iniciais; a tela deixa a empresa mudar depois. Nenhum
dos dois cria configuração nova — isso é mudança de Core (ADR-003).

| Chave                           | Módulo      | O que faz                                        |
| ------------------------------- | ----------- | ------------------------------------------------ |
| `core.currency`                 | `core`      | Moeda. Só `BRL` — nada converte outra moeda      |
| `core.timezone`                 | `core`      | O "hoje" da agenda, dos vencimentos e relatórios |
| `crm.contact_requires_document` | `crm`       | Pessoa sem CPF/CNPJ não é salva                  |
| `erp.sales_requires_customer`   | `erp`       | Venda sem cliente identificado não é salva       |
| `inventory.deduct_on_sale`      | `inventory` | A venda baixa o estoque sozinha                  |

## Grava-se só a diferença

`tenants.settings` guarda o que a empresa **mudou**, não o resultado.
`overridesFrom()` decide o que gravar: valor igual ao padrão sai do registro.

Guardando o resultado, um padrão novo no Core nunca alcançaria quem já existe —
o tenant teria gravado o padrão antigo como se fosse escolha. E a tela perderia
a pergunta "isso foi escolhido, ou é assim para todo mundo?", que ela responde
com o selo **Alterada**.

A escolha de um módulo **desligado** sobrevive a uma gravação: o módulo pode
voltar, e a escolha volta com ele.

## Quem pode mudar — e o defeito que havia

| O quê              | Permissão              | Onde é garantido                 |
| ------------------ | ---------------------- | -------------------------------- |
| Nome, razão, CNPJ  | `core.tenant.write`    | política `tenants_update`        |
| Preferências       | `core.settings.write`  | `update_tenant_settings()`       |
| Tipos de atividade | `crm.activities.write` | política de `crm_activity_types` |

Até 25/09/2026 a segunda linha estava errada. `settings` é coluna de
`tenants`, e a política de `tenants` confere `core.tenant.write` — não
`core.settings.write`. Um papel com `core.settings.write` não salvava; um com
`core.tenant.write` salvava. A permissão que existia para configurações não era
a que valia.

A migration `20260925050000_tenant_settings_write` tira `settings` do
`GRANT UPDATE` de `authenticated` e põe a escrita numa função que confere a
permissão certa e registra **antes e depois** em `audit_logs` — fuso e baixa de
estoque mudam o comportamento da empresa inteira, e "quem mudou isso?" precisa
de resposta. Conferido quebrando: trocando a checagem por "é membro", dois
testes falham.

A função não valida chave nem valor: isso é do Core, que conhece o catálogo.
Repetir o catálogo em SQL seria mais uma cópia para divergir.

## O que aparece só para leitura

- **Módulos contratados** — habilitar é decisão comercial, não da empresa.
- **Vocabulário** — vem do nicho, gravado em `tenants.terms` no
  provisionamento. `authenticated` não tem privilégio de escrita nessa coluna.

## O fuso

O seletor oferece os fusos do Brasil, com o deslocamento lido do `Intl` na
hora — o país pode voltar a ter horário de verão, e "UTC−3" escrito à mão
passaria a mentir. Um fuso fora da lista, já em uso, continua oferecido:
tirá-lo do seletor trocaria o fuso da empresa no primeiro "salvar".
