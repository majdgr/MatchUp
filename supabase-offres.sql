-- =====================================================
-- MatchUp - supabase-offres.sql
-- Ordre d'exécution : 2 (après supabase-setup.sql)
-- À coller et exécuter dans le SQL Editor de votre projet
-- Supabase (jamais depuis le navigateur).
--
-- Contenu :
--   1. public.opportunities : une offre de stage / part time
--   2. public.applications  : une candidature étudiant -> offre
--   3. public.paiements     : frais de mise en relation réglés
--      par l'entreprise quand un accord est conclu
--   4. droits SQL + politiques RLS
--   5. fonctions métier (SECURITY DEFINER) : le navigateur ne
--      décide jamais du score, du statut ni du montant
--   6. fonctions de score, de candidature et de paiement
--
-- Ce script est relançable (CREATE ... IF NOT EXISTS,
-- CREATE OR REPLACE FUNCTION, DROP POLICY IF EXISTS).
-- =====================================================

-- -----------------------------------------------------
-- 1. Opportunités
--    entreprise_nom est un instantané du profil entreprise :
--    les visiteurs non connectés voient le nom de l'entreprise
--    sans accéder aux profils.
-- -----------------------------------------------------
create table if not exists public.opportunities (
  id             uuid primary key default gen_random_uuid(),
  entreprise_id  uuid not null references auth.users (id) on delete cascade,
  entreprise_nom text not null default '',
  titre          text not null check (char_length(titre) between 3 and 140),
  type           text not null default 'stage'
                 constraint opportunities_type_check check (type in ('stage', 'part_time')),
  description    text not null default '',
  competences    jsonb not null default '[]'::jsonb,
  ville          text not null default '',
  duree          text not null default '',
  remuneration   text not null default '',
  places         integer not null default 1 check (places between 1 and 50),
  statut         text not null default 'ouverte'
                 constraint opportunities_statut_check check (statut in ('ouverte', 'pourvue', 'fermee')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.opportunities is
  'Offres de stage et de part time publiées par les entreprises.';
comment on column public.opportunities.competences is
  'Compétences EXIGÉES : tableau JSON de chaînes, comparé au profil de l''étudiant.';

create index if not exists opportunities_statut_idx on public.opportunities (statut, created_at desc);
create index if not exists opportunities_entreprise_idx on public.opportunities (entreprise_id, created_at desc);

-- -----------------------------------------------------
-- 2. Candidatures
--    entreprise_id est dénormalisé pour que le RLS puisse
--    répondre « l'entreprise a-t-elle reçu cette ligne ? »
--    sans jointure. Les colonnes offre_* sont un instantané
--    de l'offre au moment de la candidature.
-- -----------------------------------------------------
create table if not exists public.applications (
  id             uuid primary key default gen_random_uuid(),
  opportunite_id uuid not null references public.opportunities (id) on delete cascade,
  etudiant_id    uuid not null references auth.users (id) on delete cascade,
  entreprise_id  uuid not null references auth.users (id) on delete cascade,
  offre_titre    text not null default '',
  offre_type     text not null default 'stage',
  offre_ville    text not null default '',
  entreprise_nom text not null default '',
  motivation      text not null default '',
  score          integer not null default 0 check (score between 0 and 100),
  statut         text not null default 'en_attente'
                 constraint applications_statut_check
                 check (statut in ('en_attente', 'selectionnee', 'acceptee', 'refusee')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint applications_unique unique (opportunite_id, etudiant_id)
);

comment on table public.applications is
  'Candidatures. score = correspondance profil / compétences exigées, calculé en base.';
comment on column public.applications.statut is
  'en_attente -> selectionnee (ou refusee) -> acceptee / refusee par l''entreprise.';

create index if not exists applications_etudiant_idx on public.applications (etudiant_id, created_at desc);
create index if not exists applications_entreprise_idx on public.applications (entreprise_id, created_at desc);
create index if not exists applications_offre_idx on public.applications (opportunite_id, created_at desc);

-- -----------------------------------------------------
-- 3. Paiements : frais dus par l'entreprise quand un
--    accord est conclu avec un profil. Montants en CENTIMES
--    (entier). Aucune donnée bancaire : paiement simulé.
-- -----------------------------------------------------
create table if not exists public.paiements (
  id             uuid primary key default gen_random_uuid(),
  reference      text not null unique,
  candidature_id uuid not null unique references public.applications (id) on delete cascade,
  opportunite_id uuid not null references public.opportunities (id) on delete cascade,
  entreprise_id  uuid not null references auth.users (id) on delete cascade,
  montant        integer not null check (montant > 0),
  methode        text not null default 'demo' constraint paiements_methode_check check (methode = 'demo'),
  created_at     timestamptz not null default now()
);

comment on table public.paiements is
  'Frais de mise en relation réglés par une entreprise (paiement simulé, aucun encaissement réel).';

create index if not exists paiements_entreprise_idx on public.paiements (entreprise_id, created_at desc);

-- -----------------------------------------------------
-- 4. Row Level Security + droits
-- -----------------------------------------------------
alter table public.opportunities enable row level security;
alter table public.applications enable row level security;
alter table public.paiements enable row level security;

-- 4.1 Opportunités : ouvertes = visibles par tous (même les
--     visiteurs) ; une entreprise voit les siennes, quel que
--     soit leur statut ; l'admin voit et gère tout.
drop policy if exists "opportunities_select" on public.opportunities;
create policy "opportunities_select"
  on public.opportunities
  for select
  to anon, authenticated
  using (statut = 'ouverte' or entreprise_id = auth.uid() or public.est_admin());

-- Un étudiant garde accès à une offre fermée / pourvue sur laquelle
-- il a déjà postulé (pour suivre sa candidature).
drop policy if exists "opportunities_select_candidat" on public.opportunities;
create policy "opportunities_select_candidat"
  on public.opportunities
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.applications a
      where a.opportunite_id = opportunities.id
        and a.etudiant_id = auth.uid()
    )
  );

drop policy if exists "opportunities_insert" on public.opportunities;
create policy "opportunities_insert"
  on public.opportunities
  for insert
  to authenticated
  with check (entreprise_id = auth.uid() and public.mon_role() in ('entreprise', 'admin'));

drop policy if exists "opportunities_update" on public.opportunities;
create policy "opportunities_update"
  on public.opportunities
  for update
  to authenticated
  using (entreprise_id = auth.uid() or public.est_admin())
  with check (entreprise_id = auth.uid() or public.est_admin());

drop policy if exists "opportunities_delete" on public.opportunities;
create policy "opportunities_delete"
  on public.opportunities
  for delete
  to authenticated
  using (entreprise_id = auth.uid() or public.est_admin());

revoke all on public.opportunities from anon;
revoke all on public.opportunities from authenticated;
grant select on public.opportunities to anon, authenticated;
grant insert, update, delete on public.opportunities to authenticated;

-- 4.2 Candidatures : l'étudiant lit les siennes, l'entreprise
--     lit celles reçues sur ses offres, l'admin lit tout.
--     AUCUNE politique INSERT / UPDATE / DELETE : le circuit
--     métier passe exclusivement par les fonctions du § 6.
drop policy if exists "applications_select" on public.applications;
create policy "applications_select"
  on public.applications
  for select
  to authenticated
  using (etudiant_id = auth.uid() or entreprise_id = auth.uid() or public.est_admin());

revoke all on public.applications from anon;
revoke all on public.applications from authenticated;
grant select on public.applications to authenticated;

-- 4.3 Paiements : l'entreprise payeuse et l'admin lisent les
--     reçus. Insertion uniquement via payer_frais().
drop policy if exists "paiements_select" on public.paiements;
create policy "paiements_select"
  on public.paiements
  for select
  to authenticated
  using (entreprise_id = auth.uid() or public.est_admin());

revoke all on public.paiements from anon;
revoke all on public.paiements from authenticated;
grant select on public.paiements to authenticated;

-- 4.4 Relais de updated_at sur les tables du circuit
drop trigger if exists opportunities_touch on public.opportunities;
create trigger opportunities_touch
  before update on public.opportunities
  for each row execute function public.touch_updated_at();

drop trigger if exists applications_touch on public.applications;
create trigger applications_touch
  before update on public.applications
  for each row execute function public.touch_updated_at();

-- 4.5 Une entreprise peut lire le profil d'un étudiant
--     UNIQUEMENT si cet étudiant lui a envoyé une candidature.
drop policy if exists "profiles_select_candidats" on public.profiles;
create policy "profiles_select_candidats"
  on public.profiles
  for select
  to authenticated
  using (
    public.mon_role() = 'entreprise'
    and exists (
      select 1
      from public.applications a
      where a.etudiant_id = profiles.user_id
        and a.entreprise_id = auth.uid()
    )
  );

-- 4.6 Lecture du CV par une entreprise : uniquement le CV d'un
--     étudiant qui lui a envoyé une candidature.
drop policy if exists "cvs_lecture_candidats" on storage.objects;
create policy "cvs_lecture_candidats"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'cvs'
    and exists (
      select 1
      from public.applications a
      join public.profiles p on p.user_id = a.etudiant_id
      where a.entreprise_id = auth.uid()
        and p.cv_path = storage.objects.name
    )
  );

