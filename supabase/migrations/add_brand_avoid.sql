-- Add brand "avoid" field for the AVOID list (words/claims/topics never to use)
do $$
begin
  alter table public.brands add column avoid text not null default '';
exception
  when duplicate_column then null;
end $$;
