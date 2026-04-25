-- ============================================================
-- LUCAS GAMES — 0004 SHOP & COSMETICS
-- ============================================================

create table cosmetic_items (
  id          text primary key,                 -- 'avatar_gold', 'frame_brass', etc.
  kind        text not null,                    -- 'avatar_color' | 'frame' | 'card_deck' | 'theme'
  name        text not null,
  description text,
  price       bigint not null,
  meta        jsonb not null default '{}'::jsonb,
  available   boolean not null default true,
  sort_order  int not null default 0
);

create table player_inventory (
  user_id     uuid not null references users(id) on delete cascade,
  item_id     text not null references cosmetic_items(id),
  acquired_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

-- Equipped slots on the user — added now, before games depend on shop.
alter table users add column if not exists equipped_frame text;
alter table users add column if not exists equipped_card_deck text default 'classic';
alter table users add column if not exists equipped_theme text default 'saloon';

alter table cosmetic_items   enable row level security;
alter table player_inventory enable row level security;

-- Catalog is public.
grant select on cosmetic_items to anon;
revoke all on player_inventory from anon;
