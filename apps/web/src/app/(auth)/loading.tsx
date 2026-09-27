import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * O cartão de entrada enquanto ele não chegou.
 *
 * O grupo não tinha `loading.tsx`: o clique em "Esqueci a senha" ficava sem
 * resposta visível até a próxima página pintar. Agora há resposta, e ela tem a
 * **forma** do que vem — cabeçalho, dois campos e um botão de largura inteira.
 * Um esqueleto genérico aqui seria pior que nenhum: prometeria um layout e
 * entregaria outro, e a tela saltaria exatamente na primeira impressão.
 *
 * As três telas do grupo têm o mesmo esqueleto de propósito. `/recuperar` tem um
 * campo em vez de dois, e essa é a única divergência — um esqueleto por rota
 * para economizar 60px de altura custaria três arquivos que saem de sincronia.
 *
 * As medidas saem dos tokens: título em `--text-display` (2.25rem), descrição em
 * `--text-body-lg` (1rem), rótulo em `--text-label` (0.875rem) e controle em
 * `h-11` (2.75rem), que é o `size="lg"` de Input e Button.
 *
 * Um `role="status"` só, no contêiner: os esqueletos são `aria-hidden` por
 * dentro, e vinte anúncios de "carregando" seriam ruído, não informação.
 */
export default function AuthLoading() {
  return (
    <Card
      role="status"
      aria-busy
      className="shadow-raised [--card-pad-tight:1rem] [--card-pad:1.5rem]"
    >
      <span className="sr-only">Carregando</span>

      <CardHeader>
        <Skeleton largura="13rem" altura="2.25rem" />
        <div className="flex flex-col gap-1.5 pt-1">
          <Skeleton altura="1rem" />
          <Skeleton largura="65%" altura="1rem" />
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {['email', 'senha'].map((campo) => (
          <div key={campo} className="flex flex-col gap-1.5">
            <Skeleton largura="5rem" altura="0.875rem" />
            <Skeleton altura="2.75rem" />
          </div>
        ))}

        {/* A linha do "Esqueci a senha", alinhada à direita como no formulário. */}
        <div className="flex justify-end">
          <Skeleton largura="8rem" altura="0.875rem" />
        </div>

        <Skeleton altura="2.75rem" />
      </CardContent>
    </Card>
  );
}
