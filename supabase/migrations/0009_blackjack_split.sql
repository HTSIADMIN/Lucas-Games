-- Allow multiple seat rows per (round_id, user_id) so splits can create
-- additional seats for the same player within the same round.
alter table blackjack_seats drop constraint blackjack_seats_round_id_user_id_key;
