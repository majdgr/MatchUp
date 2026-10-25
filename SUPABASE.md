# SUPABASE.md — MatchUp

Guide pas à pas de la mise en service de **MatchUp** : comptes et rôles, profils et CV,
offres, candidatures, mise en correspondance et paiement des frais.

**Architecture : aucun backend.** Le site HTML/CSS/JavaScript appelle Supabase
directement depuis le navigateur (Supabase JS v2 + Publishable key).
Pas de serveur applicatif, pas de compilation, pas de Node, pas de Docker.
La sécurité ne repose pas sur le JavaScript : elle est posée dans la base
(droits SQL, Row Level Security, fonctions `SECURITY DEFINER`).

> Ce fichier décrit les opérations **que vous réalisez vous-même** dans les
> tableaux de bord Supabase et Vercel. L'agent a produit le code et les
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

## 1. Modèle de données

| Table | Rôle dans l'application |
| --- | --- |
| `user_roles` | Rôle du compte : `etudiant`, `entreprise` ou `admin` |
| `profiles` | Profil étudiant (établissement, diplôme, compétences, `cv_path`) **et** profil entreprise (`entreprise_*`) |
| `opportunities` | Offres de stage / part time publiées par les entreprises |
| `applications` | Candidatures : statut + score de correspondance (0-100) |
| `paiements` | Frais de mise en relation réglés par l'entreprise après sélection |
| Storage `cvs` | Conteneur **privé** de dépôt des CV (PDF, DOC, DOCX — 3 Mo) |

Tâches confiées à la base (le navigateur ne les décide jamais) :

