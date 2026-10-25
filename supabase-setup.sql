-- =====================================================
-- MatchUp - supabase-setup.sql
-- Ordre d'exécution : 1
-- À coller et exécuter dans le SQL Editor de votre projet
-- Supabase (jamais depuis le navigateur).
--
-- Contenu :
--   1. public.user_roles : rôle etudiant / entreprise / admin
--   2. public.profiles   : profil étudiant ET profil entreprise
--   3. fonctions de rôle : est_admin(), mon_role(), touch_updated_at()
--   4. trigger d'inscription : rôle + profil créés avec le compte
--   5. conteneur Supabase Storage « cvs » (dépôt de CV) + politiques
--   6. droits SQL + politiques RLS
--   7. nettoyage de l'ancien modèle boutique (products / orders)
--
-- Ce script est relançable : il ne supprime ni n'écrase aucune
-- donnée utile (CREATE ... IF NOT EXISTS, ON CONFLICT DO NOTHING,
-- DROP POLICY IF EXISTS, DROP TRIGGER IF EXISTS).
-- =====================================================

-- -----------------------------------------------------
-- 1. Table des rôles
--    user_id référence auth.users.id : les mots de passe
--    restent uniquement dans Supabase Auth.
--    Absence de ligne = compte étudiant (valeur par défaut).
--    Le rôle admin ne s'attribue QUE via SQL (fichier 3).
-- -----------------------------------------------------
create table if not exists public.user_roles (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  role        text not null default 'etudiant'
              constraint user_roles_role_check check (role in ('etudiant', 'entreprise', 'admin')),
  created_at  timestamptz not null default now()
);

comment on table public.user_roles is
  'Rôle de chaque compte : etudiant, entreprise ou admin. Attribué à l''inscription ou via le SQL Editor.';

-- Migration de l'ancien modèle boutique : 'client' devient 'etudiant'.
alter table public.user_roles drop constraint if exists user_roles_role_check;
update public.user_roles set role = 'etudiant' where role = 'client';
alter table public.user_roles
  add constraint user_roles_role_check check (role in ('etudiant', 'entreprise', 'admin'));
alter table public.user_roles alter column role set default 'etudiant';

-- -----------------------------------------------------
-- 2. Profils : une ligne par compte, les deux métiers
--    dans la même table (colonnes ignorées selon le rôle).
--    email / prenom / nom sont renseignés par le trigger
--    d'inscription ; tout le reste est saisi par l'utilisateur.
--    cv_path = chemin du CV dans le conteneur « cvs ».
-- -----------------------------------------------------
create table if not exists public.profiles (
  user_id            uuid primary key references auth.users (id) on delete cascade,
  email              text not null default '',
  prenom             text not null default '',
  nom                text not null default '',
  telephone          text not null default '',
  ville              text not null default '',
  bio                text not null default '',
  -- Étudiant
  etablissement      text not null default '',
  diplome            text not null default '',
  annee              text not null default '',
  competences        jsonb not null default '[]'::jsonb,
  disponibilite      text not null default 'les_deux'
                     constraint profiles_disponibilite_check
                     check (disponibilite in ('stage', 'part_time', 'les_deux')),
  cv_path            text,
  -- Entreprise
  entreprise_nom     text not null default '',
  entreprise_secteur text not null default '',
  entreprise_site    text not null default '',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.profiles is
  'Profil étudiant (etablissement, competences, cv_path) et profil entreprise (entreprise_*).';
comment on column public.profiles.competences is
  'Compétences nommées de l''étudiant, tableau JSON de chaînes (ex. ["JavaScript","SQL"]).';
comment on column public.profiles.cv_path is
  'Chemin du CV dans le conteneur cvs : <user_id>/cv-...pdf (conteneur privé).';

create index if not exists profiles_cv_path_idx on public.profiles (cv_path);

-- -----------------------------------------------------
-- 3. Fonctions de rôle (SECURITY DEFINER, search_path vide,
--    objets qualifiés, contrôle d'identité via auth.uid()).
--    AUCUNE fonction ne permet de s'attribuer un rôle.
-- -----------------------------------------------------
create or replace function public.est_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles r
    where r.user_id = auth.uid()
      and r.role = 'admin'
  );
$$;

comment on function public.est_admin() is
  'Vrai si l''utilisateur connecté possède le rôle admin (lecture seule).';

create or replace function public.mon_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select role from public.user_roles where user_id = auth.uid()),
    'etudiant'
  );
$$;

comment on function public.mon_role() is
  'Rôle du compte connecté : etudiant (défaut), entreprise ou admin.';

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.est_admin() from public;
revoke all on function public.mon_role() from public;
revoke all on function public.touch_updated_at() from public;
grant execute on function public.est_admin() to anon, authenticated;
grant execute on function public.mon_role() to anon, authenticated;
grant execute on function public.touch_updated_at() to authenticated;

