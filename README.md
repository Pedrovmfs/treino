# Treino — registro & progressão

App pessoal (PWA) para registrar treinos e acompanhar progressão de carga,
volume, recordes e comparação com a sessão anterior. Funciona offline no
iPhone depois de instalado. Sem back-end: os dados ficam no próprio aparelho
(IndexedDB) e você faz backup exportando um arquivo JSON.

## Como usar

1. **Hoje** — escolha um treino (A–E) para iniciar a sessão.
2. **Registro** — preencha carga e reps de cada série.
   - Tipos de série: `aquec`, `prep`, `válida`. Toque no rótulo para mudar.
   - `aquec`/`prep` já vêm com **reps = 10** e a carga da última vez.
     `válida` vem só com a carga sugerida — digitar as reps **marca o check**
     ("série feita").
   - **As análises contam só séries `válidas` marcadas.** Dia corrido em que
     você faz 1 válida e nada mais: só ela entra.
   - O exercício ganha ✓ quando tem ao menos uma válida marcada; ao finalizar,
     aviso se algum exercício ficou sem nenhuma série.
   - "Trocar exercício" resolve reservas / alternância de semana sem perder
     o histórico do slot.
3. **Finalizar treino** — salva a sessão.
4. **Histórico** — todas as sessões; toque para ver/editar.
5. **Progresso** — volume por semana + evolução por exercício (carga da
   melhor série e 1RM estimado por Epley), PRs e histórico.
6. **Gerenciar** — editar treinos, exercícios, número e tipo de séries.
7. **Config** — tema, **backup/exportar**, importar, armazenamento.

## Rodar localmente (no PC)

```bash
python -m http.server 8777
```

Abra <http://localhost:8777>. (Service worker / instalação só funcionam em
`localhost` ou HTTPS.)

## Instalar no iPhone

Precisa estar publicado em **HTTPS**. Veja [DEPLOY.md](DEPLOY.md).
Depois, no Safari: **Compartilhar → Adicionar à Tela de Início**.

## Backup (importante no iOS)

O iOS pode apagar os dados de sites/PWAs pouco usados. O app pede
"armazenamento persistente", mas **exporte um JSON de tempos em tempos**
(Config → Exportar). Um aviso aparece quando faz tempo que você não faz backup.

## Estrutura

```
index.html              shell + meta tags iOS
manifest.webmanifest    PWA
sw.js                    cache offline (bump "treino-vN" a cada deploy)
src/
  app.js                bootstrap + rotas + tab bar
  router.js             roteador por hash
  store.js              estado em memória + persistência
  db.js                 wrapper IndexedDB + export/import
  seed.js               treinos A–E e biblioteca de exercícios (dados iniciais)
  calc.js               1RM, volume, séries, PRs, tendência, semanas
  ui.js / theme.js      helpers de DOM e tema
  components/chart.js   gráficos SVG (linha e barra), sem dependências
  views/                telas
assets/icons/           ícones (gerados por scripts/gen_icons.py)
```

## Dados iniciais

Vêm do arquivo `treinos_ABCDE_unico.xlsx`. Convenção de séries:
`3x` → `prep + 2 válidas`; `4x` → `aquec + prep + 2 válidas`.
Ajuste em **Gerenciar** se precisar.
