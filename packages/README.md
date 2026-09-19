# packages/

Código compartilhado **de verdade** entre as aplicações do monorepo.

## Existentes

| Package         | Responsabilidade                                                                     | Consumido por |
| --------------- | ------------------------------------------------------------------------------------ | ------------- |
| [`core`](core/) | Contratos do domínio: códigos do catálogo, estados e as regras que dependem só deles | `apps/web`    |

## Previstos

| Package  | Responsabilidade                                    | Quando                                    |
| -------- | --------------------------------------------------- | ----------------------------------------- |
| `types`  | Tipos gerados do banco (`supabase gen types`)       | Quando o projeto Supabase existir         |
| `ui`     | Componentes compartilhados                          | Quando houver um segundo consumidor React |
| `config` | Configuração compartilhada (tokens, lint, tsconfig) | Quando houver um segundo consumidor       |

`apps/site` é Astro e não consome nenhum deles: compartilhar componente entre
Astro e React acoplaria dois projetos que devem publicar independentes. O que
os dois compartilham hoje são os **valores** dos design tokens, duplicados de
propósito até existir um segundo consumidor React.

## Antes de criar um package

Responda: isso é Core, módulo, package, aplicação, integração ou serviço externo?

Package só quando houver **consumo real por mais de um lugar** — ou, como em
`core`, quando o package existir para manter dois lados em sincronia sob teste.
Nunca para "deixar organizado".

## Regra de dependência

```
apps/*  →  packages/*
```

Nunca `packages/* → apps/*`. Nunca `app → app`. Sem ciclos.

Detalhe em [`../docs/REPOSITORY_STRUCTURE.md`](../docs/REPOSITORY_STRUCTURE.md).