-- -----------------------------------------------------
-- 4. Trigger d'inscription : à chaque compte créé, on
--    crée son rôle et son profil.
--    Le rôle est lu dans les métadonnées de la session :
--    seul 'entreprise' est honoré, tout le reste devient
--    'etudiant'. Le rôle 'admin' n'est JAMAIS obtenu ici.
-- -----------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_roles (user_id, role)
  values (
    new.id,
    case when new.raw_user_meta_data ->> 'role' = 'entreprise'
         then 'entreprise' else 'etudiant' end
  )
  on conflict (user_id) do nothing;

  insert into public.profiles (user_id, email, prenom, nom)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'prenom', ''),
    coalesce(new.raw_user_meta_data ->> 'nom', '')
  )
  on conflict (user_id) do update set email = excluded.email;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Crée automatiquement le rôle et le profil d''un nouveau compte (trigger auth.users).';

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------
-- 5. Conteneur de CV (Supabase Storage)
--    Conteneur PRIVÉ : un CV n'est lisible que par son
--    propriétaire, l'administrateur, et l'entreprise à qui
--    l'étudiant a envoyé une candidature (voir fichier 2).
-- -----------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cvs', 'cvs', false, 3145728,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "cvs_depot" on storage.objects;
create policy "cvs_depot"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'cvs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "cvs_lecture_proprietaire" on storage.objects;
create policy "cvs_lecture_proprietaire"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'cvs'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.est_admin()
    )
  );

drop policy if exists "cvs_effacement" on storage.objects;
create policy "cvs_effacement"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'cvs'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.est_admin()
    )
  );

-- -----------------------------------------------------
-- 6. Row Level Security + droits explicites
-- -----------------------------------------------------
alter table public.user_roles enable row level security;
alter table public.profiles enable row level security;

-- 6.1 user_roles : chacun ne lit QUE sa propre ligne, l'admin lit tout.
--     Seul l'admin peut modifier un rôle (aucun droit d'insertion
--     ni de suppression depuis le navigateur).
drop policy if exists "user_roles_select" on public.user_roles;
create policy "user_roles_select"
  on public.user_roles
  for select
  to authenticated
  using (user_id = auth.uid() or public.est_admin());

drop policy if exists "user_roles_admin_update" on public.user_roles;
create policy "user_roles_admin_update"
  on public.user_roles
  for update
  to authenticated
  using (public.est_admin())
  with check (public.est_admin());

revoke all on public.user_roles from anon;
revoke all on public.user_roles from authenticated;
grant select on public.user_roles to authenticated;
grant update (role) on public.user_roles to authenticated;

-- 6.2 profiles : chacun lit et modifie SON profil ; l'admin lit tout.
--     La lecture du profil d'un étudiant par une entreprise est
--     ajoutée dans supabase-offres.sql (la table applications
--     n'existe pas encore à ce stade).
drop policy if exists "profiles_select_moi" on public.profiles;
create policy "profiles_select_moi"
  on public.profiles
  for select
  to authenticated
  using (user_id = auth.uid() or public.est_admin());

drop policy if exists "profiles_insert_moi" on public.profiles;
create policy "profiles_insert_moi"
  on public.profiles
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "profiles_update_moi" on public.profiles;
create policy "profiles_update_moi"
  on public.profiles
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.profiles from anon;
revoke all on public.profiles from authenticated;
grant select, insert, update on public.profiles to authenticated;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch
  before update on public.profiles
  for each row
  execute function public.touch_updated_at();

-- -----------------------------------------------------
-- 7. Nettoyage de l'ancien modèle « boutique »
--    Le site ne vend plus de services : ces tables et la
--    fonction create_demo_order() ne servent plus.
-- -----------------------------------------------------
drop function if exists public.create_demo_order(text, jsonb, text, text, text, text, text, text, integer);
drop table if exists public.orders cascade;
drop table if exists public.products cascade;

-- -----------------------------------------------------
-- 8. Vérification (à lire dans le résultat de la requête)
-- -----------------------------------------------------
select
  'user_roles' as table_re,
  (select count(*) from public.user_roles) as lignes,
  (select relrowsecurity from pg_class where oid = 'public.user_roles'::regclass) as rls_actif
union all
select
  'profiles',
  (select count(*) from public.profiles),
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass)
union all
select
  'bucket cvs',
  (select count(*) from storage.buckets where id = 'cvs'),
  (select count(*) from pg_policies where tablename = 'objects' and policyname like 'cvs_%');
