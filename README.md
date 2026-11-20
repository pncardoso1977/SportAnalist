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
Requer Node.js 24.x (ver `.nvmrc` e `engines` em `package.json`).

```bash
npm install
cp .env.example .env.local
npm run dev
```

Sem variáveis Supabase, a interface funciona em modo demonstração com persistência local no browser. Para autenticação e sincronização multiutilizador da análise técnico-tática, configure as variáveis Supabase e aplique as migrações `0001_initial_schema.sql` a `0005_live_player_time_tracking.sql`. Para a área pública de jogo ao vivo sem autenticação, aplique também `0006_public_live_match_access.sql`, `0007_live_player_display_names.sql` e `0008_public_live_twelfth_player.sql`, `0009_portela_senior_roster_and_match_selection.sql` e `0010_amportela_juniores_roster_and_fixed_analysed_team.sql`, `0011_live_match_home_away_flag.sql` e `0012_amportela_iniciados_and_callups.sql` e `0013_live_match_squad_up_to_twelve.sql` e `0014_delete_scheduled_live_match.sql` e `0015_amportela_infantis_sub13_roster.sql` e `0016_amportela_benjamins_traquinas_rosters.sql` e `0017_live_match_callup_limits_by_age_group.sql` e `0018_live_match_halftime_reports.sql` e `0019_import_finished_public_live_matches.sql` e `0020_repair_live_match_import.sql`.

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
Repositório Git ligado ao projeto Vercel `sport-analist`. A branch principal do GitHub é `main`; a Vercel seleciona `main` por predefinição quando existe. Cada novo commit nesta branch deve desencadear um deployment. Para ativar os dados partilhados, criar o projeto Supabase, definir as variáveis de ambiente, executar as migrações SQL `0001_initial_schema.sql` a `0005_live_player_time_tracking.sql`, `0006_public_live_match_access.sql`, `0007_live_player_display_names.sql` e `0008_public_live_twelfth_player.sql`, `0009_portela_senior_roster_and_match_selection.sql` e `0010_amportela_juniores_roster_and_fixed_analysed_team.sql`, e configurar os URLs de redirecionamento de Auth. Consultar [docs/deployment.md](docs/deployment.md) e [docs/ai-goal-detection.md](docs/ai-goal-detection.md).

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
- Área pública e responsiva de jogo ao vivo em `/jogo-ao-vivo`, sem autenticação ou perfis, com criação de jogos, AMPortela como equipa analisada fixa, identificação casa/fora no formulário e seleção de convocados por competição (mínimo de 1 jogador; Seniores até 14, Juniores/Juvenis/Iniciados/Infantis até 12 e Benjamins/Traquinas até 15) (Traquinas, Benjamins Sub-11 (duas competições com o mesmo plantel), Infantis Sub-13, Iniciados Sub-15, Juvenis Sub-17, Juniores Sub-19 ou Seniores Masculinos), com chamada opcional apenas do escalão imediatamente inferior (incluindo Benjamins para Infantis e Traquinas para Benjamins), cronómetro com confirmação de início, pausa e fim, registo de um único intervalo, relatórios por jogador da 1.ª parte, 2.ª parte e jogo completo, imagens PNG e exportação CSV, substituições, nomes curtos editáveis por jogo e cálculo automático do tempo em campo; página pública de consulta em `/jogo-ao-vivo/[id]`. A vista operacional é compacta e desenhada para caber no ecrã do telemóvel. A lista de jogos disponíveis mostra apenas jogos ainda não iniciados e permite remover um jogo agendado. Os jogos públicos terminados são sincronizados automaticamente para o histórico do projeto AMPortela; podem ser abertos sem vídeo, consultar os tempos das duas partes e do total, e associar posteriormente um URL YouTube para iniciar a análise.

## Estado e pré-requisitos de produção
O código e a migração estão no repositório; a publicação online ainda não foi ativada. É necessário criar o projeto Supabase, aplicar a migração e importar o repositório na Vercel seguindo [docs/deployment.md](docs/deployment.md). Os planos gratuitos têm quotas e não equivalem a serviço sem limites.
