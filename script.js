// ==========================================
// MatchUp - Interactions du site + raccordement Supabase
// Ce fichier ne gère NI l'authentification NI les requêtes :
// tout passe par Api (supabase-api.js).
// ==========================================

// ------------------------------------------
// Menu mobile
// ------------------------------------------
const boutonMenu = document.getElementById('bouton-menu');
const menu = document.getElementById('menu');
if (boutonMenu && menu) {
  boutonMenu.addEventListener('click', function () {
    menu.classList.toggle('ouvert');
  });
}

// Bouton "retour en haut"
const retourHaut = document.getElementById('retour-haut');
if (retourHaut) {
  window.addEventListener('scroll', function () {
    retourHaut.style.display = window.scrollY > 300 ? 'block' : 'none';
  });
  retourHaut.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

// FAQ : afficher / masquer les réponses
document.querySelectorAll('.faq-question').forEach(function (question) {
  question.addEventListener('click', function () {
    question.nextElementSibling.classList.toggle('ouvert');
  });
});

// Formulaire de contact (démo, aucune base)
const formulaireContact = document.getElementById('formulaire-contact');
if (formulaireContact) {
  formulaireContact.addEventListener('submit', function (event) {
    event.preventDefault();
    const nom = document.getElementById('nom').value.trim();
    const email = document.getElementById('email').value.trim();
    const message = document.getElementById('message').value.trim();
    const retour = document.getElementById('retour-formulaire');

    if (nom === '' || email === '' || message === '') {
      retour.className = 'message-erreur';
      retour.textContent = 'Merci de remplir tous les champs.';
    } else if (!email.includes('@')) {
      retour.className = 'message-erreur';
      retour.textContent = "L'adresse email n'est pas valide.";
    } else {
      retour.className = 'message-ok';
      retour.textContent = 'Merci ' + nom + ' ! Votre message a bien été pris en compte (démonstration).';
      formulaireContact.reset();
    }
  });
}

// ------------------------------------------
// Utilitaires de rendu
// ------------------------------------------
function afficher(element, texte, classe) {
  if (!element) return;
  element.textContent = texte || '';
  element.className = classe || '';
}

function occuperBouton(bouton, occupe, libelleAttente) {
  if (!bouton) return;
  if (occupe) {
    if (!bouton.dataset.libelle) bouton.dataset.libelle = bouton.textContent;
    bouton.disabled = true;
    bouton.textContent = libelleAttente || 'Veuillez patienter…';
  } else {
    bouton.disabled = false;
    if (bouton.dataset.libelle) bouton.textContent = bouton.dataset.libelle;
  }
}

function parametre(nom) {
  return new URLSearchParams(window.location.search).get(nom);
}

function pageActuelle() {
  return window.location.pathname.split('/').pop() || 'index.html';
}

function versPage(nom) {
  window.location.href = nom;
}

function creer(tag, classe, texte) {
  const element = document.createElement(tag);
  if (classe) element.className = classe;
  if (texte !== undefined && texte !== null) element.textContent = texte;
  return element;
}

function formatDate(valeur) {
  if (!valeur) return '—';
  try {
    return new Date(valeur).toLocaleDateString('fr-FR', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
  } catch (e) {
    return valeur;
  }
}

function badge(classe, texte) {
  return creer('span', 'badge-statut ' + classe, texte);
}

function badgeStatutCandidature(statut) {
  const classes = {
    en_attente: 'statut-en_attente',
    selectionnee: 'statut-selectionnee',
    acceptee: 'statut-terminee',
    refusee: 'statut-annulee'
  };
  return badge(classes[statut] || '', Api.libelle('candidature', statut));
}

function badgeStatutOffre(statut) {
  const classes = {
    ouverte: 'statut-terminee',
    pourvue: 'statut-en_preparation',
    fermee: 'statut-annulee'
  };
  return badge(classes[statut] || '', Api.libelle('offre', statut));
}

function badgeScore(score) {
  let classe = 'score-faible';
  if (score >= 75) classe = 'score-fort';
  else if (score >= 45) classe = 'score-moyen';
  return creer('span', 'badge-score ' + classe, score + ' % compatible');
}

function tagCompetence(valeur) {
  return creer('span', 'tag-competence', valeur);
}

function listeTags(competences, classe) {
  const zone = creer('div', classe || 'tags');
  const liste = Array.isArray(competences) ? competences : [];
  if (liste.length === 0) {
    zone.appendChild(creer('span', 'aide', 'Aucune compétence renseignée.'));
    return zone;
  }
  liste.forEach(function (mot) { zone.appendChild(tagCompetence(mot)); });
  return zone;
}

function ligneInfo(libelle, valeur) {
  const ligne = creer('div');
  ligne.appendChild(creer('dt', null, libelle));
  ligne.appendChild(creer('dd', null, valeur || '—'));
  return ligne;
}

// Contrôle d'accès aux espaces personnels
async function ouvrirEspace(roleAttendu) {
  const session = await Api.getSession();
  if (!session) {
    versPage('login.html?retour=' + encodeURIComponent(pageActuelle()));
    return null;
  }
  const role = await Api.roleCourant();
  if (role !== roleAttendu) {
    versPage(Api.destinationRole(role));
    return null;
  }
  return { session: session, role: role };
}

function messageScriptsManquants() {
  const cibles = ['retour-inscription', 'retour-connexion', 'retour-compte', 'retour-profil'];
  cibles.forEach(function (id) {
    afficher(document.getElementById(id), 'Service indisponible (scripts Supabase manquants).', 'message-erreur');
  });
  ['offres-etat', 'etat-recommandees', 'etat-candidatures', 'etat-offres-admin'].forEach(function (id) {
    afficher(document.getElementById(id), 'Service indisponible (scripts Supabase manquants).', 'message-erreur');
  });
}

// ------------------------------------------
// Navigation : état du compte + lien Admin
// ------------------------------------------
function majNavigation(session, role) {
  const lienCompte = document.getElementById('lien-compte');
  const lienComptePied = document.getElementById('lien-compte-pied');
  const elementAdmin = document.getElementById('element-lien-admin');
  const lienAdminPied = document.getElementById('lien-admin-pied');
  const estAdmin = role === 'admin';

  [lienCompte, lienComptePied].forEach(function (lien) {
    if (!lien) return;
    if (session) {
      lien.href = Api.destinationRole(role);
      lien.textContent = 'Mon espace';
    } else {
      lien.href = 'login.html';
      lien.textContent = 'Connexion';
    }
  });

  if (elementAdmin) elementAdmin.hidden = !estAdmin;
  if (lienAdminPied) lienAdminPied.hidden = !estAdmin;
}

async function raccorderNavigation() {
  const session = await Api.getSession();
  const role = session ? await Api.roleCourant() : null;
  majNavigation(session, role);
  Api.ecouterAuth(async function (sessionActive) {
    const roleActif = sessionActive ? await Api.roleCourant() : null;
    majNavigation(sessionActive, roleActif);
  });
}

// ------------------------------------------
// Inscription (choix du rôle)
// ------------------------------------------
function brancherInscription() {
  const formulaire = document.getElementById('formulaire-inscription');
  if (!formulaire) return;

  const retour = document.getElementById('retour-inscription');
  const bouton = document.getElementById('bouton-inscription');
  const zoneSucces = document.getElementById('inscription-reussie');

  // signup.html?role=entreprise pré-sélectionne le bon profil
  const roleDemande = parametre('role');
  const radio = document.getElementById(roleDemande === 'entreprise' ? 'role-entreprise' : 'role-etudiant');
  if (radio) radio.checked = true;

  formulaire.addEventListener('submit', async function (event) {
    event.preventDefault();
    afficher(retour, '', '');

    const roleChoisi = (document.querySelector('input[name="role"]:checked') || {}).value || 'etudiant';
    occuperBouton(bouton, true, 'Création du compte…');

    const resultat = await Api.inscrire({
      prenom: document.getElementById('prenom').value,
      nom: document.getElementById('nom').value,
      email: document.getElementById('email-inscription').value,
      motDePasse: document.getElementById('mot-de-passe').value,
      confirmation: document.getElementById('confirmation').value,
      role: roleChoisi
    });

    if (!resultat.ok) {
      occuperBouton(bouton, false);
      afficher(retour, resultat.message, 'message-erreur');
      return;
    }

    if (resultat.details && resultat.details.sessionImmediate) {
      versPage(Api.destinationRole(roleChoisi));
      return;
    }

    formulaire.hidden = true;
    if (zoneSucces) {
      zoneSucces.hidden = false;
      afficher(document.getElementById('inscription-succes-message'), resultat.message, 'message-ok');
    }
  });
}

// ------------------------------------------
// Connexion : redirection selon le rôle
// ------------------------------------------
function brancherConnexion() {
  const formulaire = document.getElementById('formulaire-connexion');
  if (!formulaire) return;

  const retour = document.getElementById('retour-connexion');
  const bouton = document.getElementById('bouton-connexion');

  formulaire.addEventListener('submit', async function (event) {
    event.preventDefault();
    afficher(retour, '', '');
    occuperBouton(bouton, true, 'Connexion…');

    const resultat = await Api.connecter(
      document.getElementById('email-connexion').value,
      document.getElementById('mot-de-passe-connexion').value
    );
    occuperBouton(bouton, false);

    if (!resultat.ok) {
      afficher(retour, resultat.message, 'message-erreur');
      return;
    }

    const retourSouhaite = parametre('retour');
    if (retourSouhaite && /^[a-zA-Z0-9_-]+\.html(\?[a-zA-Z0-9_=&%-]+)?$/.test(retourSouhaite)) {
      versPage(retourSouhaite);
      return;
    }
    versPage(resultat.details.destination);
  });
}

// ------------------------------------------
// Confirmation d'e-mail
// ------------------------------------------
function brancherVerification() {
  const zone = document.getElementById('zone-verification');
  if (!zone) return;

  const message = document.getElementById('message-verification');
  const boutonVerifier = document.getElementById('bouton-verifier');

  async function evaluer() {
    const resultat = await Api.confirmerRedirection();
    if (resultat.details && resultat.details.session) {
      afficher(message, resultat.message || 'E-mail confirmé.', 'message-ok');
      return;
    }
    if (!resultat.ok) {
      afficher(message, resultat.message, 'message-erreur');
      return;
    }
    afficher(
      message,
      "Aucune session active : ouvrez le lien reçu par e-mail depuis cette même adresse, " +
      "puis réessayez. Si aucun e-mail n'arrive, patientez quelques minutes et vérifiez " +
      "les courriers indésirables.",
      'message-erreur'
    );
  }

  evaluer();

  if (boutonVerifier) {
    boutonVerifier.addEventListener('click', async function () {
      occuperBouton(boutonVerifier, true, 'Vérification…');
      await evaluer();
      occuperBouton(boutonVerifier, false);
    });
  }
}

// ------------------------------------------
// Page compte : identité + accès à l'espace
// ------------------------------------------
function brancherCompte() {
  const espace = document.getElementById('espace-compte');
  if (!espace) return;

  const champEmail = document.getElementById('compte-email');
  const champPrenom = document.getElementById('compte-prenom');
  const champNom = document.getElementById('compte-nom');
  const badgeRole = document.getElementById('compte-role');
  const lienEspace = document.getElementById('compte-lien-espace');
  const lienAdmin = document.getElementById('compte-lien-admin');
  const boutonDeconnexion = document.getElementById('bouton-deconnexion');
  const retour = document.getElementById('retour-compte');
  const resume = document.getElementById('compte-resume');

  async function charger() {
    const session = await Api.getSession();
    if (!session) {
      versPage('login.html?retour=compte.html');
      return;
    }

    const role = (await Api.roleCourant()) || 'etudiant';
    const meta = session.user.user_metadata || {};

    champEmail.textContent = session.user.email || '—';
    champPrenom.textContent = meta.prenom || '—';
    champNom.textContent = meta.nom || '—';
    badgeRole.textContent = Api.libelle('role', role);
    badgeRole.className = role === 'admin' ? 'badge-role admin' : 'badge-role';

    if (lienEspace) {
      lienEspace.href = Api.destinationRole(role);
      lienEspace.textContent = role === 'admin' ? "Ouvrir l'administration"
        : role === 'entreprise' ? 'Ouvrir mon espace entreprise'
        : 'Ouvrir mon espace étudiant';
    }
    if (lienAdmin) lienAdmin.hidden = role !== 'admin';

    // Résumé selon le rôle
    if (resume) {
      resume.innerHTML = '';
      if (role === 'etudiant') {
        const resultat = await Api.mesCandidatures();
        if (resultat.ok) {
          const enAttente = resultat.candidatures.filter(function (c) { return c.statut === 'en_attente'; }).length;
          const retenues = resultat.candidatures.filter(function (c) { return c.statut === 'selectionnee'; }).length;
          resume.appendChild(creer('li', null, resultat.candidatures.length + ' candidature(s) envoyée(s)'));
          resume.appendChild(creer('li', null, enAttente + ' en attente de réponse'));
          resume.appendChild(creer('li', null, retenues + ' sélection(s) en cours'));
          const lien = creer('li');
          const a = creer('a', 'lien-vif', 'Voir mes candidatures →');
          a.href = 'etudiant.html';
          lien.appendChild(a);
          resume.appendChild(lien);
        }
      } else if (role === 'entreprise') {
        const offres = await Api.listerOffres({ entrepriseId: session.user.id });
        if (offres.ok) {
          const ouvertes = offres.offres.filter(function (o) { return o.statut === 'ouverte'; }).length;
          resume.appendChild(creer('li', null, offres.offres.length + ' offre(s) publiée(s)'));
          resume.appendChild(creer('li', null, ouvertes + ' offre(s) ouverte(s)'));
          const lien = creer('li');
          const a = creer('a', 'lien-vif', 'Gérer mes offres →');
          a.href = 'entreprise.html';
          lien.appendChild(a);
          resume.appendChild(lien);
        }
      } else {
        const lien = creer('li');
        const a = creer('a', 'lien-vif', 'Gérer les comptes et les offres →');
        a.href = 'admin.html';
        lien.appendChild(a);
        resume.appendChild(lien);
      }
    }
  }

  charger();

  if (boutonDeconnexion) {
    boutonDeconnexion.addEventListener('click', async function () {
      occuperBouton(boutonDeconnexion, true, 'Déconnexion…');
      const resultat = await Api.deconnecter();
      if (resultat.ok) {
        versPage('index.html');
        return;
      }
      occuperBouton(boutonDeconnexion, false);
      afficher(retour, resultat.message, 'message-erreur');
    });
  }
}

// ------------------------------------------
// Catalogue public des opportunités
// ------------------------------------------
function carteOffre(offreItem, score) {
  const carte = creer('article', 'carte offre-carte');
  const contenu = creer('div', 'contenu');

  const ligneHaut = creer('div', 'offre-haut');
  ligneHaut.appendChild(creer('span', 'etiquette', Api.libelle('type', offreItem.type)));
  if (typeof score === 'number') ligneHaut.appendChild(badgeScore(score));
  contenu.appendChild(ligneHaut);

  contenu.appendChild(creer('h3', null, offreItem.titre));
  contenu.appendChild(creer('p', 'offre-entreprise',
    (offreItem.entreprise_nom || 'Entreprise') + (offreItem.ville ? ' · ' + offreItem.ville : '')));

  const description = String(offreItem.description || '');
  contenu.appendChild(creer('p', 'offre-extrait',
    description ? (description.length > 130 ? description.slice(0, 130).trim() + '…' : description)
                : 'Aucune description fournie.'));

  contenu.appendChild(listeTags(offreItem.competences, 'tags compact'));

  const meta = creer('div', 'offre-meta');
  if (offreItem.duree) meta.appendChild(creer('span', null, 'Durée : ' + offreItem.duree));
  if (offreItem.remuneration) meta.appendChild(creer('span', null, 'Rémunération : ' + offreItem.remuneration));
  meta.appendChild(creer('span', null, offreItem.places + ' place(s)'));
  contenu.appendChild(meta);

  const bouton = creer('a', 'bouton contour-bleu', 'Voir l\'offre');
  bouton.href = 'opportunite.html?id=' + encodeURIComponent(offreItem.id);
  contenu.appendChild(bouton);

  carte.appendChild(contenu);
  return carte;
}

async function brancherOffres() {
  const zone = document.getElementById('offres-liste');
  if (!zone) return;

  const etat = document.getElementById('offres-etat');
  const champRecherche = document.getElementById('filtre-recherche');
  const champType = document.getElementById('filtre-type');
  const champTri = document.getElementById('filtre-tri');
  const zoneReco = document.getElementById('liste-recommandees');
  const etatReco = document.getElementById('etat-recommandees');
  const blocReco = document.getElementById('bloc-recommandees');

  let offres = [];
  let profil = null;
  let candidatures = [];
  let session = null;

  async function contexte() {
    session = await Api.getSession();
    if (!session) return;
    const role = await Api.roleCourant();
    if (role !== 'etudiant') return;
    const resultat = await Api.chargerProfil();
    if (resultat.ok) profil = resultat.profil;
    const mes = await Api.mesCandidatures();
    if (mes.ok) candidatures = mes.candidatures;
  }

  function score(offreItem) {
    if (!profil) return null;
    return Api.calculerScore(profil.competences, offreItem.competences);
  }

  function filtrer() {
    const recherche = (champRecherche ? champRecherche.value : '').trim().toLowerCase();
    const type = champType ? champType.value : '';
    const tri = champTri ? champTri.value : 'recente';

    let liste = offres.filter(function (offreItem) {
      if (type && offreItem.type !== type) return false;
      if (!recherche) return true;
      const foin = [
        offreItem.titre, offreItem.entreprise_nom, offreItem.ville,
        offreItem.description, (offreItem.competences || []).join(' ')
      ].join(' ').toLowerCase();
      return foin.indexOf(recherche) >= 0;
    });

    if (tri === 'score' && profil) {
      liste = liste.slice().sort(function (a, b) {
        return Api.calculerScore(profil.competences, b.competences) -
               Api.calculerScore(profil.competences, a.competences);
      });
    }

    zone.innerHTML = '';
    if (liste.length === 0) {
      zone.className = '';
      afficher(etat, 'Aucune offre ne correspond à ces critères.', 'etat-vide');
      return;
    }
    zone.className = 'grille';
    afficher(etat, '', '');
    liste.forEach(function (offreItem) {
      zone.appendChild(carteOffre(offreItem, score(offreItem)));
    });
  }

  function rendreRecommandees() {
    if (!blocReco) return;
    if (!profil) {
      blocReco.hidden = true;
      return;
    }
    blocReco.hidden = false;
    const dejaPostule = candidatures.map(function (c) { return c.opportunite_id; });
    const liste = Api.recommandations(profil.competences, offres, dejaPostule).slice(0, 4);

    zoneReco.innerHTML = '';
    if (liste.length === 0) {
      afficher(etatReco,
        (profil.competences || []).length === 0
          ? 'Complétez vos compétences dans votre profil pour recevoir des recommandations.'
          : 'Aucune nouvelle recommandation : toutes les offres compatibles ont déjà été consultées.',
        'etat-vide');
      return;
    }
    afficher(etatReco, '', '');
    liste.forEach(function (ligne) {
      zoneReco.appendChild(carteOffre(ligne.offre, ligne.score));
    });
  }

  async function charger() {
    afficher(etat, 'Chargement des offres…', 'etat-vide');
    const resultat = await Api.listerOffres({});
    if (!resultat.ok) {
      afficher(etat, resultat.message, 'message-erreur');
      return;
    }
    offres = resultat.offres;
    await contexte();
    rendreRecommandees();
    filtrer();
  }

  [champRecherche, champType, champTri].forEach(function (champ) {
    if (champ) champ.addEventListener('input', filtrer);
    if (champ) champ.addEventListener('change', filtrer);
  });

  charger();
}

// ------------------------------------------
// Détail d'une opportunité + candidature
// ------------------------------------------
function brancherOffreDetail() {
  const zone = document.getElementById('offre-contenu');
  if (!zone) return;

  const chargement = document.getElementById('offre-chargement');
  const etat = document.getElementById('offre-etat');

  async function charger() {
    const id = parametre('id');
    if (!id) {
      if (chargement) chargement.hidden = true;
      afficher(etat, 'Aucune offre à afficher. Parcourez la liste des offres.', 'message-erreur');
      return;
    }

    const resultat = await Api.offre(id);
    if (chargement) chargement.hidden = true;
    if (!resultat.ok) {
      afficher(etat, resultat.message, 'message-erreur');
      return;
    }
    afficher(etat, '', '');
    const offreItem = resultat.offre;

    zone.innerHTML = '';

    const entete = creer('div', 'offre-entete');
    const titres = creer('div');
    titres.appendChild(creer('span', 'etiquette', Api.libelle('type', offreItem.type)));
    titres.appendChild(creer('h2', null, offreItem.titre));
    titres.appendChild(creer('p', 'offre-entreprise',
      (offreItem.entreprise_nom || 'Entreprise') + (offreItem.ville ? ' · ' + offreItem.ville : '')));
    entete.appendChild(titres);
    entete.appendChild(badgeStatutOffre(offreItem.statut));
    zone.appendChild(entete);

    const metas = creer('div', 'offre-meta-large');
    [
      ['Durée', offreItem.duree],
      ['Rémunération', offreItem.remuneration],
      ['Places', String(offreItem.places)],
      ['Publiée le', formatDate(offreItem.created_at)]
    ].forEach(function (paire) {
      if (!paire[1]) return;
      const bloc = creer('div', 'bloc-meta');
      bloc.appendChild(creer('span', 'libelle', paire[0]));
      bloc.appendChild(creer('span', 'valeur', paire[1]));
      metas.appendChild(bloc);
    });
    zone.appendChild(metas);

    zone.appendChild(creer('h3', 'titre-bloc', 'Description du poste'));
    zone.appendChild(creer('p', 'texte-description', String(offreItem.description || 'Aucune description fournie.')));

    zone.appendChild(creer('h3', 'titre-bloc', 'Compétences exigées'));
    zone.appendChild(listeTags(offreItem.competences, 'tags'));

    zone.appendChild(zoneCandidature(offreItem));
  }

  // Bloc de candidature adapté au visiteur
  function zoneCandidature(offreItem) {
    const bloc = creer('div', 'carte-contenu zone-candidature');

    if (!offreItem) {
      bloc.appendChild(creer('p', 'etat-vide', 'Offre introuvable.'));
      return bloc;
    }

    Api.getSession().then(async function (session) {
      if (!session) {
        bloc.appendChild(creer('h3', 'titre-bloc', 'Postuler à cette offre'));
        bloc.appendChild(creer('p', null, 'Connectez-vous avec un compte étudiant pour envoyer votre candidature.'));
        const lien = creer('a', 'bouton', 'Se connecter');
        lien.href = 'login.html?retour=' + encodeURIComponent('opportunite.html?id=' + offreItem.id);
        bloc.appendChild(lien);
        return;
      }

      const role = await Api.roleCourant();
      if (role !== 'etudiant') {
        bloc.appendChild(creer('p', 'etat-vide',
          role === 'entreprise'
            ? 'Les candidatures sont réservées aux comptes étudiants.'
            : 'Vous êtes connecté(e) en tant qu\'administrateur.'));
        return;
      }

      const profilResultat = await Api.chargerProfil();
      const profil = profilResultat.profil;
      if (profil) {
        const score = Api.calculerScore(profil.competences, offreItem.competences);
        const entete = creer('div', 'correspondance');
        entete.appendChild(badgeScore(score));
        entete.appendChild(creer('span', 'aide',
          (profil.competences || []).length === 0
            ? 'Renseignez vos compétences pour améliorer la correspondance.'
            : 'Basé sur vos compétences déclarées.'));
        bloc.appendChild(entete);
      }

      const mes = await Api.mesCandidatures();
      const existante = mes.ok
        ? mes.candidatures.find(function (c) { return c.opportunite_id === offreItem.id; })
        : null;

      if (existante) {
        const ligne = creer('div', 'deja-postule');
        ligne.appendChild(badgeStatutCandidature(existante.statut));
        ligne.appendChild(creer('span', null,
          'Vous avez postulé le ' + formatDate(existante.created_at) + '.'));
        const lien = creer('a', 'bouton contour-bleu', 'Suivre ma candidature');
        lien.href = 'etudiant.html';
        ligne.appendChild(lien);
        bloc.appendChild(ligne);
        return;
      }

      if (offreItem.statut !== 'ouverte') {
        bloc.appendChild(creer('p', 'etat-vide', 'Cette offre n\'est plus ouverte aux candidatures.'));
        return;
      }

      const formulaire = creer('form');
      formulaire.id = 'formulaire-candidature';
      formulaire.appendChild(creer('h3', 'titre-bloc', 'Envoyer ma candidature'));
      formulaire.appendChild(creer('label', null, 'Lettre de motivation'));

      const zoneTexte = creer('textarea');
      zoneTexte.id = 'candidature-motivation';
      zoneTexte.required = true;
      zoneTexte.minLength = 20;
      zoneTexte.placeholder = 'Présentez-vous en quelques phrases : votre parcours, vos compétences, votre motivation pour ce poste.';
      formulaire.appendChild(zoneTexte);
      formulaire.appendChild(creer('p', 'aide', '20 caractères minimum.'));

      const retour = creer('p');
      retour.id = 'retour-candidature';
      retour.setAttribute('role', 'alert');
      formulaire.appendChild(retour);

      const bouton = creer('button', 'bouton', 'Envoyer ma candidature');
      bouton.type = 'submit';
      bouton.id = 'bouton-postuler';
      formulaire.appendChild(bouton);

      formulaire.addEventListener('submit', async function (event) {
        event.preventDefault();
        afficher(retour, '', '');
        occuperBouton(bouton, true, 'Envoi de la candidature…');
        const resultat = await Api.postuler(offreItem.id, zoneTexte.value);
        occuperBouton(bouton, false);

        if (!resultat.ok) {
          afficher(retour, resultat.message, 'message-erreur');
          return;
        }
        formulaire.hidden = true;
        const confirmation = creer('div', 'message-ok confirmation-postul');
        confirmation.textContent = resultat.message + ' Vous pouvez suivre son état depuis votre espace étudiant.';
        formulaire.parentNode.insertBefore(confirmation, formulaire);
      });

      bloc.appendChild(formulaire);
    });

    return bloc;
  }

  charger();
}

// ------------------------------------------
// Espace étudiant : profil, CV, recommandations, candidatures
// ------------------------------------------
function brancherEspaceEtudiant() {
  const espace = document.getElementById('espace-etudiant');
  if (!espace) return;

  const formulaire = document.getElementById('formulaire-profil');
  const retourProfil = document.getElementById('retour-profil');
  const boutonEnregistrer = document.getElementById('bouton-enregistrer-profil');
  const boutonDeconnexion = document.getElementById('bouton-deconnexion');

  const champCV = document.getElementById('cv-fichier');
  const etatCV = document.getElementById('cv-etat');
  const retourCV = document.getElementById('retour-cv');
  const boutonDepot = document.getElementById('bouton-deposer-cv');
  const boutonRetirer = document.getElementById('bouton-retirer-cv');
  const boutonVoir = document.getElementById('bouton-voir-cv');

  const listeReco = document.getElementById('liste-recommandees');
  const etatReco = document.getElementById('etat-recommandees');
  const listeCand = document.getElementById('liste-candidatures');
  const etatCand = document.getElementById('etat-candidatures');

  let profil = null;

  function remplir(profilItem) {
    profil = profilItem;
    if (!profilItem) return;
    document.getElementById('profil-prenom').value = profilItem.prenom || '';
    document.getElementById('profil-nom').value = profilItem.nom || '';
    document.getElementById('profil-telephone').value = profilItem.telephone || '';
    document.getElementById('profil-ville').value = profilItem.ville || '';
    document.getElementById('profil-etablissement').value = profilItem.etablissement || '';
    document.getElementById('profil-diplome').value = profilItem.diplome || '';
    document.getElementById('profil-annee').value = profilItem.annee || '';
    document.getElementById('profil-dispo').value = profilItem.disponibilite || 'les_deux';
    document.getElementById('profil-competences').value = Api.competencesVersTexte(profilItem.competences);
    document.getElementById('profil-bio').value = profilItem.bio || '';
    majEtatCV(profilItem.cv_path);
  }

  function majEtatCV(chemin) {
    if (!etatCV) return;
    if (chemin) {
      etatCV.textContent = 'CV enregistré : ' + chemin.split('/').pop();
      etatCV.className = 'cv-etat ok';
      if (boutonRetirer) boutonRetirer.hidden = false;
      if (boutonVoir) boutonVoir.hidden = false;
    } else {
      etatCV.textContent = 'Aucun CV déposé pour le moment (PDF, DOC ou DOCX, 3 Mo maximum).';
      etatCV.className = 'cv-etat';
      if (boutonRetirer) boutonRetirer.hidden = true;
      if (boutonVoir) boutonVoir.hidden = true;
    }
    if (boutonDepot) boutonDepot.disabled = !chemin;
  }

  async function chargerRecommandations() {
    if (!listeReco) return;
    const offres = await Api.listerOffres({});
    if (!offres.ok) {
      afficher(etatReco, offres.message, 'message-erreur');
      return;
    }
    const mes = await Api.mesCandidatures();
    const dejaPostule = mes.ok ? mes.candidatures.map(function (c) { return c.opportunite_id; }) : [];
    const liste = Api.recommandations(profil ? profil.competences : [], offres.offres, dejaPostule).slice(0, 3);

    listeReco.innerHTML = '';
    if (liste.length === 0) {
      afficher(etatReco,
        !profil || (profil.competences || []).length === 0
          ? 'Ajoutez vos compétences dans votre profil pour recevoir les offres les plus adaptées.'
          : 'Aucune nouvelle recommandation pour l\'instant.',
        'etat-vide');
      return;
    }
    afficher(etatReco, '', '');
    liste.forEach(function (ligne) {
      listeReco.appendChild(carteOffre(ligne.offre, ligne.score));
    });
  }

  async function chargerCandidatures() {
    if (!listeCand) return;
    listeCand.innerHTML = '';
    const resultat = await Api.mesCandidatures();
    if (!resultat.ok) {
      afficher(etatCand, resultat.message, 'message-erreur');
      return;
    }
    if (resultat.candidatures.length === 0) {
      afficher(etatCand, 'Aucune candidature envoyée pour le moment. Consultez les offres ouvertes.', 'etat-vide');
      return;
    }
    afficher(etatCand, '', '');

    resultat.candidatures.forEach(function (candidature) {
      const ligne = creer('article', 'ligne-candidature');

      const principal = creer('div', 'ligne-principal');
      const infos = creer('div', 'ligne-infos');
      infos.appendChild(creer('h4', null, candidature.offre_titre || 'Offre'));
      infos.appendChild(creer('p', 'offre-entreprise',
        (candidature.entreprise_nom || 'Entreprise') + (candidature.offre_ville ? ' · ' + candidature.offre_ville : '')));
      infos.appendChild(creer('p', 'aide', 'Envoyée le ' + formatDate(candidature.created_at)));
      principal.appendChild(infos);

      const cotes = creer('div', 'ligne-cotes');
      cotes.appendChild(badgeScore(candidature.score));
      cotes.appendChild(badgeStatutCandidature(candidature.statut));
      principal.appendChild(cotes);
      ligne.appendChild(principal);

      const detail = creer('div', 'ligne-detail');
      detail.appendChild(creer('p', null, candidature.motivation || ''));
      const actions = creer('div', 'boutons-actions');
      const lien = creer('a', 'bouton petit contour-bleu', 'Voir l\'offre');
      lien.href = 'opportunite.html?id=' + encodeURIComponent(candidature.opportunite_id);
      actions.appendChild(lien);

      if (candidature.statut === 'en_attente') {
        const boutonRetirer = creer('button', 'bouton petit contour', 'Retirer ma candidature');
        boutonRetirer.type = 'button';
        boutonRetirer.addEventListener('click', async function () {
          const accord = window.confirm('Retirer votre candidature à « ' + candidature.offre_titre + ' » ?');
          if (!accord) return;
          occuperBouton(boutonRetirer, true, 'Retrait…');
          const retrait = await Api.retirerCandidature(candidature.id);
          occuperBouton(boutonRetirer, false);
          if (!retrait.ok) {
            window.alert(retrait.message);
            return;
          }
          chargerCandidatures();
          chargerRecommandations();
        });
        actions.appendChild(boutonRetirer);
      }
      detail.appendChild(actions);
      ligne.appendChild(detail);

      listeCand.appendChild(ligne);
    });
  }

  async function demarrer() {
    const contexte = await ouvrirEspace('etudiant');
    if (!contexte) return;
    espace.hidden = false;

    const resultat = await Api.chargerProfil();
    if (!resultat.ok) {
      afficher(retourProfil, resultat.message, 'message-erreur');
      return;
    }
    remplir(resultat.profil);
    chargerRecommandations();
    chargerCandidatures();
  }

  if (formulaire) {
    formulaire.addEventListener('submit', async function (event) {
      event.preventDefault();
      afficher(retourProfil, '', '');
      occuperBouton(boutonEnregistrer, true, 'Enregistrement…');

      const resultat = await Api.enregistrerProfil({
        prenom: document.getElementById('profil-prenom').value,
        nom: document.getElementById('profil-nom').value,
        telephone: document.getElementById('profil-telephone').value,
        ville: document.getElementById('profil-ville').value,
        etablissement: document.getElementById('profil-etablissement').value,
        diplome: document.getElementById('profil-diplome').value,
        annee: document.getElementById('profil-annee').value,
        dispo: document.getElementById('profil-dispo').value,
        competences: document.getElementById('profil-competences').value,
        bio: document.getElementById('profil-bio').value
      });
      occuperBouton(boutonEnregistrer, false);

      if (!resultat.ok) {
        afficher(retourProfil, resultat.message, 'message-erreur');
        return;
      }
      afficher(retourProfil, resultat.message, 'message-ok');
      if (resultat.details && resultat.details.profil) profil = resultat.details.profil;
      chargerRecommandations();
    });
  }

  if (boutonDepot) {
    boutonDepot.addEventListener('click', async function () {
      afficher(retourCV, '', '');
      const fichier = champCV && champCV.files ? champCV.files[0] : null;
      if (!fichier) {
        afficher(retourCV, 'Choisissez d\'abord un fichier.', 'message-erreur');
        return;
      }
      occuperBouton(boutonDepot, true, 'Dépôt du CV…');
      const resultat = await Api.deposerCV(fichier);
      occuperBouton(boutonDepot, false);

      if (!resultat.ok) {
        afficher(retourCV, resultat.message, 'message-erreur');
        return;
      }
      afficher(retourCV, resultat.message, 'message-ok');
      if (champCV) champCV.value = '';
      majEtatCV(resultat.details.cv_path);
      if (profil) profil.cv_path = resultat.details.cv_path;
    });
  }

  if (boutonRetirer) {
    boutonRetirer.addEventListener('click', async function () {
      const accord = window.confirm('Retirer votre CV du profil ?');
      if (!accord) return;
      occuperBouton(boutonRetirer, true, 'Retrait…');
      const resultat = await Api.retirerCV();
      occuperBouton(boutonRetirer, false);
      afficher(retourCV, resultat.message, resultat.ok ? 'message-ok' : 'message-erreur');
      if (resultat.ok) {
        majEtatCV(null);
        if (profil) profil.cv_path = null;
      }
    });
  }

  if (boutonVoir) {
    boutonVoir.addEventListener('click', async function () {
      if (!profil || !profil.cv_path) return;
      const lien = await Api.lienCV(profil.cv_path);
      if (lien) {
        window.open(lien, '_blank', 'noopener');
      } else {
        afficher(retourCV, 'CV introuvable : déposez-le à nouveau.', 'message-erreur');
      }
    });
  }

  if (boutonDeconnexion) {
    boutonDeconnexion.addEventListener('click', async function () {
      occuperBouton(boutonDeconnexion, true, 'Déconnexion…');
      const resultat = await Api.deconnecter();
      if (resultat.ok) versPage('index.html');
      else occuperBouton(boutonDeconnexion, false);
    });
  }

  demarrer();
}

// ------------------------------------------
// Espace entreprise : profil, offres, candidats, paiement
// ------------------------------------------
function brancherEspaceEntreprise() {
  const espace = document.getElementById('espace-entreprise');
  if (!espace) return;

  const formulaireProfil = document.getElementById('formulaire-entreprise');
  const retourProfil = document.getElementById('retour-profil');
  const boutonProfil = document.getElementById('bouton-enregistrer-entreprise');
  const boutonDeconnexion = document.getElementById('bouton-deconnexion');

  const formulaireOffre = document.getElementById('formulaire-offre');
  const retourOffre = document.getElementById('retour-offre');
  const boutonOffre = document.getElementById('bouton-enregistrer-offre');
  const boutonNouvelle = document.getElementById('bouton-nouvelle-offre');
  const listeOffres = document.getElementById('liste-offres');
  const etatOffres = document.getElementById('etat-offres');

  const selectOffre = document.getElementById('select-offre-candidatures');
  const listeCand = document.getElementById('liste-candidatures-entreprise');
  const etatCand = document.getElementById('etat-candidatures-entreprise');

  const listePaiements = document.getElementById('liste-paiements');
  const etatPaiements = document.getElementById('etat-paiements');
  const retourPaiement = document.getElementById('retour-paiement');

  let offresEnMemoire = [];
  let idEnCours = null;

  // ----- Profil entreprise -----
  function remplirProfil(profil) {
    document.getElementById('ent-prenom').value = profil.prenom || '';
    document.getElementById('ent-nom').value = profil.nom || '';
    document.getElementById('ent-entreprise').value = profil.entreprise_nom || '';
    document.getElementById('ent-secteur').value = profil.entreprise_secteur || '';
    document.getElementById('ent-site').value = profil.entreprise_site || '';
    document.getElementById('ent-telephone').value = profil.telephone || '';
    document.getElementById('ent-ville').value = profil.ville || '';
    document.getElementById('ent-description').value = profil.bio || '';
  }

  // ----- Offres -----
  function remplirOffre(offreItem) {
    idEnCours = offreItem ? offreItem.id : null;
    document.getElementById('offre-titre').value = offreItem ? offreItem.titre : '';
    document.getElementById('offre-type').value = offreItem ? offreItem.type : 'stage';
    document.getElementById('offre-ville').value = offreItem ? (offreItem.ville || '') : '';
    document.getElementById('offre-duree').value = offreItem ? (offreItem.duree || '') : '';
    document.getElementById('offre-remuneration').value = offreItem ? (offreItem.remuneration || '') : '';
    document.getElementById('offre-places').value = offreItem ? offreItem.places : 1;
    document.getElementById('offre-competences').value = offreItem
      ? Api.competencesVersTexte(offreItem.competences) : '';
    document.getElementById('offre-description').value = offreItem ? (offreItem.description || '') : '';
    if (boutonOffre) boutonOffre.textContent = offreItem ? 'Mettre à jour l\'offre' : 'Publier l\'offre';
    afficher(retourOffre, '', '');
  }

  async function chargerOffres() {
    if (!listeOffres) return;
    const session = await Api.getSession();
    if (!session) return;

    listeOffres.innerHTML = '';
    afficher(etatOffres, 'Chargement de vos offres…', 'etat-vide');

    const resultat = await Api.listerOffres({ entrepriseId: session.user.id });
    if (!resultat.ok) {
      afficher(etatOffres, resultat.message, 'message-erreur');
      return;
    }
    offresEnMemoire = resultat.offres;

    // Sélection de l'offre pour le suivi des candidatures
    if (selectOffre) {
      const courante = selectOffre.value;
      selectOffre.innerHTML = '';
      const optionVide = creer('option', null, '— Choisir une offre —');
      optionVide.value = '';
      selectOffre.appendChild(optionVide);
      offresEnMemoire.forEach(function (offreItem) {
        const option = creer('option', null, offreItem.titre + ' (' + Api.libelle('type', offreItem.type) + ')');
        option.value = offreItem.id;
        selectOffre.appendChild(option);
      });
      if (courante) selectOffre.value = courante;
      if (!selectOffre.value) {
        listeCand.innerHTML = '';
        afficher(etatCand, 'Choisissez une offre pour afficher ses candidatures.', 'etat-vide');
      }
    }

    if (offresEnMemoire.length === 0) {
      afficher(etatOffres, 'Vous n\'avez publié aucune offre pour le moment.', 'etat-vide');
      return;
    }
    afficher(etatOffres, '', '');

    offresEnMemoire.forEach(function (offreItem) {
      const ligne = creer('article', 'ligne-offre');

      const infos = creer('div', 'ligne-infos');
      const haut = creer('div', 'haut-ligne');
      haut.appendChild(creer('h4', null, offreItem.titre));
      haut.appendChild(badgeStatutOffre(offreItem.statut));
      infos.appendChild(haut);
      infos.appendChild(creer('p', 'aide',
        Api.libelle('type', offreItem.type) +
        (offreItem.ville ? ' · ' + offreItem.ville : '') +
        ' · ' + offreItem.places + ' place(s) · créée le ' + formatDate(offreItem.created_at)));
      infos.appendChild(listeTags(offreItem.competences, 'tags compact'));
      ligne.appendChild(infos);

      const actions = creer('div', 'ligne-actions');

      const selectStatut = creer('select');
      selectStatut.className = 'select-statut';
      Object.keys(Api.STATUTS_OFFRE).forEach(function (cle) {
        const option = creer('option', null, Api.STATUTS_OFFRE[cle]);
        option.value = cle;
        if (cle === offreItem.statut) option.selected = true;
        selectStatut.appendChild(option);
      });
      selectStatut.addEventListener('change', async function () {
        const resultat = await Api.changerStatutOffre(offreItem.id, selectStatut.value);
        if (!resultat.ok) {
          window.alert(resultat.message);
          selectStatut.value = offreItem.statut;
          return;
        }
        afficher(retourOffre, resultat.message, 'message-ok');
        chargerOffres();
      });
      actions.appendChild(selectStatut);

      const boutonModifier = creer('button', 'bouton petit contour-bleu', 'Modifier');
      boutonModifier.type = 'button';
      boutonModifier.addEventListener('click', function () {
        remplirOffre(offreItem);
        formulaireOffre.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      actions.appendChild(boutonModifier);

      const boutonSupprimer = creer('button', 'bouton petit contour', 'Supprimer');
      boutonSupprimer.type = 'button';
      boutonSupprimer.addEventListener('click', async function () {
        const accord = window.confirm('Supprimer définitivement l\'offre « ' + offreItem.titre + ' » ?');
        if (!accord) return;
        const suppression = await Api.supprimerOffre(offreItem.id);
        if (!suppression.ok) {
          window.alert(suppression.message);
          return;
        }
        if (idEnCours === offreItem.id) remplirOffre(null);
        afficher(retourOffre, suppression.message, 'message-ok');
        chargerOffres();
      });
      actions.appendChild(boutonSupprimer);

      ligne.appendChild(actions);
      listeOffres.appendChild(ligne);
    });
  }

  // ----- Candidatures reçues -----
  async function chargerCandidatures(offreId) {
    if (!listeCand) return;
    listeCand.innerHTML = '';

    if (!offreId) {
      afficher(etatCand, 'Choisissez une offre pour afficher ses candidatures.', 'etat-vide');
      return;
    }

    afficher(etatCand, 'Chargement des candidatures…', 'etat-vide');
    const resultat = await Api.candidaturesDeOffre(offreId);
    if (!resultat.ok) {
      afficher(etatCand, resultat.message, 'message-erreur');
      return;
    }
    if (resultat.candidatures.length === 0) {
      afficher(etatCand, 'Aucune candidature reçue sur cette offre.', 'etat-vide');
      return;
    }
    afficher(etatCand, '', '');

    const profils = await Api.profilsDesCandidats(resultat.candidatures.map(function (c) { return c.etudiant_id; }));
    const parId = {};
    (profils.profils || []).forEach(function (profil) { parId[profil.user_id] = profil; });

    for (const candidature of resultat.candidatures) {
      const profil = parId[candidature.etudiant_id] || null;
      listeCand.appendChild(await construireCandidat(candidature, profil));
    }
  }

  async function construireCandidat(candidature, profil) {
    const ligne = creer('article', 'ligne-candidature');

    const principal = creer('div', 'ligne-principal');
    const infos = creer('div', 'ligne-infos');
    const identite = profil
      ? [profil.prenom, profil.nom].filter(Boolean).join(' ') || 'Étudiant'
      : 'Étudiant';
    infos.appendChild(creer('h4', null, identite));
    const meta = [
      profil && profil.diplome ? profil.diplome : '',
      profil && profil.etablissement ? profil.etablissement : '',
      'candidature du ' + formatDate(candidature.created_at)
    ].filter(Boolean).join(' · ');
    infos.appendChild(creer('p', 'aide', meta));
    infos.appendChild(listeTags(profil ? profil.competences : [], 'tags compact'));
    principal.appendChild(infos);

    const cotes = creer('div', 'ligne-cotes');
    cotes.appendChild(badgeScore(candidature.score));
    cotes.appendChild(badgeStatutCandidature(candidature.statut));
    principal.appendChild(cotes);
    ligne.appendChild(principal);

    const detail = creer('div', 'ligne-detail');
    if (candidature.motivation) {
      detail.appendChild(creer('p', null, candidature.motivation));
    }
    if (profil && profil.bio) {
      detail.appendChild(creer('p', 'aide', profil.bio));
    }

    const actions = creer('div', 'boutons-actions');

    if (profil && profil.cv_path) {
      const boutonCV = creer('button', 'bouton petit contour-bleu', 'Ouvrir le CV');
      boutonCV.type = 'button';
      boutonCV.addEventListener('click', async function () {
        const lien = await Api.lienCV(profil.cv_path);
        if (lien) window.open(lien, '_blank', 'noopener');
        else window.alert('CV introuvable.');
      });
      actions.appendChild(boutonCV);
    } else {
      actions.appendChild(creer('span', 'aide', 'Aucun CV déposé.'));
    }

    if (candidature.statut === 'en_attente' || candidature.statut === 'refusee') {
      const boutonSelect = creer('button', 'bouton petit', 'Sélectionner ce candidat');
      boutonSelect.type = 'button';
      boutonSelect.addEventListener('click', async function () {
        const accord = window.confirm(
          'Sélectionner « ' + identite + ' » ? Les autres candidatures de cette offre seront refusées.');
        if (!accord) return;
        occuperBouton(boutonSelect, true, 'Sélection…');
        const resultat = await Api.selectionnerCandidature(candidature.id);
        occuperBouton(boutonSelect, false);
        if (!resultat.ok) {
          window.alert(resultat.message);
          return;
        }
        afficher(retourPaiement, resultat.message, 'message-ok');
        chargerCandidatures(selectOffre.value);
        chargerOffres();
      });
      actions.appendChild(boutonSelect);

      const boutonRefus = creer('button', 'bouton petit contour', 'Refuser');
      boutonRefus.type = 'button';
      boutonRefus.addEventListener('click', async function () {
        const resultat = await Api.statuerCandidature(candidature.id, 'refusee');
        if (!resultat.ok) { window.alert(resultat.message); return; }
        chargerCandidatures(selectOffre.value);
      });
      actions.appendChild(boutonRefus);
    }

    if (candidature.statut === 'selectionnee') {
      const paiement = await trouverPaiement(candidature.id);
      if (paiement) {
        const recu = creer('div', 'recu-paiement');
        recu.appendChild(creer('span', 'reference', 'Reçu ' + paiement.reference));
        recu.appendChild(creer('span', null, Api.formatMontant(paiement.montant) + ' réglés le ' + formatDate(paiement.created_at)));
        actions.appendChild(recu);
      } else {
        const boutonPayer = creer('button', 'bouton petit', 'Régler les frais (' + Api.formatMontant(Api.FRAIS_ACCORD) + ')');
        boutonPayer.type = 'button';
        boutonPayer.addEventListener('click', async function () {
          occuperBouton(boutonPayer, true, 'Paiement simulé…');
          const resultat = await Api.payerFrais(candidature.id);
          occuperBouton(boutonPayer, false);
          afficher(retourPaiement, resultat.message, resultat.ok ? 'message-ok' : 'message-erreur');
          if (resultat.ok) {
            chargerCandidatures(selectOffre.value);
            chargerPaiements();
          }
        });
        actions.appendChild(boutonPayer);
      }

      const boutonAnnuler = creer('button', 'bouton petit contour', 'Annuler la sélection');
      boutonAnnuler.type = 'button';
      boutonAnnuler.addEventListener('click', async function () {
        const resultat = await Api.statuerCandidature(candidature.id, 'en_attente');
        if (!resultat.ok) { window.alert(resultat.message); return; }
        chargerCandidatures(selectOffre.value);
        chargerOffres();
      });
      actions.appendChild(boutonAnnuler);
    }

    if (candidature.statut === 'acceptee') {
      const boutonRefus = creer('button', 'bouton petit contour', 'Marquer comme refusée');
      boutonRefus.type = 'button';
      boutonRefus.addEventListener('click', async function () {
        const resultat = await Api.statuerCandidature(candidature.id, 'refusee');
        if (!resultat.ok) { window.alert(resultat.message); return; }
        chargerCandidatures(selectOffre.value);
      });
      actions.appendChild(boutonRefus);
    }

    detail.appendChild(actions);
    ligne.appendChild(detail);
    return ligne;
  }

  let paiementsCharges = [];

  async function trouverPaiement(candidatureId) {
    if (paiementsCharges.length === 0) {
      const resultat = await Api.mesPaiements();
      if (resultat.ok) paiementsCharges = resultat.paiements;
    }
    return paiementsCharges.find(function (p) { return p.candidature_id === candidatureId; }) || null;
  }

  async function chargerPaiements() {
    if (!listePaiements) return;
    const resultat = await Api.mesPaiements();
    listePaiements.innerHTML = '';
    if (!resultat.ok) {
      afficher(etatPaiements, resultat.message, 'message-erreur');
      return;
    }
    paiementsCharges = resultat.paiements;
    if (resultat.paiements.length === 0) {
      afficher(etatPaiements, 'Aucun frais réglé pour le moment : le paiement intervient après sélection d\'un candidat.', 'etat-vide');
      return;
    }
    afficher(etatPaiements, '', '');
    resultat.paiements.forEach(function (paiement) {
      const ligne = creer('li', 'ligne-paiement');
      ligne.appendChild(creer('span', 'reference', paiement.reference));
      ligne.appendChild(creer('span', null, Api.formatMontant(paiement.montant)));
      ligne.appendChild(creer('span', 'aide', formatDate(paiement.created_at)));
      listePaiements.appendChild(ligne);
    });
  }

  async function demarrer() {
    const contexte = await ouvrirEspace('entreprise');
    if (!contexte) return;
    espace.hidden = false;

    const resultat = await Api.chargerProfil();
    if (resultat.ok && resultat.profil) remplirProfil(resultat.profil);
    else if (!resultat.ok) afficher(retourProfil, resultat.message, 'message-erreur');

    remplirOffre(null);
    chargerOffres();
    chargerPaiements();
    afficher(etatCand, 'Choisissez une offre pour afficher ses candidatures.', 'etat-vide');
  }

  if (formulaireProfil) {
    formulaireProfil.addEventListener('submit', async function (event) {
      event.preventDefault();
      afficher(retourProfil, '', '');
      occuperBouton(boutonProfil, true, 'Enregistrement…');
      const resultat = await Api.enregistrerProfil({
        prenom: document.getElementById('ent-prenom').value,
        nom: document.getElementById('ent-nom').value,
        entreprise_nom: document.getElementById('ent-entreprise').value,
        entreprise_secteur: document.getElementById('ent-secteur').value,
        entreprise_site: document.getElementById('ent-site').value,
        telephone: document.getElementById('ent-telephone').value,
        ville: document.getElementById('ent-ville').value,
        bio: document.getElementById('ent-description').value,
        competences: []
      });
      occuperBouton(boutonProfil, false);
      afficher(retourProfil, resultat.message, resultat.ok ? 'message-ok' : 'message-erreur');
    });
  }

  if (formulaireOffre) {
    formulaireOffre.addEventListener('submit', async function (event) {
      event.preventDefault();
      afficher(retourOffre, '', '');

      const infos = {
        titre: document.getElementById('offre-titre').value,
        type: document.getElementById('offre-type').value,
        ville: document.getElementById('offre-ville').value,
        duree: document.getElementById('offre-duree').value,
        remuneration: document.getElementById('offre-remuneration').value,
        places: document.getElementById('offre-places').value,
        competences: document.getElementById('offre-competences').value,
        description: document.getElementById('offre-description').value
      };

      occuperBouton(boutonOffre, true, 'Enregistrement…');
      const resultat = idEnCours
        ? await Api.modifierOffre(idEnCours, infos)
        : await Api.creerOffre(infos);
      occuperBouton(boutonOffre, false);

      if (!resultat.ok) {
        afficher(retourOffre, resultat.message, 'message-erreur');
        return;
      }
      afficher(retourOffre, resultat.message, 'message-ok');
      remplirOffre(null);
      chargerOffres();
    });
  }

  if (boutonNouvelle) {
    boutonNouvelle.addEventListener('click', function () {
      remplirOffre(null);
      document.getElementById('offre-titre').focus();
    });
  }

  if (selectOffre) {
    selectOffre.addEventListener('change', function () {
      chargerCandidatures(selectOffre.value);
    });
  }

  if (boutonDeconnexion) {
    boutonDeconnexion.addEventListener('click', async function () {
      occuperBouton(boutonDeconnexion, true, 'Déconnexion…');
      const resultat = await Api.deconnecter();
      if (resultat.ok) versPage('index.html');
      else occuperBouton(boutonDeconnexion, false);
    });
  }

  demarrer();
}

// ------------------------------------------
// Administration : utilisateurs, offres, candidatures, paiements
// ------------------------------------------
function brancherAdmin() {
  const pageAdmin = document.getElementById('page-admin');
  if (!pageAdmin) return;

  const chargement = document.getElementById('admin-chargement');
  const refusAcces = document.getElementById('admin-refus');
  const texteRefus = document.getElementById('admin-refus-texte');
  const contenuAdmin = document.getElementById('admin-contenu');
  const recherche = document.getElementById('recherche-utilisateur');
  const boutonActualiser = document.getElementById('bouton-actualiser-admin');

  const listeUsers = document.getElementById('liste-utilisateurs');
  const etatUsers = document.getElementById('etat-utilisateurs');
  const filtreOffres = document.getElementById('filtre-offres');
  const listeOffres = document.getElementById('liste-offres-admin');
  const etatOffres = document.getElementById('etat-offres-admin');
  const filtreCand = document.getElementById('filtre-candidatures');
  const listeCand = document.getElementById('liste-candidatures-admin');
  const etatCand = document.getElementById('etat-candidatures-admin');
  const listePaiements = document.getElementById('liste-paiements-admin');
  const etatPaiements = document.getElementById('etat-paiements-admin');
  const totalPaiements = document.getElementById('total-paiements');

  let utilisateurs = [];

  // ----- Utilisateurs -----
  async function chargerUtilisateurs() {
    if (!listeUsers) return;
    listeUsers.innerHTML = '';
    afficher(etatUsers, 'Chargement des comptes…', 'etat-vide');

    const resultat = await Api.listerUtilisateurs();
    if (!resultat.ok) {
      afficher(etatUsers, resultat.message, 'message-erreur');
      return;
    }
    utilisateurs = resultat.utilisateurs;
    rendreUtilisateurs();
  }

  function rendreUtilisateurs() {
    if (!listeUsers) return;
    const filtre = (recherche && recherche.value ? recherche.value : '').trim().toLowerCase();
    const visibles = utilisateurs.filter(function (u) {
      if (!filtre) return true;
      return [u.email, u.prenom, u.nom, u.entreprise_nom, u.role].join(' ').toLowerCase().indexOf(filtre) >= 0;
    });

    listeUsers.innerHTML = '';
    if (visibles.length === 0) {
      afficher(etatUsers, 'Aucun compte ne correspond à cette recherche.', 'etat-vide');
      return;
    }
    afficher(etatUsers, utilisateurs.length + ' compte(s) enregistré(s).', 'aide');

    visibles.forEach(function (utilisateur) {
      const ligne = creer('article', 'ligne-utilisateur');

      const infos = creer('div', 'ligne-infos');
      infos.appendChild(creer('h4', null, utilisateur.email || utilisateur.user_id.slice(0, 8)));
      infos.appendChild(creer('p', 'aide',
        [utilisateur.prenom, utilisateur.nom].filter(Boolean).join(' ') ||
        (utilisateur.entreprise_nom ? 'Entreprise : ' + utilisateur.entreprise_nom : 'Profil non renseigné')));
      ligne.appendChild(infos);

      const select = creer('select', 'select-role');
      Object.keys(Api.ROLES).forEach(function (cle) {
        const option = creer('option', null, Api.ROLES[cle]);
        option.value = cle;
        if (cle === utilisateur.role) option.selected = true;
        select.appendChild(option);
      });

      const bouton = creer('button', 'bouton petit', 'Enregistrer');
      bouton.type = 'button';
      const retour = creer('p', '', '');
      retour.setAttribute('role', 'alert');

      bouton.addEventListener('click', async function () {
        if (select.value === utilisateur.role) {
          afficher(retour, 'Aucun changement de rôle.', 'aide');
          return;
        }
        occuperBouton(bouton, true, 'Enregistrement…');
        const resultat = await Api.changerRole(utilisateur.user_id, select.value);
        occuperBouton(bouton, false);
        if (!resultat.ok) {
          afficher(retour, resultat.message, 'message-erreur');
          return;
        }
        utilisateur.role = select.value;
        afficher(retour, resultat.message, 'message-ok');
      });

      const actions = creer('div', 'ligne-actions');
      actions.appendChild(select);
      actions.appendChild(bouton);
      ligne.appendChild(actions);
      ligne.appendChild(retour);
      listeUsers.appendChild(ligne);
    });
  }

  // ----- Offres -----
  async function chargerOffres() {
    if (!listeOffres) return;
    listeOffres.innerHTML = '';
    afficher(etatOffres, 'Chargement des offres…', 'etat-vide');

    const resultat = await Api.listerOffres({ statut: filtreOffres ? filtreOffres.value : '' });
    if (!resultat.ok) {
      afficher(etatOffres, resultat.message, 'message-erreur');
      return;
    }
    if (resultat.offres.length === 0) {
      afficher(etatOffres, 'Aucune offre pour ce filtre.', 'etat-vide');
      return;
    }
    afficher(etatOffres, resultat.offres.length + ' offre(s).', 'aide');

    resultat.offres.forEach(function (offreItem) {
      const ligne = creer('article', 'ligne-offre');
      const infos = creer('div', 'ligne-infos');
      const haut = creer('div', 'haut-ligne');
      haut.appendChild(creer('h4', null, offreItem.titre));
      haut.appendChild(badgeStatutOffre(offreItem.statut));
      infos.appendChild(haut);
      infos.appendChild(creer('p', 'aide',
        (offreItem.entreprise_nom || 'Entreprise') + ' · ' + Api.libelle('type', offreItem.type) +
        ' · ' + formatDate(offreItem.created_at)));
      ligne.appendChild(infos);

      const actions = creer('div', 'ligne-actions');
      const lien = creer('a', 'bouton petit contour-bleu', 'Voir');
      lien.href = 'opportunite.html?id=' + encodeURIComponent(offreItem.id);
      actions.appendChild(lien);

      const boutonSupprimer = creer('button', 'bouton petit contour', 'Supprimer');
      boutonSupprimer.type = 'button';
      boutonSupprimer.addEventListener('click', async function () {
        const accord = window.confirm('Supprimer définitivement l\'offre « ' + offreItem.titre + ' » ?');
        if (!accord) return;
        const suppression = await Api.supprimerOffre(offreItem.id);
        if (!suppression.ok) { window.alert(suppression.message); return; }
        chargerOffres();
      });
      actions.appendChild(boutonSupprimer);
      ligne.appendChild(actions);
      listeOffres.appendChild(ligne);
    });
  }

  // ----- Candidatures -----
  async function chargerCandidatures() {
    if (!listeCand) return;
    listeCand.innerHTML = '';
    afficher(etatCand, 'Chargement des candidatures…', 'etat-vide');

    const resultat = await Api.toutesLesCandidatures(filtreCand ? filtreCand.value : '');
    if (!resultat.ok) {
      afficher(etatCand, resultat.message, 'message-erreur');
      return;
    }
    if (resultat.candidatures.length === 0) {
      afficher(etatCand, 'Aucune candidature pour ce filtre.', 'etat-vide');
      return;
    }
    afficher(etatCand, resultat.total + ' candidature(s) — affichage limité à ' + Api.LIMITE_ADMIN + '.', 'aide');

    resultat.candidatures.forEach(function (candidature) {
      const ligne = creer('article', 'ligne-candidature');
      const principal = creer('div', 'ligne-principal');
      const infos = creer('div', 'ligne-infos');
      infos.appendChild(creer('h4', null, candidature.offre_titre || 'Offre'));
      infos.appendChild(creer('p', 'aide',
        (candidature.entreprise_nom || 'Entreprise') + ' · étudiant ' +
        candidature.etudiant_id.slice(0, 8) + '… · ' + formatDate(candidature.created_at)));
      principal.appendChild(infos);

      const cotes = creer('div', 'ligne-cotes');
      cotes.appendChild(badgeScore(candidature.score));
      cotes.appendChild(badgeStatutCandidature(candidature.statut));
      principal.appendChild(cotes);
      ligne.appendChild(principal);
      listeCand.appendChild(ligne);
    });
  }

  // ----- Paiements -----
  async function chargerPaiements() {
    if (!listePaiements) return;
    listePaiements.innerHTML = '';
    afficher(etatPaiements, 'Chargement des paiements…', 'etat-vide');

    const resultat = await Api.tousLesPaiements();
    if (!resultat.ok) {
      afficher(etatPaiements, resultat.message, 'message-erreur');
      return;
    }
    if (totalPaiements) {
      totalPaiements.textContent = 'Total encaissé (simulé) : ' + Api.formatMontant(resultat.total);
    }
    if (resultat.paiements.length === 0) {
      afficher(etatPaiements, 'Aucun paiement enregistré.', 'etat-vide');
      return;
    }
    afficher(etatPaiements, resultat.paiements.length + ' paiement(s).', 'aide');

    resultat.paiements.forEach(function (paiement) {
      const ligne = creer('li', 'ligne-paiement');
      ligne.appendChild(creer('span', 'reference', paiement.reference));
      ligne.appendChild(creer('span', null, Api.formatMontant(paiement.montant)));
      ligne.appendChild(creer('span', 'aide', 'offre ' + paiement.opportunite_id.slice(0, 8) + '… · ' + formatDate(paiement.created_at)));
      listePaiements.appendChild(ligne);
    });
  }

  async function verifier() {
    const session = await Api.getSession();
    if (!session) {
      if (chargement) chargement.hidden = true;
      if (refusAcces && texteRefus) {
        refusAcces.hidden = false;
        texteRefus.textContent = 'Vous devez être connecté(e) pour ouvrir cette page.';
      }
      return;
    }

    const role = await Api.roleCourant();
    if (chargement) chargement.hidden = true;

    if (role !== 'admin') {
      if (refusAcces && texteRefus) {
        refusAcces.hidden = false;
        texteRefus.textContent =
          'Votre compte ne possède pas le rôle administrateur. ' +
          'Cette page est réservée aux administrateurs de MatchUp.';
      }
      return;
    }

    if (contenuAdmin) contenuAdmin.hidden = false;
    chargerUtilisateurs();
    chargerOffres();
    chargerCandidatures();
    chargerPaiements();
  }

  verifier();

  if (recherche) recherche.addEventListener('input', rendreUtilisateurs);
  if (filtreOffres) filtreOffres.addEventListener('change', chargerOffres);
  if (filtreCand) filtreCand.addEventListener('change', chargerCandidatures);
  if (boutonActualiser) {
    boutonActualiser.addEventListener('click', function () {
      chargerUtilisateurs();
      chargerOffres();
      chargerCandidatures();
      chargerPaiements();
    });
  }
}

// ------------------------------------------
// Démarrage
// ------------------------------------------
function demarrer() {
  if (typeof window.Api === 'undefined') {
    console.error('MatchUp : supabase-api.js introuvable, les pages personnelles sont inactives.');
    messageScriptsManquants();
    return;
  }

  raccorderNavigation();
  brancherInscription();
  brancherConnexion();
  brancherVerification();
  brancherCompte();
  brancherOffres();
  brancherOffreDetail();
  brancherEspaceEtudiant();
  brancherEspaceEntreprise();
  brancherAdmin();
}

demarrer();
