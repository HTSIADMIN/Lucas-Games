-- Hat slot for stacking cosmetics on the avatar (color + frame + hat).
alter table users add column if not exists equipped_hat text;
