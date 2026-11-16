# SportAnalist

Aplicação web bilingue (PT/EN) para análise técnico-tática de futsal com vídeo YouTube, registo de eventos, timestamps, zonas, estatísticas e colaboração entre analistas.

## Stack
- Next.js App Router + TypeScript
- Tailwind CSS
- Supabase PostgreSQL, Auth e Realtime (configuração opcional)
- YouTube IFrame Player API
- GitHub Actions para validação

## Arranque local
```bash
npm install
cp .env.example .env.local
npm run dev
```

Sem variáveis Supabase, a interface funciona em modo demonstração com persistência local no browser. Para autenticação e sincronização multiutilizador, configure as variáveis Supabase e aplique `supabase/migrations/0001_initial_schema.sql`.

## Variáveis de ambiente
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Nunca colocar chaves secretas no frontend.

## Perfis
- `admin`: gestão integral do projeto, equipa, utilizadores e eventos
- `analyst`: leitura, registo e remoção dos próprios eventos
- `configurator`: leitura e parametrização de tipos de evento
- `viewer`: apenas leitura

## Publicação
Repositório Git ligado ao projeto Vercel `sport-analist`. A branch principal do GitHub é `main`; a Vercel seleciona `main` por predefinição quando existe. Cada novo commit nesta branch deve desencadear um deployment. Para ativar os dados partilhados, criar o projeto Supabase, definir as variáveis de ambiente, executar as migrações SQL `0001_initial_schema.sql` e `0002_event_moment_and_outcome.sql` e configurar os URLs de redirecionamento de Auth. Consultar [docs/deployment.md](docs/deployment.md).

## Funcionalidades implementadas
- Player YouTube com leitura do segundo atual e links diretos para cada evento.
- Catálogo bilingue de eventos com combinações de momento e zona; inclui laterais, cantos, livres, saída de bola, saída de redes, saída de baliza, ataque e golo.
- Player a toda a largura; cada botão de evento/zona grava automaticamente o segundo do vídeo, momento (ataque/defesa), zona e resultado/observação opcional.
- Identificação de ataque e defesa nos eventos de contra.
- Atalhos de teclado 1–9, cronologia, filtros, indicadores e exportação CSV.
- Autenticação Supabase, criação de projeto com primeiro administrador e gestão de membros por email/perfil (quando Supabase está configurado).
- Persistência local em modo demonstração.
- Persistência de jogos/eventos e atualizações em tempo real na mesma partida quando Supabase está configurado.

## Estado e pré-requisitos de produção
O código e a migração estão no repositório; a publicação online ainda não foi ativada. É necessário criar o projeto Supabase, aplicar a migração e importar o repositório na Vercel seguindo [docs/deployment.md](docs/deployment.md). Os planos gratuitos têm quotas e não equivalem a serviço sem limites.
