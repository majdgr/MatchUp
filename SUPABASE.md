# SUPABASE.md — MatchUp

Guide pas à pas de la connexion de **MatchUp** à Supabase : comptes, rôles,
catalogue de services, candidatures (commandes) et espace d'administration.

**Architecture : aucun backend.** Le site HTML/CSS/JavaScript appelle Supabase
directement depuis le navigateur (bibliothèque Supabase JS v2 + Publishable key).
Pas de serveur applicatif, pas de compilation, pas de Node, pas de Docker.
La sécurité ne repose pas sur le JavaScript : elle est posée dans la base
(droits SQL + Row Level Security).

> Ce fichier décrit les opérations **que vous réalisez vous-même** dans les
> tableaux de bord Supabase, GitHub et Vercel. L'agent a produit le code et les
> scripts SQL ; il n'a exécuté **aucun** SQL dans votre projet et **aucun**
> déploiement.

**Projet Supabase utilisé par MatchUp**

| Élément | Valeur |
| --- | --- |
| Project URL | `https://emgebkkbzcusapxhgxep.supabase.co` |
| Publishable key | `sb_publishable_VOYhuwhMbHZBV0nuwMBqMQ_meiWGyY3` |
| Compte administrateur | `majdgara9@gmail.com` (UUID `79597383-a1ae-47df-9770-c76eb890f8dc`) |
| Mot de passe de la base | à conserver **hors du code** (jamais dans un fichier du site) |

La clé secrète (`sb_secret_…` / `service_role`) et le mot de passe PostgreSQL
n'apparaissent **dans aucun fichier du projet**.

---

## 1. Projet Supabase

