-- Set the DisMyth owner password, so you can sign into dismyth.app/admin.html
-- with just email + password — no email, no code, no link.
--
-- 1) Replace  CHANGE_ME_to_a_strong_password  with a password you choose.
-- 2) Supabase -> SQL Editor -> New query -> paste -> Run.
-- 3) Sign in at dismyth.app/admin.html with rehan.waris@gmail.com + that password.
-- Safe to re-run any time you want to change the password.

create extension if not exists pgcrypto with schema extensions;

update auth.users
set encrypted_password = extensions.crypt('CHANGE_ME_to_a_strong_password', extensions.gen_salt('bf', 10)),
    email_confirmed_at = coalesce(email_confirmed_at, now()),
    updated_at = now()
where email = 'rehan.waris@gmail.com';
