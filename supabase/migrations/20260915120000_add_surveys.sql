-- Sistema de pesquisas (menu Ferramentas): landing page pública de pesquisa (link ou NFC),
-- com perguntas configuráveis e respostas tabuladas no próprio CRM.
create table if not exists surveys (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text,
  questions jsonb not null default '[]'::jsonb, -- [{id, type, label, required, options?}]
  is_active boolean not null default true,
  thank_you_message text not null default 'Obrigado por participar da pesquisa!',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists survey_responses (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references surveys(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb, -- {questionId: value}
  source text, -- ex: 'nfc', 'link', 'qrcode'
  created_at timestamptz not null default now()
);

create index if not exists survey_responses_survey_id_idx on survey_responses (survey_id, created_at desc);
