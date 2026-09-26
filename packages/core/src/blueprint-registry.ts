/**
 * Os blueprints do repositório, prontos para usar.
 *
 * Importados um a um, de propósito, e não lidos do diretório em tempo de
 * execução. O teste lê o diretório — ali a leitura é certa, porque roda no
 * repositório. Aqui não: `apps/web` empacota para servidor sem sistema de
 * arquivos garantido, e `readFileSync` com caminho montado não é rastreado pelo
 * empacotador. O arquivo simplesmente não estaria lá, e o erro apareceria no
 * primeiro provisionamento em produção.
 *
 * O preço é que um blueprint novo precisa ser registrado aqui. Esquecer é
 * silencioso — o arquivo existe, passa no teste de validade e não aparece na
 * tela. Por isso `blueprint-registry.test.ts` compara esta lista com o
 * diretório e falha quando as duas discordam.
 */

import cafeteria from '../blueprints/cafeteria.json' with { type: 'json' };
import clinicaOdontologica from '../blueprints/clinica-odontologica.json' with { type: 'json' };
import mercado from '../blueprints/mercado.json' with { type: 'json' };
import type { Blueprint } from './blueprint.ts';

/*
 * O JSON entra como tipo inferido do literal — `string` onde o contrato quer
 * `ModuleCode`. A asserção é o ponto em que o documento vira contrato, e é
 * segura porque `checkBlueprint` confere cada campo contra o catálogo, e o
 * teste roda essa conferência em todos os arquivos.
 */
const DOCUMENTOS = [cafeteria, clinicaOdontologica, mercado] as unknown as Blueprint[];

export const BLUEPRINTS: readonly Blueprint[] = DOCUMENTOS;

const POR_CODIGO = new Map(DOCUMENTOS.map((b) => [b.code, b]));

/** O blueprint de um nicho, ou `null`. Nunca lança: o código vem de formulário. */
export function blueprintByCode(code: string): Blueprint | null {
  return POR_CODIGO.get(code.trim().toLowerCase()) ?? null;
}
