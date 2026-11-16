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
- `analyst`: leitura e criação/edição dos seus eventos
- `configurator`: leitura e parametrização de tipos de evento
- `viewer`: apenas leitura

## Publicação
Importar este repositório na Vercel e definir as variáveis Supabase. Ligar o projeto Supabase, executar a migração SQL e configurar os URLs de redirecionamento de Auth. O deploy de produção pode ser feito a partir da branch `main`.

## Estado
Primeira fundação técnica. A integração de serviços externos depende da configuração dos respetivos projetos e credenciais.
