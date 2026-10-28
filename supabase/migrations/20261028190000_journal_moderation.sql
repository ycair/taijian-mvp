-- Minimal moderation console support for public Journal reports.
alter table public.profiles
  add column if not exists is_admin boolean not null default false;

alter table public.journal_reports
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null;

create index if not exists journal_reports_status_created_idx
  on public.journal_reports(status, created_at);

comment on table public.journal_reports is 'User reports for public Journal moderation; admin reads/writes via execute-command.';