-- -----------------------------------------------------
-- 5. Fonction de score
--    Comparaison des compétences exigées de l'offre avec
--     celles déclarées par l'étudiant. Comparaison sans
--    casse, accepte les variantes partielles (« js » dans
--    « javascript »). Renvoie 0 à 100.
-- -----------------------------------------------------
create or replace function public.calculer_score(p_etudiant uuid, p_opportunite uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_requises  jsonb;
  v_mines     jsonb;
  v_total     integer := 0;
  v_ok        integer := 0;
  v_attendue  text;
  v_mienne    text;
  v_trouve    boolean;
begin
  select o.competences into v_requises
    from public.opportunities o
   where o.id = p_opportunite;

  if v_requises is null then
    return 0;
  end if;

  select coalesce(p.competences, '[]'::jsonb) into v_mines
    from public.profiles p
   where p.user_id = p_etudiant;

  v_mines := coalesce(v_mines, '[]'::jsonb);

  -- Aucune compétence exigée : correspondance neutre (50 %)
  if jsonb_typeof(v_requises) <> 'array' or jsonb_array_length(v_requises) = 0 then
    return 50;
  end if;

  if jsonb_typeof(v_mines) <> 'array' or jsonb_array_length(v_mines) = 0 then
    return 0;
  end if;

  for v_attendue in
    select lower(trim(mot)) from jsonb_array_elements_text(v_requises) as t(mot)
  loop
    continue when v_attendue is null or v_attendue = '';
    v_total := v_total + 1;
    v_trouve := false;

    for v_mienne in
      select lower(trim(mot)) from jsonb_array_elements_text(v_mines) as t(mot)
    loop
      continue when v_mienne is null or v_mienne = '';
      if v_mienne = v_attendue
         or (length(v_mienne) >= 3 and position(v_mienne in v_attendue) > 0)
         or (length(v_attendue) >= 3 and position(v_attendue in v_mienne) > 0) then
        v_trouve := true;
        exit;
      end if;
    end loop;

    if v_trouve then
      v_ok := v_ok + 1;
    end if;
  end loop;

  if v_total = 0 then
    return 50;
  end if;

  return round((v_ok * 100.0) / v_total)::integer;
end;
$$;

comment on function public.calculer_score(uuid, uuid) is
  'Pourcentage (0-100) de compétences exigées couvertes par le profil de l''étudiant.';

-- -----------------------------------------------------
-- 6. Fonctions métier
--    Toutes sont SECURITY DEFINER, search_path vide, objets
--    qualifiés, propriétaire tiré de auth.uid() JAMAIS du
--    navigateur, EXECUTE réservé aux comptes connectés.
-- -----------------------------------------------------

-- 6.1 Création d'une offre (instantané du nom d'entreprise)
create or replace function public.creer_offre(
  p_titre        text,
  p_type         text,
  p_description  text,
  p_competences  jsonb,
  p_ville        text default '',
  p_duree        text default '',
  p_remuneration text default '',
  p_places       integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_nom    text;
  v_offre  public.opportunities%rowtype;
begin
  if v_uid is null then
    raise exception 'connecte_requis : connectez-vous pour publier une offre.';
  end if;
  if public.mon_role() not in ('entreprise', 'admin') then
    raise exception 'role_invalide : seul un compte entreprise peut publier une offre.';
  end if;
  if p_titre is null or char_length(trim(p_titre)) < 3 then
    raise exception 'titre_invalide : le titre doit faire au moins 3 caractères.';
  end if;
  if p_type is null or p_type not in ('stage', 'part_time') then
    raise exception 'type_invalide : choisissez stage ou part_time.';
  end if;
  if p_competences is null or jsonb_typeof(p_competences) <> 'array' then
    raise exception 'competences_invalides : indiquez au moins une compétence exigée.';
  end if;
  if jsonb_array_length(p_competences) = 0 then
    raise exception 'competences_invalides : indiquez au moins une compétence exigée.';
  end if;
  if p_places is null or p_places < 1 or p_places > 50 then
    raise exception 'places_invalides : le nombre de places doit être compris entre 1 et 50.';
  end if;

  select coalesce(nullif(trim(profil.entreprise_nom), ''), 'Entreprise')
    into v_nom
    from public.profiles profil
   where profil.user_id = v_uid;

  insert into public.opportunities
    (entreprise_id, entreprise_nom, titre, type, description, competences,
     ville, duree, remuneration, places, statut)
  values
    (v_uid, coalesce(v_nom, 'Entreprise'), trim(p_titre), p_type,
     coalesce(p_description, ''), p_competences,
     coalesce(p_ville, ''), coalesce(p_duree, ''), coalesce(p_remuneration, ''),
     p_places, 'ouverte')
  returning * into v_offre;

  return jsonb_build_object('offre', to_jsonb(v_offre));
end;
$$;

-- 6.2 Candidature à une offre
create or replace function public.postuler(
  p_opportunite_id uuid,
  p_motivation     text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_offre     public.opportunities%rowtype;
  v_existante public.applications%rowtype;
  v_score     integer;
begin
  if v_uid is null then
    raise exception 'connecte_requis : connectez-vous pour envoyer une candidature.';
  end if;
  if public.mon_role() <> 'etudiant' then
    raise exception 'role_invalide : seuls les étudiants peuvent postuler.';
  end if;
  if p_motivation is null or char_length(trim(p_motivation)) < 20 then
    raise exception 'motivation_courte : la lettre de motivation doit contenir au moins 20 caractères.';
  end if;

  select * into v_offre
    from public.opportunities
   where id = p_opportunite_id;

  if not found then
    raise exception 'offre_inconnue : cette opportunité n''existe plus.';
  end if;
  if v_offre.statut <> 'ouverte' then
    raise exception 'offre_fermee : cette opportunité n''est plus ouverte aux candidatures.';
  end if;

  select * into v_existante
    from public.applications
   where opportunite_id = p_opportunite_id
     and etudiant_id = v_uid;

  if found then
    return jsonb_build_object('candidature', to_jsonb(v_existante), 'duplicate', true);
  end if;

  v_score := public.calculer_score(v_uid, p_opportunite_id);

  begin
    insert into public.applications
      (opportunite_id, etudiant_id, entreprise_id, offre_titre, offre_type,
       offre_ville, entreprise_nom, motivation, score, statut)
    values
      (p_opportunite_id, v_uid, v_offre.entreprise_id, v_offre.titre, v_offre.type,
       v_offre.ville, v_offre.entreprise_nom, trim(p_motivation), v_score, 'en_attente')
    returning * into v_existante;
  exception when unique_violation then
    select * into v_existante
      from public.applications
     where opportunite_id = p_opportunite_id
       and etudiant_id = v_uid;
    return jsonb_build_object('candidature', to_jsonb(v_existante), 'duplicate', true);
  end;

  return jsonb_build_object('candidature', to_jsonb(v_existante), 'duplicate', false);
end;
$$;

-- 6.3 Retrait d'une candidature encore en attente
create or replace function public.retirer_candidature(p_candidature_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_lig  public.applications%rowtype;
begin
  if v_uid is null then
    raise exception 'connecte_requis : connectez-vous pour modifier votre candidature.';
  end if;

  select * into v_lig
    from public.applications
   where id = p_candidature_id
     and etudiant_id = v_uid
     for update;

  if not found then
    raise exception 'candidature_inconnue : candidature introuvable.';
  end if;
  if v_lig.statut <> 'en_attente' then
    raise exception 'statut_final : cette candidature a déjà été traitée par l''entreprise.';
  end if;

  delete from public.applications where id = p_candidature_id;
  return jsonb_build_object('retire', true);
end;
$$;

-- 6.4 Changement de statut par l'entreprise (accepter / refuser)
create or replace function public.statuer_candidature(
  p_candidature_id uuid,
  p_statut         text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_lig  public.applications%rowtype;
begin
  if v_uid is null then
    raise exception 'connecte_requis : connectez-vous pour traiter une candidature.';
  end if;
  if p_statut is null or p_statut not in ('en_attente', 'acceptee', 'refusee') then
    raise exception 'statut_invalide : statut non autorisé.';
  end if;

  select * into v_lig
    from public.applications
   where id = p_candidature_id
     for update;

  if not found then
    raise exception 'candidature_inconnue : candidature introuvable.';
  end if;
  if v_lig.entreprise_id <> v_uid and not public.est_admin() then
    raise exception 'acces_refuse : cette candidature ne vous appartient pas.';
  end if;

  update public.applications
     set statut = p_statut
   where id = p_candidature_id;

  -- Dé-sélection : l'offre redevient ouverte
  if v_lig.statut = 'selectionnee' and p_statut <> 'selectionnee' then
    update public.opportunities
       set statut = 'ouverte'
     where id = v_lig.opportunite_id
       and statut = 'pourvue';
  end if;

  select * into v_lig from public.applications where id = p_candidature_id;
  return jsonb_build_object('candidature', to_jsonb(v_lig));
end;
$$;

-- 6.5 Sélection du candidat admis : les autres sont refusés
--     et l'offre passe à « pourvue ».
create or replace function public.selectionner_candidature(p_candidature_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_lig  public.applications%rowtype;
begin
  if v_uid is null then
    raise exception 'connecte_requis : connectez-vous pour sélectionner un candidat.';
  end if;

  select * into v_lig
    from public.applications
   where id = p_candidature_id
     for update;

  if not found then
    raise exception 'candidature_inconnue : candidature introuvable.';
  end if;
  if v_lig.entreprise_id <> v_uid and not public.est_admin() then
    raise exception 'acces_refuse : cette candidature ne vous appartient pas.';
  end if;

  update public.applications
     set statut = 'selectionnee'
   where id = p_candidature_id;

  update public.applications
     set statut = 'refusee'
   where opportunite_id = v_lig.opportunite_id
     and id <> p_candidature_id
     and statut in ('en_attente', 'acceptee');

  update public.opportunities
     set statut = 'pourvue'
   where id = v_lig.opportunite_id;

  select * into v_lig from public.applications where id = p_candidature_id;
  return jsonb_build_object('candidature', to_jsonb(v_lig));
end;
$$;

-- 6.6 Paiement des frais de mise en relation, déclenché par
--     l'entreprise UNIQUEMENT quand un accord est conclu
--     (candidature sélectionnée). Idempotent : une candidature
--     ne peut être facturée qu'une seule fois.
create or replace function public.payer_frais(p_candidature_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_frais     constant integer := 15000; -- 150,00 € en centimes
  v_lig       public.applications%rowtype;
  v_existant  public.paiements%rowtype;
  v_reference text;
begin
  if v_uid is null then
    raise exception 'connecte_requis : connectez-vous pour régler les frais.';
  end if;

  select * into v_lig
    from public.applications
   where id = p_candidature_id
     for update;

  if not found then
    raise exception 'candidature_inconnue : candidature introuvable.';
  end if;
  if v_lig.entreprise_id <> v_uid then
    raise exception 'acces_refuse : ce dossier ne vous appartient pas.';
  end if;
  if v_lig.statut <> 'selectionnee' then
    raise exception 'selection_requise : les frais sont dus uniquement après sélection du candidat.';
  end if;

  select * into v_existant
    from public.paiements
   where candidature_id = p_candidature_id;

  if found then
    return jsonb_build_object('paiement', to_jsonb(v_existant), 'montant', v_existant.montant, 'duplicate', true);
  end if;

  v_reference := 'MU-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(md5(random()::text), 1, 6));

  insert into public.paiements
    (reference, candidature_id, opportunite_id, entreprise_id, montant, methode)
  values
    (v_reference, p_candidature_id, v_lig.opportunite_id, v_uid, v_frais, 'demo')
  returning * into v_existant;

  return jsonb_build_object('paiement', to_jsonb(v_existant), 'montant', v_frais, 'duplicate', false);
end;
$$;

-- -----------------------------------------------------
-- 7. Droits d'exécution : navigateur connecté uniquement
-- -----------------------------------------------------
revoke all on function public.creer_offre(text, text, text, jsonb, text, text, text, integer) from public;
revoke all on function public.postuler(uuid, text) from public;
revoke all on function public.retirer_candidature(uuid) from public;
revoke all on function public.statuer_candidature(uuid, text) from public;
revoke all on function public.selectionner_candidature(uuid) from public;
revoke all on function public.payer_frais(uuid) from public;
revoke all on function public.calculer_score(uuid, uuid) from public;

grant execute on function public.calculer_score(uuid, uuid) to authenticated;
grant execute on function public.creer_offre(text, text, text, jsonb, text, text, text, integer) to authenticated;
grant execute on function public.postuler(uuid, text) to authenticated;
grant execute on function public.retirer_candidature(uuid) to authenticated;
grant execute on function public.statuer_candidature(uuid, text) to authenticated;
grant execute on function public.selectionner_candidature(uuid) to authenticated;
grant execute on function public.payer_frais(uuid) to authenticated;

-- -----------------------------------------------------
-- 8. Vérification
-- -----------------------------------------------------
select
  'opportunities' as table_re,
  (select count(*) from public.opportunities) as lignes,
  (select relrowsecurity from pg_class where oid = 'public.opportunities'::regclass) as rls_actif
union all
select
  'applications',
  (select count(*) from public.applications),
  (select relrowsecurity from pg_class where oid = 'public.applications'::regclass)
union all
select
  'paiements',
  (select count(*) from public.paiements),
  (select relrowsecurity from pg_class where oid = 'public.paiements'::regclass)
union all
select
  'politiques RLS',
  (select count(*) from pg_policies where schemaname = 'public'),
  (select count(*) from pg_proc where proname in
     ('postuler', 'selectionner_candidature', 'payer_frais', 'creer_offre', 'calculer_score'));
