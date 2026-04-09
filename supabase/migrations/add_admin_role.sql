-- Add admin role handling to user_roles:
-- 1. Bootstrap jack@lessismooreemail.com as the first admin
-- 2. Ensure RLS lets admins update other users' roles
-- 3. Default any future unset user_roles.role to 'none'
-- Safe to re-run.

-- Make the column default 'none' for new rows
do $$
begin
  alter table public.user_roles alter column role set default 'none';
exception
  when others then null;
end $$;

-- Upgrade Jack to admin. Looks up via email; no-op if already admin.
update public.user_roles
set role = 'admin'
where lower(email) = 'jack@lessismooreemail.com'
  and role <> 'admin';

-- If Jack signed up but the email column is empty, resolve via auth.users
update public.user_roles ur
set role = 'admin', email = au.email
from auth.users au
where ur.user_id = au.id
  and lower(au.email) = 'jack@lessismooreemail.com'
  and ur.role <> 'admin';

-- RLS: authenticated users can read their own row. Admins can read all and
-- update any row. This is required for the admin to change other users'
-- roles from the team page.
alter table public.user_roles enable row level security;

drop policy if exists "user_roles_read_own" on public.user_roles;
create policy "user_roles_read_own" on public.user_roles
  for select using (auth.uid() = user_id);

drop policy if exists "user_roles_admin_read_all" on public.user_roles;
create policy "user_roles_admin_read_all" on public.user_roles
  for select using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role = 'admin'
    )
  );

drop policy if exists "user_roles_admin_update" on public.user_roles;
create policy "user_roles_admin_update" on public.user_roles
  for update using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role = 'admin'
    )
  );

-- Allow a user to insert their own first row on sign-in (creates the
-- 'none' placeholder the auth-context expects).
drop policy if exists "user_roles_insert_self" on public.user_roles;
create policy "user_roles_insert_self" on public.user_roles
  for insert with check (auth.uid() = user_id);

-- Intentionally NO self-update policy. Users cannot update their own row;
-- only admins can (via user_roles_admin_update above). This prevents
-- self-role-escalation. The auth-context no longer writes back to
-- user_roles on sign-in, so self-update is not needed.
drop policy if exists "user_roles_update_own_email" on public.user_roles;
