// ==========================================
// MatchUp - Accès Supabase : comptes, rôles, profils, CV,
// opportunités, candidatures, mise en correspondance et
// paiement des frais.
// Toutes les fonctions renvoient { ok, message, ... } et
// affichent des erreurs compréhensibles.
// Les mots de passe ne quittent jamais le navigateur pour
// aller ailleurs que Supabase Auth.
//
// Unité monétaire : les montants sont stockés en CENTIMES
// (entier) dans la base, formatés ici en euros.
// ==========================================

const Api = (function () {
  "use strict";

  const LIMITE = 100;
  const LIMITE_ADMIN = 50;
  const FRAIS_ACCORD = 15000; // centimes — doit correspondre à v_frais de supabase-offres.sql
  const TYPES_OFFRE = { stage: "Stage", part_time: "Part time job" };
  const STATUTS_CANDIDATURE = {
    en_attente: "En attente",
    selectionnee: "Sélectionné(e)",
    acceptee: "Acceptée",
    refusee: "Refusée"
  };
  const STATUTS_OFFRE = {
    ouverte: "Ouverte",
    pourvue: "Pourvue",
    fermee: "Fermée"
  };
  const ROLES = { etudiant: "Étudiant", entreprise: "Entreprise", admin: "Administrateur" };
  const DISPO = { stage: "Stage", part_time: "Part time job", les_deux: "Les deux" };

  // ---------- Client ----------
  function client() {
    if (typeof window.sb === "undefined" || !window.sb) {
      throw new Error("Client Supabase indisponible : vérifiez le chargement de supabase-client.js.");
    }
    return window.sb;
  }

  // ---------- Formats ----------
  function formatMontant(centimes) {
    const valeur = Number(centimes);
    if (!isFinite(valeur)) return "—";
    return (valeur / 100).toFixed(2).replace(".", ",") + " €";
  }

  function libelle(type, cle) {
    const tables = {
      offre: STATUTS_OFFRE,
      candidature: STATUTS_CANDIDATURE,
      role: ROLES,
      dispo: DISPO,
      type: TYPES_OFFRE
    };
    const table = tables[type] || {};
    return table[cle] || cle || "—";
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
    if (code === "PGRST302" || brut.includes("function") && brut.includes("not found")) {
      return "Une fonction requise n'existe pas encore dans la base. Exécutez les scripts SQL prévus (voir SUPABASE.md).";
    }
    if (code === "401" || brut.includes("row-level security")) {
      return "Cette opération n'est pas autorisée pour votre compte.";
    }

    // Erreurs métier levées par les fonctions SQL : « code : explication »
    const precis = (erreur.message || "").match(/^\s*[a-z_]+\s*:\s*(.+)$/s);
    if (precis) return precis[1];

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

  function refus(message) {
    return { ok: false, message: message, validation: true };
  }

  // ---------- Validation ----------
  function emailValide(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || "").trim());
  }

  function textePropre(valeur, longueurMax) {
    const propre = String(valeur == null ? "" : valeur).trim().replace(/\s+/g, " ");
    if (longueurMax && propre.length > longueurMax) return propre.slice(0, longueurMax);
    return propre;
  }

  // Compétences saisies « JavaScript, SQL ; React » → tableau propre
  function texteVersCompetences(texte) {
    return String(texte == null ? "" : texte)
      .split(/[,;\n\r]+/)
      .map(function (mot) { return textePropre(mot, 40); })
      .filter(Boolean)
      .filter(function (mot, index, liste) {
        return liste.findIndex(function (autre) {
          return autre.toLowerCase() === mot.toLowerCase();
        }) === index;
      })
      .slice(0, 40);
  }

  function competencesVersTexte(competences) {
    if (!Array.isArray(competences)) return "";
    return competences.join(", ");
  }

  function competencesPropres(competences, obligatoire) {
    const liste = texteVersCompetences(competences);
    if (obligatoire && liste.length === 0) {
      return { ok: false, message: "Indiquez au moins une compétence." };
    }
    if (liste.length > 40) {
      return { ok: false, message: "40 compétences maximum." };
    }
    return { ok: true, competences: liste };
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
      return data && data.role ? data.role : "etudiant";
    } catch (erreur) {
      console.warn("MatchUp : rôle non lisible (table user_roles absente ?).", erreur);
      return "etudiant";
    }
  }

  async function estAdmin() {
    return (await roleCourant()) === "admin";
  }

  function destinationRole(role) {
    if (role === "admin") return "admin.html";
    if (role === "entreprise") return "entreprise.html";
    return "etudiant.html";
  }

  // ---------- Inscription ----------
  async function inscrire(infos) {
    const email = textePropre(infos.email);
    const motDePasse = String(infos.motDePasse || "");
    const confirmation = String(infos.confirmation || "");
    const prenom = textePropre(infos.prenom, 60);
    const nom = textePropre(infos.nom, 60);
    const role = infos.role === "entreprise" ? "entreprise" : "etudiant";

    if (!prenom || !nom) return refus("Merci d'indiquer votre prénom et votre nom.");
    if (!emailValide(email)) return refus("L'adresse e-mail n'est pas valide.");
    if (motDePasse.length < 8) return refus("Le mot de passe doit contenir au moins 8 caractères.");
    if (motDePasse !== confirmation) return refus("Les deux mots de passe ne correspondent pas.");

    try {
      const { data, error } = await client().auth.signUp({
        email: email,
        password: motDePasse,
        options: {
          data: { prenom: prenom, nom: nom, role: role },
          emailRedirectTo: urlDePage("verification.html")
        }
      });
      if (error) throw error;

      if (data && data.session) {
        return succes("Compte créé et connecté(e).", { sessionImmediate: true, user: data.user, role: role });
      }
      return succes(
        "Compte créé. Un e-mail de confirmation a été demandé à Supabase : " +
        "vérifiez votre boîte mail (et les courriers indésirables).",
        { sessionImmediate: false, user: data ? data.user : null, role: role }
      );
    } catch (erreur) {
      return echec(erreur);
    }
  }

  // ---------- Connexion / déconnexion ----------
  async function connecter(email, motDePasse) {
    const adresse = textePropre(email);
    const mdp = String(motDePasse || "");
    if (!emailValide(adresse)) return refus("L'adresse e-mail n'est pas valide.");
    if (!mdp) return refus("Merci de saisir votre mot de passe.");

    try {
      const { data, error } = await client().auth.signInWithPassword({
        email: adresse,
        password: mdp
      });
      if (error) throw error;

      const role = await roleCourant();
      return succes("Connexion réussie.", {
        session: data.session,
        user: data.user,
        role: role,
        destination: destinationRole(role)
      });
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

  // ---------- Profil ----------
  // Garantit l'existence de la ligne profil (compte créé avant le trigger).
  async function chargerProfil() {
    const session = await getSession();
    if (!session) return { ok: false, message: "Connectez-vous pour ouvrir votre profil.", profil: null };

    try {
      const { data: existant, error: errLecture } = await client()
        .from("profiles")
        .select("*")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (errLecture) throw errLecture;

      if (existant) return { ok: true, message: "", profil: existant };

      const meta = session.user.user_metadata || {};
      const { data: cree, error: errCreation } = await client()
        .from("profiles")
        .insert([{
          user_id: session.user.id,
          email: session.user.email || "",
          prenom: textePropre(meta.prenom, 60),
          nom: textePropre(meta.nom, 60)
        }])
        .select("*")
        .maybeSingle();
      if (errCreation) throw errCreation;

      return { ok: true, message: "", profil: cree };
    } catch (erreur) {
      return { ok: false, message: messageErreur(erreur), profil: null };
    }
  }

  function validerProfil(infos, role) {
    const prenom = textePropre(infos.prenom, 60);
    const nom = textePropre(infos.nom, 60);

    if (!prenom || !nom) return "Le prénom et le nom sont obligatoires.";
    if (infos.telephone && !/^[0-9+().\s-]{6,24}$/.test(infos.telephone)) return "Le numéro de téléphone n'est pas valide.";
    if (infos.bio && infos.bio.length > 1200) return "La présentation est trop longue (1200 caractères maximum).";
    if (infos.entreprise_site && !/^(https?:\/\/)/i.test(infos.entreprise_site)) {
      return "Le site de l'entreprise doit commencer par http:// ou https://";
    }

    if (role === "entreprise") {
      const nomEntreprise = textePropre(infos.entreprise_nom, 120);
      if (nomEntreprise.length < 2) return "Indiquez le nom de votre entreprise.";
    }

    const controle = competencesPropres(infos.competences, role === "etudiant");
    if (!controle.ok) return controle.message;
    return null;
  }

  async function enregistrerProfil(infos) {
    const session = await getSession();
    if (!session) return refus("Connectez-vous pour modifier votre profil.");

    const role = (await roleCourant()) || "etudiant";
    const probleme = validerProfil(infos, role);
    if (probleme) return refus(probleme);

    // Seuls les champs présents dans la page sont envoyés :
    // une espace étudiant n'efface pas les colonnes entreprise et inversement.
    const lignes = {};
    const champs = [
      ["prenom", 60], ["nom", 60], ["telephone", 30], ["ville", 80],
      ["etablissement", 120], ["diplome", 120], ["annee", 40],
      ["entreprise_nom", 120], ["entreprise_secteur", 120], ["entreprise_site", 200]
    ];

    champs.forEach(function (paire) {
      if (infos[paire[0]] !== undefined) lignes[paire[0]] = textePropre(infos[paire[0]], paire[1]);
    });

    if (infos.bio !== undefined) lignes.bio = String(infos.bio || "").trim();
    if (infos.competences !== undefined) {
      const controle = competencesPropres(infos.competences, role === "etudiant");
      if (!controle.ok) return refus(controle.message);
      lignes.competences = controle.competences;
    }
    if (infos.dispo !== undefined) {
      lignes.disponibilite = ["stage", "part_time", "les_deux"].indexOf(infos.dispo) >= 0
        ? infos.dispo : "les_deux";
    }

    try {
      const { data, error } = await client()
        .from("profiles")
        .update(lignes)
        .eq("user_id", session.user.id)
        .select("*")
        .maybeSingle();
      if (error) throw error;
      if (!data) return refus("Profil introuvable : rechargez la page.");
      return succes("Profil enregistré.", { profil: data });
    } catch (erreur) {
      return echec(erreur);
    }
  }

  // ---------- CV (Supabase Storage) ----------
  const TYPES_CV = {
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx"
  };
  const TAILLE_CV_MAX = 3 * 1024 * 1024; // 3 Mo (limite du conteneur)

  async function deposerCV(fichier) {
    const session = await getSession();
    if (!session) return refus("Connectez-vous pour déposer votre CV.");
    if (!fichier) return refus("Choisissez d'abord un fichier.");

    const extension = TYPES_CV[fichier.type];
    if (!extension) {
      return refus("Format non accepté : déposez un fichier PDF, DOC ou DOCX.");
    }
    if (fichier.size > TAILLE_CV_MAX) {
      return refus("Ce fichier dépasse 3 Mo. Compressez-le ou exportez-le en PDF.");
    }

    const chemin = session.user.id + "/cv-" + Date.now() + "." + extension;

    try {
      const { error: errUpload } = await client()
        .storage
        .from("cvs")
        .upload(chemin, fichier, { upsert: false, contentType: fichier.type });
      if (errUpload) throw errUpload;

      // Ancien CV remplacé : on retire l'objet devenu inutile
      const precedent = await chargerProfil();
      const ancienChemin = precedent.profil ? precedent.profil.cv_path : null;

      const { data, error } = await client()
        .from("profiles")
        .update({ cv_path: chemin })
        .eq("user_id", session.user.id)
        .select("cv_path")
        .maybeSingle();
      if (error) throw error;

      if (ancienChemin && ancienChemin !== chemin) {
        await client().storage.from("cvs").remove([ancienChemin]);
      }

      return succes("CV déposé.", { cv_path: data ? data.cv_path : chemin });
    } catch (erreur) {
      return echec(erreur);
    }
  }

  async function retirerCV() {
    const session = await getSession();
    if (!session) return refus("Connectez-vous pour retirer votre CV.");

    try {
      const resultat = await chargerProfil();
      if (!resultat.ok) return resultat;
      const chemin = resultat.profil ? resultat.profil.cv_path : null;
      if (!chemin) return refus("Aucun CV enregistré sur votre profil.");

      const { error } = await client()
        .from("profiles")
        .update({ cv_path: null })
        .eq("user_id", session.user.id);
      if (error) throw error;

      await client().storage.from("cvs").remove([chemin]);
      return succes("CV retiré de votre profil.");
    } catch (erreur) {
      return echec(erreur);
    }
  }

  // Lien temporaire (1 h) pour afficher un CV déposé.
  async function lienCV(chemin) {
    if (!chemin) return null;
    try {
      const { data, error } = await client().storage.from("cvs").createSignedUrl(chemin, 3600);
      if (error) throw error;
      return data ? data.signedUrl : null;
    } catch (erreur) {
      console.warn("MatchUp : CV non lisible.", erreur);
      return null;
    }
  }

  // ---------- Opportunités ----------
  function versBaseOffre(infos) {
    return {
      titre: textePropre(infos.titre, 140),
      type: infos.type === "part_time" ? "part_time" : "stage",
      description: String(infos.description || "").trim(),
      competences: competencesPropres(infos.competences, false).competences,
      ville: textePropre(infos.ville, 80),
      duree: textePropre(infos.duree, 60),
      remuneration: textePropre(infos.remuneration, 60),
      places: Math.max(1, Math.min(50, Math.round(Number(infos.places) || 1)))
    };
  }

  function validerOffre(infos) {
    const titre = textePropre(infos.titre, 140);
    if (titre.length < 3) return "Le titre de l'offre doit faire au moins 3 caractères.";
    if (["stage", "part_time"].indexOf(infos.type) < 0) {
      return "Choisissez un type : stage ou part time job.";
    }
    const controle = competencesPropres(infos.competences, true);
    if (!controle.ok) return controle.message;
    if (String(infos.description || "").length > 4000) return "La description est trop longue (4000 caractères maximum).";
    const places = Number(infos.places);
    if (!isFinite(places) || places < 1 || places > 50) return "Le nombre de places doit être compris entre 1 et 50.";
    return null;
  }

  async function creerOffre(infos) {
    const probleme = validerOffre(infos);
    if (probleme) return refus(probleme);
    const base = versBaseOffre(infos);

    try {
      const { data, error } = await client().rpc("creer_offre", {
        p_titre: base.titre,
        p_type: base.type,
        p_description: base.description,
        p_competences: base.competences,
        p_ville: base.ville,
        p_duree: base.duree,
        p_remuneration: base.remuneration,
        p_places: base.places
      });
      if (error) throw error;
      return succes("Offre publiée.", { offre: data ? data.offre : null });
    } catch (erreur) {
      return echec(erreur);
    }
  }

  async function modifierOffre(id, infos) {
    const probleme = validerOffre(infos);
    if (probleme) return refus(probleme);
    const base = versBaseOffre(infos);

    try {
      const { data, error } = await client()
        .from("opportunities")
        .update(base)
        .eq("id", id)
        .select("*")
        .maybeSingle();
      if (error) throw error;
      if (!data) return refus("Offre introuvable ou accès refusé.");
      return succes("Offre mise à jour.", { offre: data });
    } catch (erreur) {
      return echec(erreur);
    }
  }

  async function changerStatutOffre(id, statut) {
    if (!STATUTS_OFFRE[statut]) return refus("Statut inconnu.");
    try {
      const { data, error } = await client()
        .from("opportunities")
        .update({ statut: statut })
        .eq("id", id)
        .select("*")
        .maybeSingle();
      if (error) throw error;
      if (!data) return refus("Offre introuvable ou accès refusé.");
      return succes("Statut enregistré.", { offre: data });
    } catch (erreur) {
      return echec(erreur);
    }
  }

  async function supprimerOffre(id) {
    try {
      const { error } = await client().from("opportunities").delete().eq("id", id);
      if (error) throw error;
      return succes("Offre supprimée.");
    } catch (erreur) {
      return echec(erreur);
    }
  }

  // Offres visibles : ouvertes pour tous, plus les miennes.
  async function listerOffres(options) {
    const opts = options || {};
    try {
      let requete = client()
        .from("opportunities")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(opts.limite || LIMITE);

      if (opts.type) requete = requete.eq("type", opts.type);
      if (opts.statut) requete = requete.eq("statut", opts.statut);
      if (opts.entrepriseId) requete = requete.eq("entreprise_id", opts.entrepriseId);

      const { data, error } = await requete;
      if (error) throw error;
      return { ok: true, message: "", offres: data || [] };
    } catch (erreur) {
      return { ok: false, message: messageErreur(erreur), offres: [] };
    }
  }

  async function offre(id) {
    if (!id) return { ok: false, message: "Identifiant d'offre manquant.", offre: null };
    try {
      const { data, error } = await client()
        .from("opportunities")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return { ok: false, message: "Cette opportunité n'existe pas ou n'est plus visible.", offre: null };
      return { ok: true, message: "", offre: data };
    } catch (erreur) {
      return { ok: false, message: messageErreur(erreur), offre: null };
    }
  }

  // ---------- Candidatures ----------
  async function postuler(opportuniteId, motivation) {
    const texte = String(motivation || "").trim();
    if (texte.length < 20) {
      return refus("La lettre de motivation doit contenir au moins 20 caractères.");
    }
    try {
      const { data, error } = await client().rpc("postuler", {
        p_opportunite_id: opportuniteId,
        p_motivation: texte
      });
      if (error) throw error;
      return succes(
        data && data.duplicate
          ? "Vous avez déjà postulé à cette offre."
          : "Candidature envoyée.",
        { candidature: data ? data.candidature : null, duplicate: !!(data && data.duplicate) }
      );
    } catch (erreur) {
      return echec(erreur);
    }
  }

  async function mesCandidatures() {
    const session = await getSession();
    if (!session) return { ok: false, message: "Connectez-vous pour voir vos candidatures.", candidatures: [] };
    try {
      const { data, error } = await client()
        .from("applications")
        .select("*")
        .eq("etudiant_id", session.user.id)
        .order("created_at", { ascending: false })
        .limit(LIMITE);
      if (error) throw error;
      return { ok: true, message: "", candidatures: data || [] };
    } catch (erreur) {
      return { ok: false, message: messageErreur(erreur), candidatures: [] };
    }
  }

  async function candidaturesDeOffre(opportuniteId) {
    try {
      const { data, error } = await client()
        .from("applications")
        .select("*")
        .eq("opportunite_id", opportuniteId)
        .order("score", { ascending: false })
        .limit(LIMITE);
      if (error) throw error;
      return { ok: true, message: "", candidatures: data || [] };
    } catch (erreur) {
      return { ok: false, message: messageErreur(erreur), candidatures: [] };
    }
  }

  async function toutesLesCandidatures(filtre) {
    try {
      let requete = client()
        .from("applications")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .limit(LIMITE_ADMIN);
      if (filtre) requete = requete.eq("statut", filtre);
      const { data, error, count } = await requete;
      if (error) throw error;
      return {
        ok: true,
        message: "",
        candidatures: data || [],
        total: typeof count === "number" ? count : (data || []).length
      };
    } catch (erreur) {
      return { ok: false, message: messageErreur(erreur), candidatures: [], total: 0 };
    }
  }

  async function retirerCandidature(id) {
    try {
      const { data, error } = await client().rpc("retirer_candidature", { p_candidature_id: id });
      if (error) throw error;
      return succes("Candidature retirée.", { retrait: data });
    } catch (erreur) {
      return echec(erreur);
    }
  }

  async function statuerCandidature(id, statut) {
    if (!STATUTS_CANDIDATURE[statut]) return refus("Statut inconnu.");
    try {
      const { data, error } = await client().rpc("statuer_candidature", {
        p_candidature_id: id,
        p_statut: statut
      });
      if (error) throw error;
      return succes("Statut enregistré.", { candidature: data ? data.candidature : null });
    } catch (erreur) {
      return echec(erreur);
    }
  }

  async function selectionnerCandidature(id) {
    try {
      const { data, error } = await client().rpc("selectionner_candidature", {
        p_candidature_id: id
      });
      if (error) throw error;
      return succes("Candidat sélectionné : les autres candidatures sont refusées.", {
        candidature: data ? data.candidature : null
      });
    } catch (erreur) {
      return echec(erreur);
    }
  }

  // Profils des étudiants ayant postulé (le RLS n'autorise que ces lignes).
  async function profilsDesCandidats(identifiants) {
    const ids = Array.from(new Set((identifiants || []).filter(Boolean)));
    if (ids.length === 0) return { ok: true, message: "", profils: [] };
    try {
      const { data, error } = await client()
        .from("profiles")
        .select("*")
        .in("user_id", ids);
      if (error) throw error;
      return { ok: true, message: "", profils: data || [] };
    } catch (erreur) {
      return { ok: false, message: messageErreur(erreur), profils: [] };
    }
  }

  // ---------- Paiement des frais (entreprise) ----------
  async function payerFrais(candidatureId) {
    try {
      const { data, error } = await client().rpc("payer_frais", {
        p_candidature_id: candidatureId
      });
      if (error) throw error;
      return succes(
        data && data.duplicate
          ? "Ces frais ont déjà été réglés."
          : "Paiement simulé enregistré (aucune donnée bancaire).",
        { paiement: data ? data.paiement : null, montant: data ? data.montant : FRAIS_ACCORD }
      );
    } catch (erreur) {
      return echec(erreur);
    }
  }

  async function mesPaiements() {
    try {
      const { data, error } = await client()
        .from("paiements")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(LIMITE);
      if (error) throw error;
      return { ok: true, message: "", paiements: data || [] };
    } catch (erreur) {
      return { ok: false, message: messageErreur(erreur), paiements: [] };
    }
  }

  async function tousLesPaiements() {
    try {
      const { data, error } = await client()
        .from("paiements")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(LIMITE_ADMIN);
      if (error) throw error;
      const total = (data || []).reduce(function (somme, ligne) { return somme + Number(ligne.montant || 0); }, 0);
      return { ok: true, message: "", paiements: data || [], total: total };
    } catch (erreur) {
      return { ok: false, message: messageErreur(erreur), paiements: [], total: 0 };
    }
  }

  // ---------- Administration ----------
  async function listerUtilisateurs() {
    try {
      const rolesResult = await client()
        .from("user_roles")
        .select("user_id, role, created_at")
        .order("created_at", { ascending: false })
        .limit(LIMITE_ADMIN);
      if (rolesResult.error) throw rolesResult.error;

      const roles = rolesResult.data || [];
      const identifiants = roles.map(function (ligne) { return ligne.user_id; });

      let profils = [];
      if (identifiants.length) {
        const profilsResult = await client()
          .from("profiles")
          .select("*")
          .in("user_id", identifiants);
        if (profilsResult.error) throw profilsResult.error;
        profils = profilsResult.data || [];
      }

      const parId = {};
      profils.forEach(function (profil) { parId[profil.user_id] = profil; });

      const utilisateurs = roles.map(function (ligne) {
        const profil = parId[ligne.user_id] || {};
        return {
          user_id: ligne.user_id,
          role: ligne.role,
          created_at: ligne.created_at,
          email: profil.email || "",
          prenom: profil.prenom || "",
          nom: profil.nom || "",
          entreprise_nom: profil.entreprise_nom || "",
          cv_path: profil.cv_path || null
        };
      });

      return { ok: true, message: "", utilisateurs: utilisateurs };
    } catch (erreur) {
      return { ok: false, message: messageErreur(erreur), utilisateurs: [] };
    }
  }

  async function changerRole(userId, role) {
    if (!ROLES[role]) return refus("Rôle inconnu.");
    try {
      const { data, error } = await client()
        .from("user_roles")
        .update({ role: role })
        .eq("user_id", userId)
        .select("user_id, role");
      if (error) throw error;
      if (!data || data.length === 0) return refus("Compte introuvable ou droit refusé.");
      return succes("Rôle mis à jour : " + ROLES[role] + ".");
    } catch (erreur) {
      return echec(erreur);
    }
  }

  // ---------- Mise en correspondance ----------
  // Même règle que public.calculer_score() : part des compétences
  // exigées couvertes par le profil, variantes partielles acceptées.
  function calculerScore(competencesProfil, competencesOffre) {
    const exigees = Array.isArray(competencesOffre) ? competencesOffre : [];
    const miennes = Array.isArray(competencesProfil) ? competencesProfil : [];

    if (exigees.length === 0) return 50;
    if (miennes.length === 0) return 0;

    const norm = function (valeur) { return String(valeur || "").trim().toLowerCase(); };
    const mesNormes = miennes.map(norm).filter(Boolean);

    let ok = 0;
    exigees.forEach(function (exigee) {
      const attendue = norm(exigee);
      if (!attendue) return;
      const trouve = mesNormes.some(function (mienne) {
        return mienne === attendue ||
          (mienne.length >= 3 && attendue.indexOf(mienne) >= 0) ||
          (attendue.length >= 3 && mienne.indexOf(attendue) >= 0);
      });
      if (trouve) ok += 1;
    });

    return Math.round((ok * 100) / exigees.length);
  }

  // Offres les mieux adaptées au profil (tri décroissant).
  function recommandations(competencesProfil, offres, aPostule) {
    const dejaVues = {};
    (Array.isArray(aPostule) ? aPostule : []).forEach(function (id) { dejaVues[id] = true; });

    return (offres || [])
      .filter(function (offreItem) { return offreItem.statut === "ouverte"; })
      .map(function (offreItem) {
        return {
          offre: offreItem,
          score: calculerScore(competencesProfil, offreItem.competences)
        };
      })
      .filter(function (ligne) { return ligne.score > 0 && !dejaVues[ligne.offre.id]; })
      .sort(function (a, b) { return b.score - a.score; });
  }

  return {
    LIMITE: LIMITE,
    LIMITE_ADMIN: LIMITE_ADMIN,
    FRAIS_ACCORD: FRAIS_ACCORD,
    TYPES_OFFRE: TYPES_OFFRE,
    STATUTS_CANDIDATURE: STATUTS_CANDIDATURE,
    STATUTS_OFFRE: STATUTS_OFFRE,
    ROLES: ROLES,
    DISPO: DISPO,
    formatMontant: formatMontant,
    libelle: libelle,
    emailValide: emailValide,
    textePropre: textePropre,
    texteVersCompetences: texteVersCompetences,
    competencesVersTexte: competencesVersTexte,
    competencesPropres: competencesPropres,
    messageErreur: messageErreur,
    getSession: getSession,
    utilisateurCourant: utilisateurCourant,
    ecouterAuth: ecouterAuth,
    roleCourant: roleCourant,
    estAdmin: estAdmin,
    destinationRole: destinationRole,
    inscrire: inscrire,
    connecter: connecter,
    deconnecter: deconnecter,
    confirmerRedirection: confirmerRedirection,
    chargerProfil: chargerProfil,
    enregistrerProfil: enregistrerProfil,
    deposerCV: deposerCV,
    retirerCV: retirerCV,
    lienCV: lienCV,
    creerOffre: creerOffre,
    modifierOffre: modifierOffre,
    changerStatutOffre: changerStatutOffre,
    supprimerOffre: supprimerOffre,
    listerOffres: listerOffres,
    offre: offre,
    postuler: postuler,
    mesCandidatures: mesCandidatures,
    candidaturesDeOffre: candidaturesDeOffre,
    toutesLesCandidatures: toutesLesCandidatures,
    retirerCandidature: retirerCandidature,
    statuerCandidature: statuerCandidature,
    selectionnerCandidature: selectionnerCandidature,
    profilsDesCandidats: profilsDesCandidats,
    payerFrais: payerFrais,
    mesPaiements: mesPaiements,
    tousLesPaiements: tousLesPaiements,
    listerUtilisateurs: listerUtilisateurs,
    changerRole: changerRole,
    calculerScore: calculerScore,
    recommandations: recommandations
  };
})();

window.Api = Api;
