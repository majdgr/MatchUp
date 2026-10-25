-- =====================================================
-- MatchUp - supabase-admin.sql
-- Ordre d'exécution : 3 (après supabase-setup.sql et
-- supabase-offres.sql, et après création + confirmation du
-- compte administrateur).
--
-- Objectif : donner le rôle admin à UN compte existant et
-- vérer que son profil existe.
--
-- Compte cible de MatchUp (UUID déjà relevé dans
-- Authentication → Users) :
--   e-mail : majdgara9@gmail.com
--   UUID   : 79597383-a1ae-47df-9770-c76eb890f8dc
--
-- Si vous utilisez un autre compte, remplacez la valeur de
-- `cible` ci-dessous. Cette attribution se fait TOUJOURS dans
-- le SQL Editor, jamais depuis le navigateur : aucune fonction
-- du site ne permet de s'attribuer le rôle admin.
-- =====================================================

do $$
declare
  cible      constant text := '79597383-a1ae-47df-9770-c76eb890f8dc';
  identifiant uuid;
  v_prenom    text;
  v_nom       text;
  v_email     text;
begin
  -- Garde-fou : le script n'a pas été adapté
  if cible = 'VOTRE-UUID' then
    raise exception 'Remplacez VOTRE-UUID par le vrai identifiant de votre compte (Supabase > Authentication > Users).';
  end if;

  -- Vérification des tables
  if to_regclass('public.user_roles') is null then
    raise exception 'Table public.user_roles absente : exécutez d''abord supabase-setup.sql dans le SQL Editor.';
  end if;
  if to_regclass('public.profiles') is null then
    raise exception 'Table public.profiles absente : exécutez d''abord supabase-setup.sql dans le SQL Editor.';
  end if;

  -- Vérification du format UUID
  begin
    identifiant := cible::uuid;
  exception
    when invalid_text_representation then
      raise exception 'La valeur "%" n''est pas un UUID valide.', cible;
  end;

  -- Vérification : le compte doit exister dans Supabase Auth
  if not exists (select 1 from auth.users where id = identifiant) then
    raise exception 'Aucun compte Auth avec l''UUID %. Vérifiez Authentication > Users.', identifiant;
  end if;

  -- Attribution du rôle (insertion ou mise à jour)
  insert into public.user_roles (user_id, role)
  values (identifiant, 'admin')
  on conflict (user_id) do update set role = excluded.role;

  -- Profil assuré (compte créé avant la mise en place du trigger)
  select u.email,
         coalesce(u.raw_user_meta_data ->> 'prenom', ''),
         coalesce(u.raw_user_meta_data ->> 'nom', '')
    into v_email, v_prenom, v_nom
    from auth.users u
   where u.id = identifiant;

  insert into public.profiles (user_id, email, prenom, nom)
  values (identifiant, coalesce(v_email, ''), v_prenom, v_nom)
  on conflict (user_id) do update set email = excluded.email;

  raise notice 'Rôle admin attribué à %.', identifiant;
end $$;

-- Résultat attendu : une ligne avec role = 'admin'
select u.email, r.role, r.created_at
from public.user_roles r
join auth.users u on u.id = r.user_id
order by r.created_at;