* `calculer_score(etudiant, offre)` — part des compétences exigées couvertes par le profil ;
* `postuler()` — vérifie le rôle, le statut de l'offre, l'unicité, calcule le score ;
* `selectionner_candidature()` — sélectionne un candidat, refuse les autres, passe l'offre à « pourvue » ;
* `statuer_candidature()` — accepte / refuse / remet en attente (rouvre l'offre si besoin) ;
* `payer_frais()` — enregistre le paiement simulé (150,00 €), une seule fois par candidature ;
* `creer_offre()` — vérifie le rôle entreprise et copie le nom de l'entreprise dans l'offre.

## 2. Projet Supabase

1. [supabase.com](https://supabase.com) → connexion.
2. Le projet MatchUp existe déjà : rien à créer.
3. Mot de passe de la base : conservé hors du code.

## 3. URL et Publishable key

**Settings → API Keys** → Project URL + Publishable key.
Ces deux valeurs sont déjà dans `supabase-client.js`.

## 4. Exécuter les scripts SQL (SQL Editor) — ordre strict

| Ordre | Fichier | Contenu |
| --- | --- | --- |
| 1 | `supabase-setup.sql` | `user_roles` (3 rôles), `profiles`, trigger d'inscription, conteneur `cvs` + politiques, RLS, nettoyage de l'ancien modèle boutique |
| 2 | `supabase-offres.sql` | `opportunities`, `applications`, `paiements`, RLS, fonctions métier (`postuler`, `selectionner_candidature`, `payer_frais`, …) |
| 3 | `supabase-admin.sql` | Attribution du rôle admin à `majdgara9@gmail.com` (UUID déjà renseigné) |

Pour chaque fichier : **SQL Editor → New query → coller → Run**.

Vérifications attendues dans le résultat :

* `supabase-setup.sql` → trois lignes : `user_roles`, `profiles`, `bucket cvs`
  (RLS = `t` sur les deux tables, `3` politiques `cvs_%`).
* `supabase-offres.sql` → `opportunities`, `applications`, `paiements`
  (RLS = `t`) + `politiques RLS` = 7 et le compte des 5 fonctions métier.
* `supabase-admin.sql` → une ligne `majdgara9@gmail.com … role = admin`.

Puis **Table Editor** : `user_roles`, `profiles`, `opportunities`,
`applications`, `paiements` présentes, **RLS activé** sur les cinq.

Ces scripts sont relançables (`CREATE … IF NOT EXISTS`, `ON CONFLICT DO
NOTHING`, `CREATE OR REPLACE FUNCTION`, `DROP POLICY IF EXISTS`,
`DROP TRIGGER IF EXISTS`) et **remplacent** l'ancien modèle boutique
(`products`, `orders`, `create_demo_order`) qui est supprimé à la fin du
fichier 1.

## 5. URL d'authentification

**Authentication → URL Configuration** :

* **Site URL** : `http://localhost:8000` en local, puis `https://votre-projet.vercel.app`.
* **Redirect URLs** : `http://localhost:8000/verification.html` et
  `https://votre-projet.vercel.app/verification.html`.

Servir le site en local (depuis la racine du projet) :

```powershell
python -m http.server 8000
```

puis `http://localhost:8000`.

## 6. Créer les comptes de test

Trois profils suffisent pour dérouler toute l'application.

| Compte | Création |
| --- | --- |
| Étudiant | `signup.html` → case **Étudiant** → confirmer l'e-mail → `login.html` → `etudiant.html` |
| Entreprise | `signup.html` → case **Entreprise** (ou `signup.html?role=entreprise`) → confirmer → `login.html` → `entreprise.html` |
| Admin | `majdgara9@gmail.com` : le rôle est donné par `supabase-admin.sql`, jamais par le formulaire d'inscription |

À l'inscription, le trigger `handle_new_user()` crée la ligne `user_roles`
(`entreprise` si demandé, sinon `etudiant`) et la ligne `profiles`.
Le rôle `admin` ne peut **pas** être choisi sur le site.

La connexion redirige automatiquement : `admin.html` / `entreprise.html` /
`etudiant.html` selon le rôle.

Où voir les comptes : **Authentication → Users**.
Où voir les e-mails envoyés : **Logs → Auth logs**.

## 7. Parcours à tester

| Profil | Vérifications |
| --- | --- |
| Visiteur | `opportunites.html` liste les offres ouvertes ; détail d'une offre sans bloc de candidature ; menu « Connexion » ; `admin.html` = « Accès réservé » |
| Étudiant | Remplit son profil (compétences obligatoires) ; dépôt / vision / retrait du CV ; voit le bloc « Offres recommandées » avec un % ; postule depuis `opportunite.html` ; suit ses candidatures dans `etudiant.html` ; « Retirer » n'apparaît qu'en statut *En attente* |
| Entreprise | Remplit le profil ; publie une offre (compétences exigées obligatoires) ; modifie / supprime / change le statut ; choisit l'offre dans « Candidats » ; voit le score et le CV du candidat ; **Sélectionner** refuse les autres et passe l'offre à « pourvue » ; le bouton **Régler les frais (150,00 €)** apparaît ; le reçu affiche une référence `MU-…` |
| Admin | `admin.html` : liste des comptes avec changement de rôle ; liste de toutes les offres (filtre + suppression) ; liste de toutes les candidatures (filtre) ; total des paiements |

**Tests de sécurité dans la console du navigateur (connecté) :**

```js
await sb.from('user_roles').update({ role: 'admin' });   // doit échouer (RLS : réservé admin)
await sb.from('applications').insert({});                // doit échouer (aucune politique INSERT)
await sb.from('profiles').update({ cv_path: 'x' });      // ne modifie que votre propre profil
await sb.from('opportunities').select();                 // ne renvoie que les offres ouvertes + les vôtres
```

**Cas d'erreur à provoquer volontairement :**

* Étudiant sans compétence → score `0 %` et message d'encouragement à compléter le profil.
* Motivation de 15 caractères → refus côté base (`motivation_courte`).
* Deuxième candidature sur la même offre → « Vous avez déjà postulé à cette offre. »
* Paiement avant sélection → `selection_requise` (le bouton n'apparaît d'ailleurs qu'après sélection).
* Deux clics sur « Régler les frais » → le second renvoie le même reçu (`duplicate`).

## 8. Publier sur Vercel

1. Pousser sur un dépôt GitHub personnel :

```bash
git init
git add .
git commit -m "MatchUp : offres, candidatures, profils et paiement sur Supabase"
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

## 9. Arborescence du site

| Fichier | Rôle |
| --- | --- |
| `index.html` | Accueil |
| `opportunites.html` | Liste des offres + recommandations |
| `opportunite.html` | Détail d'une offre + formulaire de candidature |
| `etudiant.html` | Espace étudiant : profil, CV, recommandations, candidatures |
| `entreprise.html` | Espace entreprise : profil, offres, candidats, sélection, paiement |
| `admin.html` | Administration : comptes, offres, candidatures, paiements |
| `signup.html` / `login.html` / `verification.html` / `compte.html` | Comptes |
| `services.html`, `service-detail.html`, `a-propos.html`, `contact.html` | Pages d'information |
| `supabase-client.js` | Initialisation du client Supabase (URL + Publishable key) |
| `supabase-api.js` | Toutes les lectures/écritures Supabase (`window.Api`) |
| `script.js` | Rendu des pages, écoute des formulaires |

## 10. Erreurs fréquentes

| Symptôme | Piste |
| --- | --- |
| `Client Supabase indisponible` | `supabase-client.js` absent de la page ou ordre de chargement faux |
| `Service indisponible (scripts Supabase manquants)` | `supabase-api.js` absent ou mal nommé dans la page |
| « Une table requise n'existe pas » | `supabase-setup.sql` ou `supabase-offres.sql` non exécutés |
| « Une fonction requise n'existe pas » | `supabase-offres.sql` non exécuté (fonctions `postuler`, `payer_frais`, …) |
| `admin.html` = « Accès réservé » pour le bon compte | Relancer `supabase-admin.sql`, puis déconnexion / reconnexion |
| Aucun espace ne s'ouvre après connexion | Rôle absent de `user_roles` : relancer les scripts 1 et 2 |
| Le CV ne se dépose pas | Conteneur `cvs` absent (script 1) ou fichier > 3 Mo / format autre que PDF, DOC, DOCX |
| Le CV d'un candidat ne s'ouvre pas côté entreprise | La candidature n'existe pas pour **cette** entreprise, ou le rôle n'est pas `entreprise` |
| Recommandations toujours vides | Aucune compétence dans le profil, ou toutes les offres compatibles ont déjà été consultées |
| Redirection vers la mauvaise page | Chaque espace vérifie le rôle et redirige : c'est voulu |
| E-mail de confirmation absent | Indésirables, adresse fausse, limite d'envoi du service de test |
| Mauvaise redirection du lien e-mail | Site URL + Redirect URLs (étape 5) |
| Page blanche sur Vercel | Mauvais Root Directory : `index.html` doit être à la racine déployée |
| `Failed to fetch` | URL Supabase fausse dans `supabase-client.js` ou pas de connexion |

## 11. État de l'intégration

**Fait**

* Trois rôles (`etudiant`, `entreprise`, `admin`) créés à l'inscription puis
  contrôlés par RLS et par les fonctions métier.
* Profil étudiant + dépôt de CV en conteneur privé (dépôt, visualisation, retrait).
* Publication, modification, suppression et statuts des offres côté entreprise.
* Candidature avec score calculé en base, suivi de l'état, retrait tant qu'elle est en attente.
* Sélection du candidat (les autres sont refusés, l'offre passe à « pourvue »).
* Paiement simulé des frais (150,00 €) après sélection, avec reçu et idempotence.
* Recommandations : classement des offres par correspondance avec le profil.
* Administration : comptes et rôles, toutes les offres, toutes les candidatures, paiements.
* Ancien modèle boutique retiré du site (`panier`, `checkout`, `confirmation`, `products`, `orders`).

**Limites assumées**

* Aucun SQL n'a été exécuté dans votre Supabase et aucun site n'a été déployé
  par l'agent : ces étapes restent les vôtres.
* Paiement **simulé** uniquement : aucun champ bancaire, aucun encaissement réel.
* « Réinitialiser mon mot de passe » n'est pas présenté comme disponible.
* La suppression d'un compte Auth se fait dans le tableau de bord Supabase
  (le site ne peut changer qu'un rôle).

**Actions manuelles restantes**

1. Exécuter `supabase-setup.sql` → `supabase-offres.sql` → `supabase-admin.sql`.
2. Configurer les URL d'authentification (étape 5).
3. Créer les comptes de test (étape 6) puis dérouler les 4 profils de l'étape 7.
4. Publier sur Vercel puis remettre l'URL `vercel.app` dans Supabase (étape 8).
