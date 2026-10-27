\set ON_ERROR_STOP on
begin;
do $$
declare
  col text;
begin
  for col in select unnest(array['record_visibility','public_token','public_at']) loop
    if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='animals' and column_name=col) then
      raise exception 'animals.% missing', col;
    end if;
  end loop;
end $$;
select 'public resident records schema OK' as result;
rollback;
