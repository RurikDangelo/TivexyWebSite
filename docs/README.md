# Tivexy — Knowledge Base

Cofre Obsidian do ecossistema Tivexy. Abra o Obsidian apontando o cofre para esta
pasta (`docs/`). É versionada em git: documentação e código andam no mesmo commit.

## Comece por aqui

| Documento                                  | Responde                                                   |
| ------------------------------------------ | ---------------------------------------------------------- |
| [[PROJECT_STATE]]                          | **Qual é o estado atual de cada módulo**                   |
| [[PROJECT_AUDIT]]                          | O que foi encontrado na auditoria inicial                  |
| [[ARCHITECTURE]]                           | Como as peças se encaixam e o que não pode depender de quê |
| [[REPOSITORY_STRUCTURE]]                   | O que cada diretório é, e o que não é                      |
| [[03-CORE/AUTHENTICATION\|AUTHENTICATION]] | Como uma requisição vira um `Viewer`                       |
| [[03-CORE/SETTINGS\|SETTINGS]]             | O que a empresa ajusta, e quem pode mudar                  |
| [[03-CORE/TEAM\|TEAM]]                     | Quem trabalha na empresa, e como entra                     |
| [[04-CRM/CRM\|CRM]]                        | O primeiro módulo de negócio                               |
| [[05-ERP/ERP\|ERP]]                        | Cadastro e venda — e o que a venda provoca                 |
| [[05-ERP/INVENTORY\|INVENTORY]]            | Estoque: razão imutável e saldo                            |
| [[05-ERP/FINANCE\|FINANCE]]                | Contas a receber e a pagar, regime de caixa                |
| [[15-OPERATIONS/RODAR-LOCAL\|RODAR-LOCAL]] | Como subir o sistema aqui e ter o que olhar                |

## As quatro fontes de verdade

Não podem divergir:

| Fonte                                          | Responde                |
| ---------------------------------------------- | ----------------------- |
| Código                                         | O que foi implementado  |
| `docs/` (aqui)                                 | O que precisamos saber  |
| [Trello](https://trello.com/b/Ko89xdqb/tivexy) | O que precisa ser feito |
| [[PROJECT_STATE]]                              | Qual é o estado atual   |

E o `CLAUDE.md` na raiz: as regras permanentes do projeto.

## Organização

| Pasta              | Conteúdo                                                       |
| ------------------ | -------------------------------------------------------------- |
| `00-SYSTEM/`       | Como o projeto é operado: fluxos, convenções, rituais          |
| `01-PRODUCT/`      | Visão, posicionamento, pricing, ICP                            |
| `02-ARCHITECTURE/` | Decisões técnicas detalhadas, ERD, diagramas, catálogo de APIs |
| `03-CORE/`         | Identity, auth, tenants, RBAC, planos, módulos, auditoria      |
| `04-CRM/`          | Leads, contatos, pipeline, atividades, atendimento             |
| `05-ERP/`          | Produtos, estoque, compras, vendas, financeiro                 |
| `06-ADMIN/`        | Super Admin, provisionamento, matriz de permissões             |
| `07-BLUEPRINTS/`   | Niche Blueprint Engine e blueprints por nicho                  |
| `08-AI/`           | AI Engine, agentes, ferramentas controladas                    |
| `09-AUTOMATIONS/`  | Automation Engine: triggers, condições, ações                  |
| `10-INTEGRATIONS/` | Meta, WhatsApp, banking, padrão de adapters                    |
| `11-FISCAL/`       | NF-e, NFC-e, NFS-e, certificado digital                        |
| `12-SECURITY/`     | Multi-tenancy, autorização, OWASP, auditoria                   |
| `13-UX/`           | Design system, padrões de interface, acessibilidade            |
| `14-NICHES/`       | Nichos-alvo e o que cada um exige                              |
| `15-OPERATIONS/`   | Onboarding, implantação, suporte                               |
| `16-DECISIONS/`    | ADRs — uma decisão por arquivo                                 |
| `17-MEETINGS/`     | Reuniões e o que foi decidido                                  |
| `18-RELEASES/`     | Changelog e notas de versão                                    |
| `99-ARCHIVE/`      | O que saiu de circulação, sem apagar                           |

## Documentos previstos

A Documentação Interna v1.1 (§8) lista os documentos de engenharia do Core.
Eles são escritos **quando o módulo correspondente é construído** — documento
sem implementação atrás vira ficção.

| Documento                              | Destino            | Estado                           |
| -------------------------------------- | ------------------ | -------------------------------- |
| `ARCHITECTURE.md`                      | raiz de `docs/`    | ✅ escrito                       |
| `DATABASE.md`                          | `02-ARCHITECTURE/` | ✅ escrito                       |
| `MULTI_TENANCY.md`                     | `12-SECURITY/`     | ✅ escrito                       |
| `AUTHORIZATION.md`                     | `12-SECURITY/`     | ✅ escrito                       |
| `AUTHENTICATION.md`                    | `03-CORE/`         | ✅ escrito                       |
| `SETTINGS.md`                          | `03-CORE/`         | ✅ escrito                       |
| `TEAM.md`                              | `03-CORE/`         | ✅ escrito                       |
| `CRM.md`                               | `04-CRM/`          | ✅ escrito                       |
| `RODAR-LOCAL.md`                       | `15-OPERATIONS/`   | ✅ escrito                       |
| `TUTORIAL.md`                          | `15-OPERATIONS/`   | ✅ escrito                       |
| `PROVISIONING.md`                      | `06-ADMIN/`        | ✅ especificado                  |
| `ERP.md`, `INVENTORY.md`, `FINANCE.md` | `05-ERP/`          | ✅ escrito                       |
| `INTEGRATIONS.md`                      | `10-INTEGRATIONS/` | ✅ escrito                       |
| `BANKING.md`                           | `10-INTEGRATIONS/` | ⬜ quando houver provedor        |
| `FISCAL.md`                            | `11-FISCAL/`       | ⬜ quando houver provedor        |
| `WHATSAPP.md`                          | `10-INTEGRATIONS/` | ⬜ quando houver credencial Meta |
| `AUTOMATIONS.md`                       | `09-AUTOMATIONS/`  | ✅ escrito                       |
| `API.md`                               | `02-ARCHITECTURE/` | ⬜ com as primeiras rotas        |
| `SECURITY.md`                          | `12-SECURITY/`     | ⬜ com o Core                    |
| `TESTING.md`                           | `00-SYSTEM/`       | ✅ escrito                       |
| `DEPLOYMENT.md`                        | `15-OPERATIONS/`   | ⬜ com o primeiro deploy do SaaS |
| `TROUBLESHOOTING.md`                   | `15-OPERATIONS/`   | ⬜ com a operação                |
| `CHANGELOG.md`                         | `18-RELEASES/`     | ⬜ com a primeira release        |
| `FINAL_AUDIT.md`                       | raiz de `docs/`    | ⬜ na auditoria final            |

## Convenções

- Um assunto por arquivo. Nome descritivo, sem data no título.
- Ligue documentos com `[[wikilink]]` sempre que fizer sentido.
- Decisão vira ADR em `16-DECISIONS/`, numerada, com contexto e consequência.
- Data absoluta (`18/09/2026`), nunca "semana passada".
- Documento que descreve algo não construído é marcado como **previsto**.
