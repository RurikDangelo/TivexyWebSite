/**
 * Roda o CLI do Supabase contra o projeto, com a conexão vinda do `.env`.
 *
 * Existe porque a alternativa não funciona em toda máquina: `db:push` precisa
 * receber a URL montada, e substituição de comando (`$(...)`) não existe no
 * `cmd.exe`, que é o shell que o npm usa no Windows. Um script em Node monta a
 * URL e chama o CLI em qualquer sistema.
 *
 *   node scripts/db.mjs push     aplica o que faltar
 *   node scripts/db.mjs status   o remoto está em dia?
 *   node scripts/db.mjs list     o histórico local × remoto
 */
import { spawnSync } from 'node:child_process';
import { connectionUrl } from './db-url.mjs';

const COMANDOS = {
  push: ['db', 'push', '--yes'],
  status: ['db', 'push', '--dry-run'],
  list: ['migration', 'list'],
};

const pedido = process.argv[2] ?? 'status';
const argumentos = COMANDOS[pedido];

if (argumentos === undefined) {
  console.error(`comando desconhecido: ${pedido}\nUse: ${Object.keys(COMANDOS).join(', ')}`);
  process.exit(1);
}

let url;
try {
  url = connectionUrl('DIRECT_URL');
} catch (erro) {
  console.error(erro instanceof Error ? erro.message : String(erro));
  process.exit(1);
}

/*
 * A URL carrega a senha. Ela vai por argumento porque é o que o CLI aceita, e
 * o que sai daqui passa por um filtro antes de chegar ao terminal — um erro de
 * conexão do CLI ecoa a string inteira, e não é para a senha aparecer em log
 * de CI nem em captura de tela.
 */
const resultado = spawnSync('npx', ['supabase', ...argumentos, '--db-url', url], {
  encoding: 'utf8',
  shell: process.platform === 'win32',
});

const esconderSenha = (texto) =>
  (texto ?? '').replace(/postgres(?:ql)?:\/\/[^\s"']+/g, '[url de conexão oculta]');

process.stdout.write(esconderSenha(resultado.stdout));
process.stderr.write(esconderSenha(resultado.stderr));
process.exit(resultado.status ?? 1);
