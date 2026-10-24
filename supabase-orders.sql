-- =====================================================
-- MatchUp - supabase-orders.sql
-- Ordre d'exécution : 2 (après supabase-setup.sql)
-- À coller et exécuter dans le SQL Editor de votre projet
-- Supabase (jamais depuis le navigateur).
--
-- Contenu :
--   1. public.orders : une ligne = une candidature (commande)
--   2. droits SQL + politiques RLS
--   3. fonction create_demo_order() : seul moyen de créer
--      une commande depuis le navigateur
--   4. trigger de mise à jour de updated_at
--
-- Ce script est RELANÇABLE : aucune commande existante n'est
-- supprimée ni modifiée (CREATE TABLE IF NOT EXISTS,
-- CREATE OR REPLACE FUNCTION, DROP POLICY IF EXISTS).
-- =====================================================

-- -----------------------------------------------------
-- 1. Table des commandes (candidatures)
--    Montants en CENTIMES (entier) : calcul exact,
--    identique à celui de public.products.price.
-- -----------------------------------------------------
create table if not exists public.orders (
  id                uuid primary key default gen_random_uuid(),
  reference         text not null unique,
  user_id           uuid not null references auth.users (id) on delete cascade,
  attempt_id        text not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  items             jsonb not null,
  delivery_name     text not null,
  delivery_email    text not null,
  delivery_phone    text,
  delivery_city     text,
  delivery_address  text,
  payment_method    text not null default 'demo',
  subtotal          integer not null check (subtotal >= 0),
  shipping          integer not null check (shipping >= 0),
  total             integer not null check (total >= 0),
  status            text not null default 'nouvelle'
                    check (status in ('nouvelle', 'en_preparation', 'terminee', 'annulee')),
  constraint orders_attempt_unique unique (user_id, attempt_id),
  constraint orders_payment_demo check (payment_method = 'demo')
);

comment on table public.orders is
  'Candidatures / commandes de démonstration. Aucune donnée bancaire.';
comment on column public.orders.attempt_id is
  'Identifiant de tentative généré par le navigateur : évite le doublon après une coupure réseau.';
comment on column public.orders.updated_at is
  'Dernière modification : sert à détecter une modification concurrente.';

create index if not exists orders_user_created_idx on public.orders (user_id, created_at desc);
create index if not exists orders_status_idx on public.orders (status, created_at desc);

-- -----------------------------------------------------
-- 2. Row Level Security + droits
--    Le visiteur anonyme n'accède à AUCUNE commande.
--    Le client lit les siennes.
--    L'admin lit tout et ne change QUE le statut.
--    Aucune politique INSERT : la création passe
--    exclusivement par create_demo_order().
-- -----------------------------------------------------
alter table public.orders enable row level security;

drop policy if exists "orders_select_proprietaire_ou_admin" on public.orders;
create policy "orders_select_proprietaire_ou_admin"
  on public.orders
  for select
  to authenticated
  using (user_id = auth.uid() or public.est_admin());

drop policy if exists "orders_admin_update" on public.orders;
create policy "orders_admin_update"
  on public.orders
  for update
  to authenticated
  using (public.est_admin())
  with check (public.est_admin());

revoke all on public.orders from anon;
revoke all on public.orders from authenticated;
grant select on public.orders to authenticated;
grant update (status, updated_at) on public.orders to authenticated;

