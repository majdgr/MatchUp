// ==========================================
// MatchUp - Accès Supabase : comptes, rôles, catalogue,
// candidatures (commandes) et administration.
// Toutes les fonctions renvoient { ok, message } et
// affichent des erreurs compréhensibles.
// Les mots de passe ne quittent jamais le navigateur
// pour aller ailleurs que Supabase Auth.
//
// Unité monétaire : les prix sont stockés en CENTIMES
// (entier) dans la base. Ici on les formate en euros.
// ==========================================

const Shop = (function () {
  "use strict";

  const LIMITE_HISTORIQUE = 100;
  const LIMITE_ADMIN = 50;
  const FRAIS_DOSSIER = 2000; // centimes, doit correspondre à v_frais dans supabase-orders.sql

  const LIBELLES_STATUT = {
    nouvelle: "Nouvelle",
    en_preparation: "En préparation",
    terminee: "Terminée",
    annulee: "Annulée"
  };

  function client() {
    if (typeof window.sb === "undefined" || !window.sb) {
      throw new Error("Client Supabase indisponible : vérifiez le chargement de supabase-client.js.");
    }
    return window.sb;
  }

  // ---------- Formats ----------
  function formatPrix(centimes) {
    const valeur = Number(centimes);
    if (!isFinite(valeur)) return "—";
    return (valeur / 100).toFixed(2).replace(".", ",") + " €";
  }

  function libelleStatut(statut) {
    return LIBELLES_STATUT[statut] || statut || "—";
  }

  // ---------- Messages d'erreur lisibles ----------
  function messageErreur(erreur) {
    if (!erreur) return "Erreur inconnue. Réessayez.";
    const code = erreur.code || erreur.error_code || "";
    const brut = (erreur.message || erreur.error_description || "").toLowerCase();

    if (code === "invalid_credentials" || brut.includes("invalid login credentials")) {
      return "E-mail ou mot de passe incorrect.";
    }
    if (code === "email_not_confirmed" || brut.includes("email not confirmed")) {
      return "Votre adresse e-mail n'est pas encore confirmée. Ouvrez le lien envoyé par e-mail.";
    }
    if (code === "user_already_exists" || brut.includes("already registered") || brut.includes("already been registered")) {
      return "Un compte existe déjà avec cette adresse e-mail. Connectez-vous.";
    }
    if (code === "weak_password" || brut.includes("password should be at least")) {
      return "Le mot de passe est trop faible : 8 caractères minimum.";
    }
    if (code === "over_email_send_rate_limit" || brut.includes("rate limit") || brut.includes("security purposes")) {
      return "Trop de tentatives d'envoi d'e-mail. Patientez quelques minutes avant de réessayer.";
    }
    if (code === "signup_disabled" || brut.includes("signups not allowed")) {
      return "Les inscriptions sont désactivées sur ce projet Supabase.";
    }
    if (code === "validation_failed" || brut.includes("unable to validate email")) {
      return "L'adresse e-mail saisie n'est pas valide.";
    }
    if (brut.includes("failed to fetch") || brut.includes("networkerror")) {
      return "Impossible de joindre Supabase. Vérifiez votre connexion Internet.";
    }
    if (code === "42501" || brut.includes("permission denied")) {
      return "Vous n'avez pas le droit d'effectuer cette opération.";
    }
    if (code === "PGRST205" || code === "42P01" || brut.includes("does not exist") || brut.includes("could not find the table")) {
      return "Une table requise n'existe pas encore dans la base. Exécutez les scripts SQL prévus (voir SUPABASE.md).";
    }
    if (brut.startsWith("prix_modifie")) {
      return erreur.message.replace(/^[^:]*:\s*/, "") + " (prix modifié)";
    }
    if (brut.startsWith("service_inconnu") || brut.startsWith("service_indisponible") ||
        brut.startsWith("quantite_invalide") || brut.startsWith("panier_vide") ||
        brut.startsWith("coordonnees_invalides") || brut.startsWith("connecte_requis") ||
        brut.startsWith("tentative_invalide") || brut.startsWith("panier_invalide")) {
      return erreur.message.replace(/^[^:]*:\s*/, "");
    }
    return erreur.message || "Erreur inconnue. Réessayez.";
  }

  function echec(erreur) {
    const message = messageErreur(erreur);
    console.error("MatchUp / Supabase :", erreur);
    return { ok: false, message: message };
  }

  function succes(message, details) {
    return { ok: true, message: message || "", details: details || null };
  }

  // Refus lié à la saisie (aucune erreur technique à afficher)
  function refus(message) {
    return { ok: false, message: message, validation: true };
  }

  // ---------- Validation côté navigateur ----------
  function emailValide(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || "").trim());
  }

  // ---------- Session ----------
  async function getSession() {
    try {
      const { data, error } = await client().auth.getSession();
      if (error) throw error;
      return data.session || null;
    } catch (erreur) {
      console.error("MatchUp : session illisible.", erreur);
      return null;
    }
  }

  async function utilisateurCourant() {
    try {
      const { data, error } = await client().auth.getUser();
      if (error) throw error;
      return data.user || null;
    } catch (erreur) {
      console.error("MatchUp : utilisateur illisible.", erreur);
      return null;
    }
  }

  function ecouterAuth(appel) {
    try {
      client().auth.onAuthStateChange((_evenement, session) => {
        appel(session || null);
      });
    } catch (erreur) {
      console.error("MatchUp : abonnement à la session impossible.", erreur);
    }
  }

  // ---------- Rôle ----------
  async function roleCourant() {
    const session = await getSession();
    if (!session) return null;
    try {
      const { data, error } = await client()
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (error) throw error;
      return data && data.role ? data.role : "client";
    } catch (erreur) {
      console.warn("MatchUp : rôle non lisible (table user_roles absente ?).", erreur);
      return "client";
    }
  }

  async function estAdmin() {
    return (await roleCourant()) === "admin";
  }

  // ---------- Inscription ----------
  async function inscrire(infos) {
    const email = String(infos.email || "").trim();
    const motDePasse = String(infos.motDePasse || "");
    const confirmation = String(infos.confirmation || "");
    const prenom = String(infos.prenom || "").trim();
    const nom = String(infos.nom || "").trim();

    if (!prenom || !nom) return refus("Merci d'indiquer votre prénom et votre nom.");
    if (!emailValide(email)) return refus("L'adresse e-mail n'est pas valide.");
    if (motDePasse.length < 8) return refus("Le mot de passe doit contenir au moins 8 caractères.");
    if (motDePasse !== confirmation) return refus("Les deux mots de passe ne correspondent pas.");

    try {
      const { data, error } = await client().auth.signUp({
        email: email,
        password: motDePasse,
        options: {
          data: { prenom: prenom, nom: nom },
          emailRedirectTo: urlDePage("verification.html")
        }
      });
      if (error) throw error;

      if (data && data.session) {
        return succes("Compte créé et connecté(e).", { sessionImmediate: true, user: data.user });
      }
      return succes(
        "Compte créé. Un e-mail de confirmation a été demandé à Supabase : " +
        "vérifiez votre boîte mail (et les courriers indésirables).",
        { sessionImmediate: false, user: data ? data.user : null }
      );
    } catch (erreur) {
      return echec(erreur);
    }
  }

  // ---------- Connexion / déconnexion ----------
  async function connecter(email, motDePasse) {
    const adresse = String(email || "").trim();
    const mdp = String(motDePasse || "");
    if (!emailValide(adresse)) return refus("L'adresse e-mail n'est pas valide.");
    if (!mdp) return refus("Merci de saisir votre mot de passe.");

    try {
      const { data, error } = await client().auth.signInWithPassword({
        email: adresse,
        password: mdp
      });
      if (error) throw error;
      return succes("Connexion réussie.", { session: data.session, user: data.user });
    } catch (erreur) {
      return echec(erreur);
    }
  }

  async function deconnecter() {
    try {
      const { error } = await client().auth.signOut();
      if (error) throw error;
      return succes("Vous êtes déconnecté(e).");
    } catch (erreur) {
      return echec(erreur);
    }
  }

  // ---------- Confirmation d'e-mail (page verification.html) ----------
  async function confirmerRedirection() {
    try {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      if (code) {
        const { data, error } = await client().auth.exchangeCodeForSession(code);
        if (error) throw error;
        if (data && data.session) {
          return succes("E-mail confirmé. Vous pouvez utiliser votre compte.", { session: data.session });
        }
      }
      const session = await getSession();
      if (session) {
        return succes("Session active : votre compte est prêt.", { session: session });
      }
      return succes("", { session: null });
    } catch (erreur) {
      return echec(erreur);
    }
  }

  // ---------- Catalogue (services) ----------
  // Le RLS ne renvoie que les services visibles (is_available)
  // sauf pour l'administrateur, qui voit tout.
  async function listerServices() {
    try {
      const { data, error } = await client()
        .from("products")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return { ok: true, message: "", services: data || [] };
    } catch (erreur) {
      return { ok: false, message: messageErreur(erreur), services: [] };
    }
  }

  function validerService(infos) {
    const id = String(infos.id || "").trim();
    const nom = String(infos.name || "").trim();
    const categorie = String(infos.category || "").trim();
    const description = String(infos.description || "").trim();
    const prix = Number(infos.price);
    const image = String(infos.image || "").trim();

    if (!/^[a-z0-9-]{3,60}$/.test(id)) return "Identifiant invalide : 3 à 60 caractères minuscules, chiffres et tirets.";
    if (nom.length < 2 || nom.length > 120) return "Le nom doit contenir entre 2 et 120 caractères.";
    if (["Stages", "Jobs", "Formation"].indexOf(categorie) === -1) return "Catégorie inconnue.";
    if (!isFinite(prix) || prix < 0 || prix > 1000000) return "Le prix doit être un nombre positif (en euros).";
    if (image && !/^https:\/\//i.test(image)) return "L'image doit être une URL HTTPS publique (ou vide).";
    if (description.length > 2000) return "La description est trop longue (2000 caractères maximum).";
    return null;
  }

  function versBase(infos) {
    const lignes = String(infos.features || "")
      .split("\n")
      .map(function (ligne) { return ligne.trim(); })
      .filter(Boolean);
    return {
      id: String(infos.id || "").trim(),
      name: String(infos.name || "").trim(),
      category: String(infos.category || "").trim(),
      description: String(infos.description || "").trim(),
      price: Math.round(Number(infos.price) * 100),
      image: String(infos.image || "").trim(),
      features: lignes,
      is_available: !!infos.is_available
    };
  }

  async function enregistrerService(infos) {
    const probleme = validerService(infos);
    if (probleme) return refus(probleme);
    try {
      const { error } = await client().from("products").insert([versBase(infos)]);
      if (error) throw error;
      return succes("Service ajouté au catalogue.");
    } catch (erreur) {
      return echec(erreur);
    }
  }

  async function modifierService(id, infos) {
    const probleme = validerService(infos);
    if (probleme) return refus(probleme);
    try {
      const { error } = await client().from("products").update(versBase(infos)).eq("id", id);
      if (error) throw error;
      return succes("Service mis à jour.");
    } catch (erreur) {
      return echec(erreur);
    }
  }

  async function supprimerService(id) {
    try {
      const { error } = await client().from("products").delete().eq("id", id);
      if (error) throw error;
      return succes("Service supprimé.");
    } catch (erreur) {
      return echec(erreur);
    }
  }

  // ---------- Candidatures (commandes) ----------
  // p_items : [{ id, quantity }] — les prix sont ignorés par la base.
  async function creerCommande(donnees) {
    try {
      const { data, error } = await client().rpc("create_demo_order", {
        p_attempt_id: donnees.attemptId,
        p_items: donnees.items,
        p_delivery_name: donnees.nom,
        p_delivery_email: donnees.email,
        p_delivery_phone: donnees.telephone || null,
        p_delivery_city: donnees.ville || null,
        p_delivery_address: donnees.adresse || null,
        p_payment_method: "demo",
        p_expected_total: donnees.totalAttendu
      });
      if (error) throw error;
      return succes(
        data && data.duplicate ? "Candidature déjà enregistrée (aucun doublon)." : "Candidature enregistrée.",
        { commande: data ? data.order : null, duplicate: !!(data && data.duplicate) }
      );
    } catch (erreur) {
      return echec(erreur);
    }
  }

  async function mesCommandes(limite) {
    const session = await getSession();
    if (!session) return { ok: false, message: "Connectez-vous pour voir votre historique.", commandes: [] };
    const nombre = Math.min(Number(limite) || LIMITE_HISTORIQUE, LIMITE_HISTORIQUE);
    try {
      const { data, error } = await client()
        .from("orders")
        .select("*")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false })
        .limit(nombre);
      if (error) throw error;
      return { ok: true, message: "", commandes: data || [], total: (data || []).length };
    } catch (erreur) {
      return { ok: false, message: messageErreur(erreur), commandes: [] };
    }
  }

  // Lit une commande précise : le RLS n'autorise que le propriétaire
  // ou l'administrateur, sinon la ligne n'est pas renvoyée.
  async function commande(id) {
    try {
      const { data, error } = await client()
        .from("orders")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return { ok: false, message: "Commande introuvable ou accès refusé.", commande: null };
      return { ok: true, message: "", commande: data };
    } catch (erreur) {
      return { ok: false, message: messageErreur(erreur), commande: null };
    }
  }

  // Administration : liste paginée (50 par page)
  async function toutesLesCommandes(options) {
    const opts = options || {};
    const statut = opts.statut || "";
    const decalage = Number(opts.decalage) || 0;
    try {
      let requete = client()
        .from("orders")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(decalage, decalage + LIMITE_ADMIN - 1);
      if (statut) requete = requete.eq("status", statut);
      const { data, error, count } = await requete;
      if (error) throw error;
      return {
        ok: true,
        message: "",
        commandes: data || [],
        total: typeof count === "number" ? count : (data || []).length,
        limite: LIMITE_ADMIN
      };
    } catch (erreur) {
      return { ok: false, message: messageErreur(erreur), commandes: [], total: 0, limite: LIMITE_ADMIN };
    }
  }

  // Modification du statut avec détection de modification concurrente :
  // on n'écrase jamais une ligne modifiée entre-temps.
  async function changerStatutCommande(id, statut, versionAttendue) {
    if (!LIBELLES_STATUT[statut]) return refus("Statut inconnu.");
    try {
      const { data, error } = await client()
        .from("orders")
        .update({ status: statut })
        .eq("id", id)
        .eq("updated_at", versionAttendue)
        .select("id, status, updated_at");
      if (error) throw error;

      if (!data || data.length === 0) {
        const { data: actuel, error: errLecture } = await client()
          .from("orders")
          .select("status, updated_at")
          .eq("id", id)
          .maybeSingle();
        if (errLecture) throw errLecture;
        if (!actuel) return { ok: false, message: "Cette commande n'existe plus ou vous n'y avez pas accès." };
        return {
          ok: false,
          conflit: true,
          message: "Modification détectée : ce statut a changé pendant votre saisie. Rechargez la liste.",
          actuel: actuel
        };
      }
      return succes("Statut enregistré.", { miseAJour: data[0] });
    } catch (erreur) {
      return echec(erreur);
    }
  }

  return {
    LIMITE_HISTORIQUE: LIMITE_HISTORIQUE,
    LIMITE_ADMIN: LIMITE_ADMIN,
    FRAIS_DOSSIER: FRAIS_DOSSIER,
    LIBELLES_STATUT: LIBELLES_STATUT,
    formatPrix: formatPrix,
    libelleStatut: libelleStatut,
    getSession: getSession,
    utilisateurCourant: utilisateurCourant,
    ecouterAuth: ecouterAuth,
    roleCourant: roleCourant,
    estAdmin: estAdmin,
    inscrire: inscrire,
    connecter: connecter,
    deconnecter: deconnecter,
    confirmerRedirection: confirmerRedirection,
    listerServices: listerServices,
    validerService: validerService,
    enregistrerService: enregistrerService,
    modifierService: modifierService,
    supprimerService: supprimerService,
    creerCommande: creerCommande,
    mesCommandes: mesCommandes,
    commande: commande,
    toutesLesCommandes: toutesLesCommandes,
    changerStatutCommande: changerStatutCommande,
    messageErreur: messageErreur,
    emailValide: emailValide
  };
})();

window.Shop = Shop;
