# Publicar (para instalar no iPhone)

O app é 100% estático. Qualquer host de arquivos estáticos com HTTPS serve.
Escolha **uma** opção.

## Opção A — Cloudflare Pages / Netlify (arrastar pasta, sem Git)

1. Vá em <https://app.netlify.com/drop> (ou Cloudflare Pages → "Direct Upload").
2. Arraste a pasta do projeto inteira.
3. Recebe uma URL `https://algo.netlify.app` — abra no iPhone.
4. Para atualizar: arraste a pasta de novo (ou conecte ao GitHub).

## Opção B — GitHub Pages

Precisa de uma conta no GitHub. Uma vez configurado, é `git push` para atualizar.

```bash
# na pasta do projeto (já tem git init)
git add -A
git commit -m "app de treino"

# crie um repositório vazio em github.com (ex.: "treino"), depois:
git remote add origin https://github.com/SEU_USUARIO/treino.git
git branch -M main
git push -u origin main
```

No GitHub: **Settings → Pages → Source: Deploy from a branch → `main` / `/root`**.
Em ~1 min o app fica em `https://SEU_USUARIO.github.io/treino/`.

> As URLs internas são relativas e o roteamento é por `#`, então funciona
> em subpasta (`/treino/`) sem ajustes.

## Instalar no iPhone

1. Abra a URL HTTPS no **Safari** (tem que ser o Safari).
2. Botão **Compartilhar** → **Adicionar à Tela de Início** → **Adicionar**.
3. Abra pelo ícone. Agora roda em tela cheia e offline.
4. Primeira vez com internet para o service worker cachear tudo.

## Ao publicar uma nova versão

Edite `sw.js` e troque `treino-v1` por `treino-v2` (e assim por diante).
Sem isso, o iPhone pode continuar servindo a versão antiga do cache.

## Backup dos dados

Os dados **não** vão para o servidor — ficam no aparelho. Cada dispositivo
tem seu próprio histórico. Use **Config → Exportar** para gerar um JSON e
**Importar** para levar de um aparelho para outro.