1. [supabase.com](https://supabase.com) → connexion.
2. Le projet MatchUp existe déjà : rien à créer.
3. Mot de passe de la base : conservé hors du code.

## 2. URL et Publishable key

**Connect** (ou **Settings → API Keys**) → Project URL + Publishable key.
Ces deux valeurs sont déjà dans `supabase-client.js`.

## 3. Exécuter les scripts SQL (SQL Editor) — ordre strict

| Ordre | Fichier | Contenu |
| --- | --- | --- |
| 1 | `supabase-setup.sql` | `user_roles` (rôles), `products` (catalogue), `est_admin()`, RLS, droits, données initiales |
| 2 | `supabase-orders.sql` | `orders` (candidatures), RLS, fonction `create_demo_order()`, trigger `updated_at` |
| 3 | `supabase-admin.sql` | Attribution du rôle admin à `majdgara9@gmail.com` (UUID déjà renseigné) |

Pour chaque fichier : **SQL Editor → New query → coller → Run**.

Vérifications attendues dans le résultat :

* `supabase-setup.sql` → deux lignes : `user_roles créée … rls_actif = t` et `products créée … rls_actif = t` (5 services).
* `supabase-orders.sql` → `orders créée`, `commandes = 0`, `rls_actif = t`, `politiques = 2`.
* `supabase-admin.sql` → une ligne `majdgara9@gmail.com … role = admin`.

Puis **Table Editor** : `user_roles`, `products`, `orders` présentes, **RLS activé** sur les trois.

Ces scripts n'effacent aucune table ni aucune donnée et sont relançables
(`CREATE … IF NOT EXISTS`, `ON CONFLICT DO NOTHING`, `CREATE OR REPLACE`,
`DROP POLICY IF EXISTS`).

## 4. URL d'authentification

**Authentication → URL Configuration** :

* **Site URL** : `http://localhost:8000` en local, puis `https://votre-projet.vercel.app`.
* **Redirect URLs** : `http://localhost:8000/verification.html` et
  `https://votre-projet.vercel.app/verification.html`.

Servir le site en local (depuis la racine du projet) :

```powershell
python -m http.server 8000
```

puis `http://localhost:8000`.

## 5. Créer et confirmer un compte

1. `http://localhost:8000/signup.html` → prénom, nom, e-mail, mot de passe (8 caractères min.), confirmation.
2. Message affiché : « Compte créé. Un e-mail de confirmation a été demandé à Supabase… »
   — le site **ne garantit pas** la réception de l'e-mail.
3. Boîte mail (et indésirables) → lien de confirmation → `verification.html` → **J'ai confirmé mon e-mail**.
4. `login.html` → `compte.html` affiche l'identité et le rôle **Client**.

Où voir les comptes : **Authentication → Users**.
Où voir les e-mails envoyés : **Logs → Auth logs** (événements `signed_up`,
`confirmation_token_created`, `user_confirmed`).

## 6. Attribuer le rôle admin

`supabase-admin.sql` contient déjà l'UUID de `majdgara9@gmail.com`.
Exécutez-le dans le **SQL Editor**, puis **déconnectez-vous / reconnectez-vous** :
le lien **Admin** apparaît dans le menu.

Pour un autre compte : Authentication → Users → UID → remplacer la valeur de
`cible` dans le script. Cette opération se fait **toujours** dans le SQL Editor :
aucune fonction du site ne permet de s'attribuer le rôle admin.

## 7. Parcours à tester (profils réels)

Le test se fait avec de **vraies sessions navigateur**, pas avec le SQL Editor
(connecté en propriétaire, il contourne le RLS).

| Profil | Vérifications |
| --- | --- |
| Visiteur | Menu « Connexion » + « Panier » ; `services.html` affiche les 5 services ; `panier.html` fonctionne ; `checkout.html` redirige vers `login.html` ; aucune commande lisible ; `admin.html` dit « Accès réservé » |
| Client A | S'ajoute un service au panier, valide la commande → `confirmation.html` avec référence `MU-…` ; retrouve la candidature dans `compte.html` ; panier vidé **uniquement après succès** ; lien Admin masqué ; ne voit que **ses** commandes |
| Client B | Ne voit **aucune** commande de A (`admin.html` = accès réservé) |
| Admin | `admin.html` : liste des commandes (filtre, Charger la suite, détail dépliable), changement de statut enregistré, catalogue modifiable (ajout / modification / suppression avec confirmation) |

**Tests de sécurité à faire dans la console du navigateur (connecté) :**

```js
await sb.from('user_roles').update({ role: 'admin' });   // doit échouer (RLS)
await sb.from('orders').insert({});                      // doit échouer (aucune politique INSERT)
await sb.from('products').update({ price: 0 });          // client : doit échouer
```

**Cas d'erreur à provoquer volontairement :**

* Panier vide puis validation → « aucun service dans la candidature ».
* Service retiré du catalogue pendant la saisie → « n'est plus disponible ».
* Coupure réseau à la validation puis revalidation → **aucun doublon**
  (la seconde tentative renvoie la même commande, message « déjà enregistrée »).
* Deux onglets admin ouverts : modification du statut dans l'un puis dans l'autre
  → « Modification détectée » au lieu d'un écrasement silencieux.

> Ne créez pas de vraies commandes parasites ni de données à supprimer pour tester :
> les commandes de démonstration restent dans la base.

## 8. Publier sur Vercel

1. Pousser sur un dépôt GitHub personnel :

```bash
git init
git add .
git commit -m "MatchUp : integration Supabase (comptes, catalogue, commandes)"
git branch -M main
git remote add origin https://github.com/VOTRE-COMTE/MatchUp.git
git push -u origin main
```

2. Vercel → **Add New → Project** → importer le dépôt.
3. Réglages : **Root Directory** = dossier contenant `index.html`,
   preset **Other** (HTML statique), **Build Command** vide,
   **Output Directory** vide (ou `.`).
4. **Deploy** → noter `https://….vercel.app`.
5. Supabase → **Authentication → URL Configuration** : ajouter cette adresse à la
   **Site URL** et aux **Redirect URLs**.
6. Refaire les tests de l'étape 7 sur l'URL HTTPS finale.

## 9. Erreurs fréquentes

| Symptôme | Piste |
| --- | --- |
| `supabase is not defined` | Bibliothèque non chargée avant `supabase-client.js`, ou chemin faux |
| `Client Supabase indisponible` | `supabase-client.js` absent de la page ou ordre de chargement fausse |
| Catalogue vide / « table requise n'existe pas » | `supabase-setup.sql` ou `supabase-orders.sql` non exécutés |
| Lien **Admin** absent | UUID faux, script non exécuté, ou session à rafraîchir (déconnexion/reconnexion) |
| `admin.html` = « Accès réservé » pour l'admin | `role ≠ 'admin'` dans `user_roles` → relancer `supabase-admin.sql`, puis reconnectez-vous |
| Commande refusée : « prix_modifie » | Le catalogue a changé entre l'affichage et la validation → rechargez le panier |
| Commande refusée : « service_indisponible » | Retirez la ligne du panier |
| E-mail de confirmation absent | Indésirables, adresse fausse, limite d'envoi du service de test |
| Mauvaise redirection du lien e-mail | Site URL + Redirect URLs (étape 4) |
| Page blanche sur Vercel | Mauvais Root Directory : `index.html` doit être à la racine déployée |
| `Failed to fetch` | URL Supabase fausse dans `supabase-client.js` ou pas de connexion |

## 10. État de l'intégration

**Fait**

* `supabase-client.js` : initialisation unique (URL + Publishable key), helper `urlDePage()`.
* `supabase-shop.js` : comptes, session, rôle, catalogue, candidatures (`create_demo_order`),
  commandes admin, changement de statut avec détection de concurrence, format prix en centimes.
* `script.js` : menu dynamique (Connexion / Mon compte / Panier / Admin), panier localStorage,
  rendu du catalogue, checkout, confirmation, historique, console d'administration.
* Pages : `signup`, `login`, `verification`, `compte`, `panier`, `checkout`, `confirmation`,
  `admin` + catalogue intégré à `services.html`.
* Liens compte/admin/panier et scripts Supabase (ordre + `defer`) sur les 13 pages.
* `supabase-setup.sql`, `supabase-orders.sql`, `supabase-admin.sql` (UUID déjà renseigné).

**Limites assumées**

* Aucun SQL n'a été exécuté dans votre Supabase, aucun compte créé, aucun site déployé
  par l'agent : ces étapes restent les vôtres.
* Validation faite sans base : contrôle syntaxique (Node), structure HTML, rendu des pages
  dans un navigateur sans erreur console, et tests d'API en lecture/échec
  (clé valide, tables absentes refusées, mauvais mot de passe refusé).
* Les scripts SQL n'ont pas été exécutés sur un vrai PostgreSQL : casse éventuelle =
  message d'erreur du SQL Editor à me rapporter.
* « Réinitialiser mon mot de passe » n'est **pas** présenté comme disponible.
* Paiement simulé uniquement : aucun champ bancaire nulle part.

**Actions manuelles restantes**

1. Exécuter `supabase-setup.sql` → `supabase-orders.sql` → `supabase-admin.sql`.
2. Configurer les URL d'authentification (étape 4).
3. Créer et confirmer un compte client (étape 5), puis ouvrir `majdgara9@gmail.com`.
4. Dérouler les 4 profils de l'étape 7 (dont les tests de console).
5. Publier sur Vercel puis remettre l'URL `vercel.app` dans Supabase (étape 8).