-- -----------------------------------------------------
-- 3. Fonction de création d'une commande
--    - SECURITY DEFINER, search_path vide, objets qualifiés
--    - propriétaire tiré de auth.uid() JAMAIS envoyé par le navigateur
--    - prix relus dans public.products (jamais crus côté client)
--    - frais fixes appliqués par la base
--    - total du navigateur comparé au total calculé
--    - idempotent : une même tentative ne crée jamais 2 lignes
--    - EXECUTE accordé aux utilisateurs connectés seulement
-- -----------------------------------------------------
create or replace function public.create_demo_order(
  p_attempt_id       text,
  p_items            jsonb,
  p_delivery_name    text,
  p_delivery_email   text,
  p_delivery_phone   text default null,
  p_delivery_city    text default null,
  p_delivery_address text default null,
  p_payment_method   text default 'demo',
  p_expected_total   integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := auth.uid();
  v_existing   public.orders%rowtype;
  v_subtotal   integer := 0;
  v_frais      constant integer := 2000;  -- 20,00 € de frais de dossier simulés
  v_total      integer;
  v_snapshot   jsonb := '[]'::jsonb;
  v_elem       jsonb;
  v_product    public.products%rowtype;
  v_qty        integer;
  v_reference  text;
  v_order      public.orders%rowtype;
begin
  -- Identité obligatoire, tirée de la session
  if v_uid is null then
    raise exception 'connecte_requis : vous devez être connecté(e) pour envoyer une candidature.';
  end if;

  if p_attempt_id is null or char_length(trim(p_attempt_id)) < 8 then
    raise exception 'tentative_invalide : identifiant de tentative manquant, rechargez la page.';
  end if;

  -- Rejeu après erreur réseau : on renvoie la commande déjà créée
  select * into v_existing
    from public.orders
   where user_id = v_uid
     and attempt_id = trim(p_attempt_id);
  if found then
    return jsonb_build_object('order', to_jsonb(v_existing), 'duplicate', true);
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'panier_vide : aucun service dans la candidature.';
  end if;

  if p_delivery_name is null or char_length(trim(p_delivery_name)) < 2 then
    raise exception 'coordonnees_invalides : le nom est obligatoire.';
  end if;
  if p_delivery_email is null or position('@' in p_delivery_email) = 0 then
    raise exception 'coordonnees_invalides : l''adresse e-mail est obligatoire.';
  end if;
  if p_payment_method is distinct from 'demo' then
    raise exception 'paiement_invalide : seul le paiement de démonstration est accepté.';
  end if;

  -- Validation ligne par ligne + calcul des montants dans la base
  for v_elem in select * from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_elem) <> 'object' then
      raise exception 'panier_invalide : format de panier incorrect.';
    end if;

    begin
      v_qty := (v_elem ->> 'quantity')::integer;
    exception when others then
      raise exception 'quantite_invalide : quantité incorrecte.';
    end;

    if v_qty is null or v_qty < 1 or v_qty > 50 then
      raise exception 'quantite_invalide : la quantité doit être comprise entre 1 et 50.';
    end if;

    select * into v_product
      from public.products
     where id = (v_elem ->> 'id');

    if not found then
      raise exception 'service_inconnu : le service "%" n''existe plus dans le catalogue.',
        coalesce(v_elem ->> 'id', '?');
    end if;

    if not v_product.is_available then
      raise exception 'service_indisponible : "%" n''est plus disponible.', v_product.name;
    end if;

    v_subtotal := v_subtotal + (v_product.price * v_qty);

    -- Instantané : nom et prix historiques conservés même si le catalogue change
    v_snapshot := v_snapshot || jsonb_build_array(
      jsonb_build_object(
        'id',       v_product.id,
        'name',     v_product.name,
        'category', v_product.category,
        'price',    v_product.price,
        'quantity', v_qty
      )
    );
  end loop;

  v_total := v_subtotal + v_frais;

  -- Détection d'un changement de prix entre l'affichage et la validation
  if p_expected_total is not null and p_expected_total <> v_total then
    raise exception 'prix_modifie : le total affiché (%) ne correspond plus au total calculé (%). Recarrez le panier.',
      p_expected_total, v_total;
  end if;

  v_reference := 'MU-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(md5(random()::text), 1, 6));

  insert into public.orders (
    reference, user_id, attempt_id, items,
    delivery_name, delivery_email, delivery_phone, delivery_city, delivery_address,
    payment_method, subtotal, shipping, total, status
  ) values (
    v_reference, v_uid, trim(p_attempt_id), v_snapshot,
    trim(p_delivery_name), lower(trim(p_delivery_email)),
    nullif(trim(coalesce(p_delivery_phone, '')), ''),
    nullif(trim(coalesce(p_delivery_city, '')), ''),
    nullif(trim(coalesce(p_delivery_address, '')), ''),
    'demo', v_subtotal, v_frais, v_total, 'nouvelle'
  )
  returning * into v_order;

  return jsonb_build_object('order', to_jsonb(v_order), 'duplicate', false);
end;
$$;

comment on function public.create_demo_order(text, jsonb, text, text, text, text, text, text, integer) is
  'Crée une candidature de démonstration : prix calculés dans la base, propriétaire = auth.uid(), rejeu sans doublon.';

revoke all on function public.create_demo_order(text, jsonb, text, text, text, text, text, text, integer) from public;
revoke execute on function public.create_demo_order(text, jsonb, text, text, text, text, text, text, integer) from anon;
grant execute on function public.create_demo_order(text, jsonb, text, text, text, text, text, text, integer) to authenticated;

-- -----------------------------------------------------
-- 4. updated_at : toujours frais après une modification
-- -----------------------------------------------------
create or replace function public.orders_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists orders_touch on public.orders;
create trigger orders_touch
  before update on public.orders
  for each row
  execute function public.orders_touch_updated_at();

grant execute on function public.orders_touch_updated_at() to authenticated;

-- -----------------------------------------------------
-- 5. Vérification
-- -----------------------------------------------------
select
  'orders créée' as info,
  (select count(*) from public.orders) as commandes,
  (select relrowsecurity from pg_class where oid = 'public.orders'::regclass) as rls_actif,
  (select count(*) from pg_policies where tablename = 'orders') as politiques;
