-- Seed for local demo (mock LINE users UtestA / UtestB)
-- ---------------------------------------------------------------------------

insert into public.profiles (id, line_sub, display_name, timezone)
values
  ('00000000-0000-4000-8000-00000000000a', 'UtestA', 'Test A', 'Asia/Taipei'),
  ('00000000-0000-4000-8000-00000000000b', 'UtestB', 'Test B', 'Asia/Taipei')
on conflict (id) do nothing;

insert into public.households (id, name, owner_id, timezone)
values ('00000000-0000-4000-8000-0000000000f1', '苔間測試家庭', '00000000-0000-4000-8000-00000000000a', 'Asia/Taipei')
on conflict (id) do nothing;

insert into public.household_members (household_id, user_id, role)
values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-00000000000a', 'owner'),
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-00000000000b', 'caretaker')
on conflict do nothing;

update public.profiles
set default_household_id = '00000000-0000-4000-8000-0000000000f1'
where id in ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b');

insert into public.animals (
  id, household_id, name, species, species_label, sex, avatar_color, created_by, updated_by
)
values (
  '00000000-0000-4000-8000-0000000000a1',
  '00000000-0000-4000-8000-0000000000f1',
  '阿肥', 'leopard-gecko', '豹紋守宮', 'unknown', '#7C9A76',
  '00000000-0000-4000-8000-00000000000a',
  '00000000-0000-4000-8000-00000000000a'
)
on conflict (id) do nothing;

insert into public.reminders (
  id, household_id, animal_id, title, type, schedule, timezone, enabled, next_due_at,
  created_by, updated_by
)
values (
  '00000000-0000-4000-8000-0000000000c1',
  '00000000-0000-4000-8000-0000000000f1',
  '00000000-0000-4000-8000-0000000000a1',
  '餵食', 'feeding',
  '{"kind":"daily","times":["08:30"]}'::jsonb,
  'Asia/Taipei', true, now(),
  '00000000-0000-4000-8000-00000000000a',
  '00000000-0000-4000-8000-00000000000a'
)
on conflict (id) do nothing;

insert into public.line_users (line_sub, user_id, display_name, status)
values
  ('UtestA', '00000000-0000-4000-8000-00000000000a', 'Test A', 'active'),
  ('UtestB', '00000000-0000-4000-8000-00000000000b', 'Test B', 'active')
on conflict (line_sub) do update set user_id = excluded.user_id, status = excluded.status;
