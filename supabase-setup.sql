-- =====================================================
-- MatchUp - supabase-setup.sql
-- Ordre d'exécution : 1
-- À coller et exécuter dans le SQL Editor de votre projet
-- Supabase (jamais depuis le navigateur).
--
-- Contenu :
--   1. public.user_roles  : rôle des comptes (client / admin)
--   2. public.products    : catalogue des services MatchUp
--   3. fonction est_admin() utilitaire de lecture de rôle
--   4. droits SQL + politiques RLS
--   5. données initiales du catalogue
--
-- Ce script est relançable : il ne supprime ni n'écrase aucune
-- table ni aucune donnée existante (CREATE IF NOT EXISTS /
-- ON CONFLICT DO NOTHING).
-- =====================================================

-- -----------------------------------------------------
-- 1. Table des rôles
--    user_id référence auth.users.id : les mots de passe
--    restent uniquement dans Supabase Auth.
--    Absence de ligne = compte client normal.
-- -----------------------------------------------------
create table if not exists public.user_roles (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  role        text not null default 'client',
  created_at  timestamptz not null default now(),
  constraint user_roles_role_check check (role in ('client', 'admin'))
);

comment on table public.user_roles is
  'Rôle de chaque compte : client (défaut) ou admin. Attribué uniquement via SQL Editor.';

-- -----------------------------------------------------
-- 2. Catalogue des services (« produits » du TP)
--    Prix en centimes (entier) : aucune virgule flottante,
--    calcul exact et reproductible côté base.
--    is_available = visible dans la boutique.
-- -----------------------------------------------------
create table if not exists public.products (
  id            text primary key,
  name          text not null check (char_length(name) between 2 and 120),
  category      text not null check (category in ('Stages', 'Jobs', 'Formation')),
  description   text not null default '',
  price         integer not null check (price >= 0 and price <= 1000000),
  image         text not null default '',
  features      jsonb not null default '[]'::jsonb,
  is_available  boolean not null default true,
  created_at    timestamptz not null default now()
);

comment on table public.products is
  'Catalogue des services MatchUp. price est exprimé en centimes.';
comment on column public.products.price is 'Prix en centimes (ex. 2500 = 25,00)';

-- -----------------------------------------------------
-- 3. Lecture du rôle : fonction SECURITY DEFINER
--    - search_path vide et objets qualifiés
--    - contrôle d'identité via auth.uid()
--    - EXECUTE accordé aux utilisateurs connectés seulement
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

-- Accès accordé aux rôles API : la fonction renvoie systématiquement
-- false pour un visiteur (auth.uid() est nul hors connexion).
revoke all on function public.est_admin() from public;
grant execute on function public.est_admin() to anon, authenticated;

-- -----------------------------------------------------
-- 4. Row Level Security activé sur chaque table exposée
--    On ne désactive jamais le RLS pour masquer une erreur.
-- -----------------------------------------------------
alter table public.user_roles enable row level security;
alter table public.products enable row level security;

-- 4.1 user_roles : chacun ne lit QUE sa propre ligne.
--     Aucune politique INSERT / UPDATE / DELETE : le navigateur
--     ne peut changer un rôle, même en étant déjà admin.
drop policy if exists "user_roles_select_moi" on public.user_roles;
create policy "user_roles_select_moi"
  on public.user_roles
  for select
  to authenticated
  using (auth.uid() = user_id);

-- 4.2 products : visiteurs et clients lisent les services visibles ;
--     l'admin lit tout et seul peut modifier le catalogue.
drop policy if exists "products_select_public" on public.products;
create policy "products_select_public"
  on public.products
  for select
  to anon, authenticated
  using (is_available = true or public.est_admin());

drop policy if exists "products_admin_insert" on public.products;
create policy "products_admin_insert"
  on public.products
  for insert
  to authenticated
  with check (public.est_admin());

drop policy if exists "products_admin_update" on public.products;
create policy "products_admin_update"
  on public.products
  for update
  to authenticated
  using (public.est_admin())
  with check (public.est_admin());

drop policy if exists "products_admin_delete" on public.products;
create policy "products_admin_delete"
  on public.products
  for delete
  to authenticated
  using (public.est_admin());

-- 4.3 Droits SQL explicites (défense en profondeur)
revoke all on public.user_roles from anon;
revoke insert, update, delete, truncate, references, trigger on public.user_roles from authenticated;
grant select on public.user_roles to authenticated;

revoke all on public.products from anon;
revoke all on public.products from authenticated;
grant select on public.products to anon, authenticated;
grant insert, update, delete on public.products to authenticated;

-- -----------------------------------------------------
-- 5. Données initiales du catalogue (montants en centimes)
--    Les prix sont des FRAIS DE DOSSIER SIMULÉS :
--    aucun débit réel, aucune donnée bancaire.
-- -----------------------------------------------------
insert into public.products (id, name, category, description, price, image, features, is_available)
values
  ('stage-standard', 'Candidature stage standard', 'Stages',
   'Mise en relation avec un employeur pour un stage correspondant à votre parcours.',
   2500, 'images/stage.jpg',
   '["Profil analysé","3 propositions de stage","Suivi par e-mail"]'::jsonb, true),
  ('stage-prioritaire', 'Candidature stage prioritaire', 'Stages',
   'Traitement prioritaire de votre dossier stage et relances employeurs accélérées.',
   5000, 'images/stage.jpg',
   '["Traitement en 48 h","Profil analysé","Relances employeurs","Suivi dédié"]'::jsonb, true),
  ('emploi-standard', 'Candidature emploi standard', 'Jobs',
   'Mise en relation avec un employeur pour un emploi junior correspondant à vos critères.',
   3500, 'images/candidat-ordinateur.jpg',
   '["Profil analysé","3 offres d''emploi","Suivi par e-mail"]'::jsonb, true),
  ('emploi-prioritaire', 'Candidature emploi prioritaire', 'Jobs',
   'Traitement prioritaire de votre dossier emploi et accès anticipé aux offres.',
   6500, 'images/candidat-ordinateur.jpg',
   '["Traitement en 48 h","Accès anticipé aux offres","Profil analysé","Suivi dédié"]'::jsonb, true),
  ('pack-entreprise', 'Pack employeur - 5 candidatures', 'Formation',
   'Accès à 5 profils étudiants qualifiés pour vos offres, avec analyse de correspondance.',
   15000, 'images/poignee-de-main.jpg',
   '["5 profils qualifiés","Analyse de correspondance","Rapport mensuel"]'::jsonb, true)
on conflict (id) do nothing;

-- -----------------------------------------------------
-- 6. Vérification (à lire dans le résultat de la requête)
-- -----------------------------------------------------
select
  'user_roles créée' as info,
  (select count(*) from public.user_roles) as lignes,
  (select relrowsecurity from pg_class where oid = 'public.user_roles'::regclass) as rls_actif
union all
select
  'products créée',
  (select count(*) from public.products),
  (select relrowsecurity from pg_class where oid = 'public.products'::regclass);
