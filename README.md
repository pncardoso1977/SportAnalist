# SportAnalist

Aplicação web bilingue (PT/EN) para análise técnico-tática de futsal com vídeo YouTube, registo de eventos, timestamps, zonas, estatísticas e colaboração entre analistas.

## Stack
- Next.js App Router + TypeScript
- Tailwind CSS
- Supabase PostgreSQL, Auth e Realtime (configuração opcional)
- YouTube IFrame Player API
- Firebase AI Logic + Gemini Developer API (análise multimodal de vídeo por URL)
- GitHub Actions para validação

## Arranque local
```bash
npm install
cp .env.example .env.local
npm run dev
```

Sem variáveis Supabase, a interface funciona em modo demonstração com persistência local no browser. Para autenticação e sincronização multiutilizador, configure as variáveis Supabase e aplique, por ordem, as migrações `0001_initial_schema.sql`, `0002_event_moment_and_outcome.sql`, `0003_team_event_association.sql` e `0004_public_match_sharing.sql`.

## Variáveis de ambiente
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY`

As variáveis Firebase são configuração pública da Web App; não colocar chaves de service account, segredo reCAPTCHA ou uma chave Gemini privada no frontend.

## Perfis
- `admin`: gestão integral do projeto, equipa, utilizadores e eventos
- `analyst`: leitura, registo e remoção dos próprios eventos
- `configurator`: leitura e parametrização de tipos de evento
- `viewer`: apenas leitura

## Publicação
Repositório Git ligado ao projeto Vercel `sport-analist`. A branch principal do GitHub é `main`; a Vercel seleciona `main` por predefinição quando existe. Cada novo commit nesta branch deve desencadear um deployment. Para ativar os dados partilhados, criar o projeto Supabase, definir as variáveis de ambiente, executar as migrações SQL `0001_initial_schema.sql`, `0002_event_moment_and_outcome.sql`, `0003_team_event_association.sql` e `0004_public_match_sharing.sql`, e configurar os URLs de redirecionamento de Auth. Consultar [docs/deployment.md](docs/deployment.md) e [docs/ai-goal-detection.md](docs/ai-goal-detection.md).

## Funcionalidades implementadas
- Player YouTube com leitura do segundo atual e links diretos para cada evento.
- Catálogo bilingue de eventos com combinações de momento e zona; inclui laterais, cantos, livres, saída de bola, saída de redes, saída de baliza, ataque e golo.
- Player a toda a largura; cada botão de evento/zona grava automaticamente o segundo do vídeo, momento (ataque/defesa), zona e resultado/observação opcional.
- Associação persistente de cada evento a uma equipa: ataque à equipa analisada e defesa à equipa adversária.
- Identificação contextual das equipas atacante e defensora em cada evento.
- Atalhos de teclado 1–9, cronologia, filtros, indicadores e exportação CSV.
- Autenticação Supabase, criação de projeto com primeiro administrador e gestão de membros por email/perfil (quando Supabase está configurado).
- Persistência local em modo demonstração.
- Persistência de jogos/eventos e atualizações em tempo real na mesma partida quando Supabase está configurado.
- Partilha pública individual por jogo, com token aleatório, página de consulta de vídeo/cronologia e possibilidade de revogação pelo editor.
- Sugestões de golos a partir do URL YouTube (incluindo vídeos não listados) através de Firebase AI Logic/Gemini; requer consentimento e confirmação do analista.

## Estado e pré-requisitos de produção
O código e a migração estão no repositório; a publicação online ainda não foi ativada. É necessário criar o projeto Supabase, aplicar a migração e importar o repositório na Vercel seguindo [docs/deployment.md](docs/deployment.md). Os planos gratuitos têm quotas e não equivalem a serviço sem limites.
