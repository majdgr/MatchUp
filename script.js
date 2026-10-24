// ==========================================
// MatchUp - Interactions du site + raccordement Supabase
// Ce fichier ne gère PAS l'authentification lui-même :
// tout passe par Shop (supabase-shop.js).
// Le panier reste local (localStorage) ; les candidatures
// sont enregistrées dans Supabase.
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
const questions = document.querySelectorAll('.faq-question');
questions.forEach(function (question) {
  question.addEventListener('click', function () {
    question.nextElementSibling.classList.toggle('ouvert');
  });
});

// Formulaire de contact : petite validation + message de confirmation
const formulaire = document.getElementById('formulaire-contact');
if (formulaire) {
  formulaire.addEventListener('submit', function (event) {
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
      formulaire.reset();
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
    if (!bouton.dataset.libelle) {
      bouton.dataset.libelle = bouton.textContent;
    }
    bouton.disabled = true;
    bouton.textContent = libelleAttente || 'Veuillez patienter…';
  } else {
    bouton.disabled = false;
    if (bouton.dataset.libelle) {
      bouton.textContent = bouton.dataset.libelle;
    }
  }
}

function parametre(nom) {
  return new URLSearchParams(window.location.search).get(nom);
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
    return new Date(valeur).toLocaleString('fr-FR');
  } catch (e) {
    return valeur;
  }
}

// ------------------------------------------
// Panier local (localStorage)
// ------------------------------------------
const CLE_PANIER = 'matchup-panier';
const CLE_TENTATIVE = 'matchup-commande-tentative';

function lirePanier() {
  try {
    const brut = JSON.parse(localStorage.getItem(CLE_PANIER) || '[]');
    if (!Array.isArray(brut)) return [];
    return brut
      .filter(function (ligne) { return ligne && typeof ligne.id === 'string'; })
      .map(function (ligne) {
        return { id: ligne.id, quantity: Math.max(1, Math.min(50, Number(ligne.quantity) || 1)) };
      });
  } catch (e) {
    return [];
  }
}

function ecrirePanier(panier) {
  localStorage.setItem(CLE_PANIER, JSON.stringify(panier));
  majCompteurPanier();
}

function ajouterAuPanier(id, quantite) {
  const panier = lirePanier();
  const existante = panier.find(function (ligne) { return ligne.id === id; });
  const quantiteFinale = Math.max(1, Math.min(50, Number(quantite) || 1));
  if (existante) {
    existante.quantity = Math.min(50, existante.quantity + quantiteFinale);
  } else {
    panier.push({ id: id, quantity: quantiteFinale });
  }
  ecrirePanier(panier);
}

function majCompteurPanier() {
  const lien = document.getElementById('lien-panier');
  if (!lien) return;
  const nombre = lirePanier().reduce(function (somme, ligne) { return somme + ligne.quantity; }, 0);
  lien.textContent = nombre > 0 ? 'Panier (' + nombre + ')' : 'Panier';
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
      lien.href = 'compte.html';
      lien.textContent = 'Mon compte';
    } else {
      lien.href = 'login.html';
      lien.textContent = 'Connexion';
    }
  });

  if (elementAdmin) elementAdmin.hidden = !estAdmin;
  if (lienAdminPied) lienAdminPied.hidden = !estAdmin;
}

async function raccorderNavigation() {
  if (typeof window.Shop === 'undefined') return;
  const session = await Shop.getSession();
  const role = session ? await Shop.roleCourant() : null;
  majNavigation(session, role);
  Shop.ecouterAuth(async function (sessionActive) {
    const roleActif = sessionActive ? await Shop.roleCourant() : null;
    majNavigation(sessionActive, roleActif);
  });
}

// ------------------------------------------
// Catalogue affiché sur services.html
// ------------------------------------------
function brancherCatalogue() {
  const zone = document.getElementById('catalogue-services');
  if (!zone) return;
  const retour = document.getElementById('catalogue-retour');

  async function charger() {
    zone.innerHTML = '';
    zone.className = 'grille';
    afficher(retour, 'Chargement des services…', 'etat-vide');

    const resultat = await Shop.listerServices();
    if (!resultat.ok) {
      zone.className = '';
      afficher(retour, resultat.message, 'message-erreur');
      return;
    }
    if (resultat.services.length === 0) {
      zone.className = '';
      afficher(retour, 'Aucun service disponible pour le moment.', 'etat-vide');
      return;
    }

    afficher(retour, '', '');
    resultat.services.forEach(function (service) {
      const carte = creer('div', 'carte');
      const contenu = creer('div', 'contenu');

      const etiquette = creer('span', 'etiquette', service.category);
      const titre = creer('h3', null, service.name);
      const description = creer('p', null, service.description || '');
      const prix = creer('p', 'prix-service', Shop.formatPrix(service.price));
      const liste = creer('ul', 'liste-caracteristiques');
      (Array.isArray(service.features) ? service.features : []).forEach(function (caracteristique) {
        liste.appendChild(creer('li', null, String(caracteristique)));
      });

      const bouton = creer('button', 'bouton', 'Ajouter au panier');
      bouton.type = 'button';
      bouton.dataset.id = service.id;
      bouton.addEventListener('click', function () {
        if (bouton.disabled) return;
        bouton.disabled = true;
        ajouterAuPanier(service.id, 1);
        bouton.textContent = 'Ajouté ✓';
        setTimeout(function () { bouton.disabled = false; bouton.textContent = 'Ajouter au panier'; }, 1200);
      });

      contenu.appendChild(etiquette);
      contenu.appendChild(titre);
      contenu.appendChild(description);
      contenu.appendChild(prix);
      contenu.appendChild(liste);
      contenu.appendChild(bouton);
      carte.appendChild(contenu);
      zone.appendChild(carte);
    });
  }

  charger();
}

// ------------------------------------------
// Page panier
// ------------------------------------------
function brancherPanier() {
  const zone = document.getElementById('panier-liste');
  if (!zone) return;

  const vide = document.getElementById('panier-vide');
  const bloc = document.getElementById('panier-bloc');
  const champSousTotal = document.getElementById('panier-sous-total');
  const champFrais = document.getElementById('panier-frais');
  const champTotal = document.getElementById('panier-total');
  const retour = document.getElementById('panier-retour');

  async function charger() {
    const panier = lirePanier();
    zone.innerHTML = '';

    if (panier.length === 0) {
      if (bloc) bloc.hidden = true;
      if (vide) vide.hidden = false;
      return;
    }
    if (bloc) bloc.hidden = false;
    if (vide) vide.hidden = true;

    afficher(retour, 'Chargement des prix…', 'etat-vide');
    const resultat = await Shop.listerServices();
    if (!resultat.ok) {
      afficher(retour, resultat.message, 'message-erreur');
      return;
    }
    afficher(retour, '', '');

    const catalogue = {};
    resultat.services.forEach(function (service) { catalogue[service.id] = service; });

    let sousTotal = 0;
    const lignesValides = [];

    panier.forEach(function (ligne) {
      const service = catalogue[ligne.id];
      const element = creer('li', 'ligne-panier');

      if (!service) {
        element.appendChild(creer('span', 'nom', ligne.id));
        element.appendChild(creer('span', 'indispo', 'Service indisponible'));
        const boutonRetirer = creer('button', 'bouton petit contour-bleu', 'Retirer');
        boutonRetirer.type = 'button';
        boutonRetirer.addEventListener('click', function () {
          ecrirePanier(lirePanier().filter(function (l) { return l.id !== ligne.id; }));
          charger();
        });
        element.appendChild(boutonRetirer);
        zone.appendChild(element);
        return;
      }

      lignesValides.push(ligne);
      sousTotal += service.price * ligne.quantity;

      element.appendChild(creer('span', 'nom', service.name));
      element.appendChild(creer('span', 'prix-unitaire', Shop.formatPrix(service.price)));

      const quantite = creer('span', 'quantite');
      const boutonMoins = creer('button', 'bouton-quantite', '−');
      boutonMoins.type = 'button';
      boutonMoins.setAttribute('aria-label', 'Diminuer la quantité de ' + service.name);
      const valeur = creer('span', 'valeur-quantite', String(ligne.quantity));
      const boutonPlus = creer('button', 'bouton-quantite', '+');
      boutonPlus.type = 'button';
      boutonPlus.setAttribute('aria-label', 'Augmenter la quantité de ' + service.name);

      boutonMoins.addEventListener('click', function () {
        changerQuantite(ligne.id, ligne.quantity - 1);
      });
      boutonPlus.addEventListener('click', function () {
        changerQuantite(ligne.id, ligne.quantity + 1);
      });

      quantite.appendChild(boutonMoins);
      quantite.appendChild(valeur);
      quantite.appendChild(boutonPlus);
      element.appendChild(quantite);

      element.appendChild(creer('span', 'prix-ligne', Shop.formatPrix(service.price * ligne.quantity)));

      const boutonRetirer = creer('button', 'bouton petit contour-bleu', 'Retirer');
      boutonRetirer.type = 'button';
      boutonRetirer.addEventListener('click', function () {
        ecrirePanier(lirePanier().filter(function (l) { return l.id !== ligne.id; }));
        charger();
      });
      element.appendChild(boutonRetirer);

      zone.appendChild(element);
    });

    const frais = Shop.FRAIS_DOSSIER;
    champSousTotal.textContent = Shop.formatPrix(sousTotal);
    champFrais.textContent = Shop.formatPrix(frais);
    champTotal.textContent = Shop.formatPrix(sousTotal + frais);
    majCompteurPanier();
  }

  function changerQuantite(id, quantite) {
    if (quantite <= 0) {
      ecrirePanier(lirePanier().filter(function (l) { return l.id !== id; }));
    } else {
      const panier = lirePanier();
      const ligne = panier.find(function (l) { return l.id === id; });
      if (ligne) ligne.quantity = Math.min(50, quantite);
      ecrirePanier(panier);
    }
    charger();
  }

  charger();
}

// ------------------------------------------
// Page checkout
// ------------------------------------------
function brancherCheckout() {
  const formulaireCheckout = document.getElementById('formulaire-checkout');
  if (!formulaireCheckout) return;

  const retour = document.getElementById('checkout-retour');
  const bouton = document.getElementById('bouton-commander');
  const recap = document.getElementById('recap-commande');
  const blocCoordonnees = document.getElementById('coordonnees-commande');

  function idTentative() {
    let valeur = localStorage.getItem(CLE_TENTATIVE);
    if (!valeur || valeur.length < 8) {
      valeur = 'mu-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem(CLE_TENTATIVE, valeur);
    }
    return valeur;
  }

  async function preparer() {
    const session = await Shop.getSession();
    if (!session) {
      window.location.href = 'login.html?retour=checkout.html';
      return;
    }

    const panier = lirePanier();
    if (panier.length === 0) {
      if (blocCoordonnees) blocCoordonnees.hidden = true;
      afficher(retour, 'Votre panier est vide. Ajoutez d\'abord un service.', 'message-erreur');
      return;
    }

    // Identité pré-remplie
    const meta = session.user.user_metadata || {};
    const champNom = document.getElementById('coordonnee-nom');
    const champEmail = document.getElementById('coordonnee-email');
    if (champNom && !champNom.value) {
      champNom.value = [meta.prenom, meta.nom].filter(Boolean).join(' ') || '';
    }
    if (champEmail && !champEmail.value) {
      champEmail.value = session.user.email || '';
    }

    // Récapitulatif calculé à partir de la base
    const resultat = await Shop.listerServices();
    if (!resultat.ok) {
      afficher(retour, resultat.message, 'message-erreur');
      return;
    }
    const catalogue = {};
    resultat.services.forEach(function (service) { catalogue[service.id] = service; });

    if (!recap) return;
    recap.innerHTML = '';
    let sousTotal = 0;
    let manquant = false;

    panier.forEach(function (ligne) {
      const service = catalogue[ligne.id];
      const ligneRecap = creer('div', 'ligne-recap');
      if (!service) {
        manquant = true;
        ligneRecap.appendChild(creer('span', null, ligne.id + ' — indisponible'));
        ligneRecap.appendChild(creer('span', null, '—'));
      } else {
        sousTotal += service.price * ligne.quantity;
        ligneRecap.appendChild(creer('span', null, service.name + ' × ' + ligne.quantity));
        ligneRecap.appendChild(creer('span', null, Shop.formatPrix(service.price * ligne.quantity)));
      }
      recap.appendChild(ligneRecap);
    });

    if (manquant) {
      afficher(retour, 'Un service de votre panier n\'est plus disponible : retirez-le du panier.', 'message-erreur');
      if (bouton) bouton.disabled = true;
      return;
    }

    const frais = Shop.FRAIS_DOSSIER;
    const total = sousTotal + frais;
    recap.appendChild(creer('div', 'ligne-recap sous-total', 'Sous-total : ' + Shop.formatPrix(sousTotal)));
    recap.appendChild(creer('div', 'ligne-recap', 'Frais de dossier (simulés) : ' + Shop.formatPrix(frais)));
    recap.appendChild(creer('div', 'ligne-recap total', 'Total : ' + Shop.formatPrix(total)));
    formulaireCheckout.dataset.total = String(total);
  }

  preparer();

  formulaireCheckout.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (bouton && bouton.disabled) return;
    afficher(retour, '', '');

    const panier = lirePanier();
    if (panier.length === 0) {
      afficher(retour, 'Votre panier est vide.', 'message-erreur');
      return;
    }

    const nomSaisi = document.getElementById('coordonnee-nom').value.trim();
    const emailSaisi = document.getElementById('coordonnee-email').value.trim();
    if (nomSaisi.length < 2) {
      afficher(retour, 'Merci d\'indiquer votre nom complet.', 'message-erreur');
      document.getElementById('coordonnee-nom').focus();
      return;
    }
    if (!Shop.emailValide(emailSaisi)) {
      afficher(retour, 'L\'adresse e-mail n\'est pas valide.', 'message-erreur');
      document.getElementById('coordonnee-email').focus();
      return;
    }

    const totalAttendu = Number(formulaireCheckout.dataset.total || 0);
    if (!totalAttendu) {
      afficher(retour, 'Total introuvable : rechargez la page.', 'message-erreur');
      return;
    }

    occuperBouton(bouton, true, 'Envoi de la candidature…');

    const resultat = await Shop.creerCommande({
      attemptId: idTentative(),
      items: panier.map(function (ligne) { return { id: ligne.id, quantity: ligne.quantity }; }),
      nom: document.getElementById('coordonnee-nom').value,
      email: document.getElementById('coordonnee-email').value,
      telephone: document.getElementById('coordonnee-telephone').value,
      ville: document.getElementById('coordonnee-ville').value,
      adresse: document.getElementById('coordonnee-adresse').value,
      totalAttendu: totalAttendu
    });

    if (!resultat.ok) {
      // Panier conservé, formulaire réactivé, message utile affiché.
      occuperBouton(bouton, false);
      afficher(retour, resultat.message, 'message-erreur');
      return;
    }

    const commande = resultat.details.commande;
    localStorage.removeItem(CLE_TENTATIVE);
    ecrirePanier([]);
    window.location.href = 'confirmation.html?commande=' + encodeURIComponent(commande.id);
  });
}

// ------------------------------------------
// Page confirmation
// ------------------------------------------
function brancherConfirmation() {
  const zone = document.getElementById('zone-confirmation');
  if (!zone) return;

  const retour = document.getElementById('confirmation-retour');
  const contenu = document.getElementById('confirmation-contenu');

  async function charger() {
    const id = parametre('commande');
    if (!id) {
      afficher(retour, 'Aucune commande à afficher. Consultez votre historique depuis votre compte.', 'message-erreur');
      return;
    }

    const session = await Shop.getSession();
    if (!session) {
      window.location.href = 'login.html?retour=' + encodeURIComponent('confirmation.html?commande=' + id);
      return;
    }

    afficher(retour, 'Chargement…', 'etat-vide');
    const resultat = await Shop.commande(id);
    if (!resultat.ok) {
      afficher(retour, resultat.message, 'message-erreur');
      return;
    }
    afficher(retour, '', '');

    const commande = resultat.commande;
    contenu.innerHTML = '';

    contenu.appendChild(creer('p', 'reference-commande', 'Référence : ' + commande.reference));
    contenu.appendChild(creer('p', null, 'Date : ' + formatDate(commande.created_at)));
    contenu.appendChild(creer('p', 'badge-statut statut-' + commande.status, Shop.libelleStatut(commande.status)));

    const liste = creer('ul', 'liste-commandes');
    (Array.isArray(commande.items) ? commande.items : []).forEach(function (item) {
      liste.appendChild(creer(
        'li',
        null,
        item.name + ' × ' + item.quantity + ' — ' + Shop.formatPrix(item.price) + ' l\'unité'
      ));
    });
    contenu.appendChild(liste);

    const totaux = creer('div', 'totaux-commande');
    totaux.appendChild(creer('p', null, 'Sous-total : ' + Shop.formatPrix(commande.subtotal)));
    totaux.appendChild(creer('p', null, 'Frais de dossier : ' + Shop.formatPrix(commande.shipping)));
    totaux.appendChild(creer('p', 'total', 'Total : ' + Shop.formatPrix(commande.total)));
    contenu.appendChild(totaux);

    const coordonnees = creer('div', 'coordonnees-recap');
    coordonnees.appendChild(creer('h3', null, 'Coordonnées'));
    coordonnees.appendChild(creer('p', null, commande.delivery_name + ' — ' + commande.delivery_email));
    if (commande.delivery_phone) coordonnees.appendChild(creer('p', null, 'Téléphone : ' + commande.delivery_phone));
    if (commande.delivery_city) coordonnees.appendChild(creer('p', null, 'Ville : ' + commande.delivery_city));
    if (commande.delivery_address) coordonnees.appendChild(creer('p', null, 'Adresse : ' + commande.delivery_address));
    coordonnees.appendChild(creer('p', null, 'Paiement : simulé (aucune donnée bancaire collectée)'));
    contenu.appendChild(coordonnees);
  }

  charger();
}

// ------------------------------------------
// Espace compte
// ------------------------------------------
function brancherCompte() {
  const espace = document.getElementById('espace-compte');
  if (!espace) return;

  const champEmail = document.getElementById('compte-email');
  const champPrenom = document.getElementById('compte-prenom');
  const champNom = document.getElementById('compte-nom');
  const badgeRole = document.getElementById('compte-role');
  const lienAdmin = document.getElementById('compte-lien-admin');
  const boutonDeconnexion = document.getElementById('bouton-deconnexion');
  const retour = document.getElementById('retour-compte');

  async function chargerHistorique() {
    const liste = document.getElementById('liste-commandes');
    const note = document.getElementById('note-historique');
    if (!liste) return;

    liste.innerHTML = '';
    liste.className = 'etat-vide';
    liste.textContent = 'Chargement des candidatures…';

    const resultat = await Shop.mesCommandes();

    if (!resultat.ok) {
      liste.className = 'etat-vide';
      liste.textContent = resultat.message;
      note.textContent = '';
      return;
    }

    note.textContent = 'Affichage limité aux ' + Shop.LIMITE_HISTORIQUE + ' dernières candidatures.';

    if (resultat.commandes.length === 0) {
      liste.className = 'etat-vide';
      liste.textContent = 'Aucune candidature pour le moment.';
      return;
    }

    liste.className = 'liste-commandes';
    resultat.commandes.forEach(function (commande) {
      const item = creer('li');
      const lien = creer('a', null, commande.reference + ' — ' + formatDate(commande.created_at) +
        ' — ' + Shop.formatPrix(commande.total) + ' — ' + Shop.libelleStatut(commande.status));
      lien.href = 'confirmation.html?commande=' + encodeURIComponent(commande.id);
      item.appendChild(lien);
      liste.appendChild(item);
    });
  }

  async function chargerIdentite() {
    const session = await Shop.getSession();
    if (!session) {
      window.location.href = 'login.html?retour=compte.html';
      return;
    }
    const meta = session.user.user_metadata || {};
    champEmail.textContent = session.user.email || '—';
    champPrenom.textContent = meta.prenom || '—';
    champNom.textContent = meta.nom || '—';

    const role = (await Shop.roleCourant()) || 'client';
    badgeRole.textContent = role === 'admin' ? 'Administrateur' : 'Client';
    badgeRole.className = role === 'admin' ? 'badge-role admin' : 'badge-role';
    if (lienAdmin) lienAdmin.hidden = role !== 'admin';

    chargerHistorique();
  }

  chargerIdentite();

  if (boutonDeconnexion) {
    boutonDeconnexion.addEventListener('click', async function () {
      occuperBouton(boutonDeconnexion, true, 'Déconnexion…');
      const resultat = await Shop.deconnecter();
      if (resultat.ok) {
        window.location.href = 'index.html';
        return;
      }
      occuperBouton(boutonDeconnexion, false);
      afficher(retour, resultat.message, 'message-erreur');
    });
  }

  const boutonActualiser = document.getElementById('bouton-actualiser-commandes');
  if (boutonActualiser) {
    boutonActualiser.addEventListener('click', chargerHistorique);
  }
}

// ------------------------------------------
// Administration
// ------------------------------------------
function brancherAdmin() {
  const pageAdmin = document.getElementById('page-admin');
  if (!pageAdmin) return;

  const chargement = document.getElementById('admin-chargement');
  const refusAcces = document.getElementById('admin-refus');
  const texteRefus = document.getElementById('admin-refus-texte');
  const contenuAdmin = document.getElementById('admin-contenu');
  let estAdmin = false;

  // ----- Commandes -----
  const listeCommandes = document.getElementById('liste-commandes-admin');
  const etatCommandes = document.getElementById('etat-commandes');
  const filtreStatut = document.getElementById('filtre-statut');
  const boutonChargerPlus = document.getElementById('bouton-charger-plus');
  const nbCommandes = document.getElementById('nb-commandes');
  let commandesChargees = [];

  async function chargerCommandes(ajouter) {
    if (!listeCommandes) return;
    const decalage = ajouter ? commandesChargees.length : 0;
    if (!ajouter) {
      commandesChargees = [];
      listeCommandes.innerHTML = '';
      etatCommandes.hidden = false;
      etatCommandes.className = 'etat-vide';
      etatCommandes.textContent = 'Chargement des commandes…';
    }

    const resultat = await Shop.toutesLesCommandes({
      statut: filtreStatut ? filtreStatut.value : '',
      decalage: decalage
    });

    if (!resultat.ok) {
      etatCommandes.hidden = false;
      etatCommandes.className = 'message-erreur';
      etatCommandes.textContent = resultat.message;
      return;
    }

    if (resultat.commandes.length === 0 && decalage === 0) {
      etatCommandes.hidden = false;
      etatCommandes.className = 'etat-vide';
      etatCommandes.textContent = 'Aucune commande pour ce filtre.';
      if (boutonChargerPlus) boutonChargerPlus.hidden = true;
      if (nbCommandes) nbCommandes.textContent = '';
      return;
    }

    etatCommandes.hidden = true;
    resultat.commandes.forEach(function (commande) {
      commandesChargees.push(commande);
      listeCommandes.appendChild(construireLigneCommande(commande));
    });

    if (nbCommandes) {
      nbCommandes.textContent = commandesChargees.length + ' / ' + resultat.total + ' commande(s) affichée(s)';
    }
    if (boutonChargerPlus) {
      boutonChargerPlus.hidden = commandesChargees.length >= resultat.total;
    }
  }

  function construireLigneCommande(commande) {
    const article = creer('article', 'ligne-commande');

    const entete = creer('div', 'entete-ligne');
    const boutonDetail = creer('button', 'bascule-detail', '▶ Détail');
    boutonDetail.type = 'button';
    boutonDetail.setAttribute('aria-expanded', 'false');

    entete.appendChild(boutonDetail);
    entete.appendChild(creer('span', 'reference', commande.reference));
    entete.appendChild(creer('span', 'date', formatDate(commande.created_at)));
    entete.appendChild(creer('span', 'client', commande.delivery_email || '—'));
    entete.appendChild(creer('span', 'montant', Shop.formatPrix(commande.total)));
    entete.appendChild(creer('span', 'badge-statut statut-' + commande.status, Shop.libelleStatut(commande.status)));
    article.appendChild(entete);

    const detail = creer('div', 'detail-commande');
    detail.hidden = true;

    const listeArticles = creer('ul', 'liste-commandes');
    (Array.isArray(commande.items) ? commande.items : []).forEach(function (item) {
      listeArticles.appendChild(creer(
        'li',
        null,
        item.name + ' × ' + item.quantity + ' — ' + Shop.formatPrix(item.price) + ' l\'unité'
      ));
    });
    detail.appendChild(listeArticles);

    detail.appendChild(creer('p', null, 'Sous-total : ' + Shop.formatPrix(commande.subtotal)));
    detail.appendChild(creer('p', null, 'Frais de dossier : ' + Shop.formatPrix(commande.shipping)));
    detail.appendChild(creer('p', 'total', 'Total : ' + Shop.formatPrix(commande.total)));

    const coordonnees = creer('div', 'coordonnees-recap');
    coordonnees.appendChild(creer('p', null, 'Client : ' + (commande.delivery_name || '—') + ' — ' + (commande.delivery_email || '—')));
    if (commande.delivery_phone) coordonnees.appendChild(creer('p', null, 'Téléphone : ' + commande.delivery_phone));
    if (commande.delivery_city) coordonnees.appendChild(creer('p', null, 'Ville : ' + commande.delivery_city));
    if (commande.delivery_address) coordonnees.appendChild(creer('p', null, 'Adresse : ' + commande.delivery_address));
    coordonnees.appendChild(creer('p', null, 'Paiement : simulé (aucune donnée bancaire)'));
    detail.appendChild(coordonnees);

    const zoneStatut = creer('div', 'zone-statut');
    const label = creer('label', null, 'Statut');
    label.setAttribute('for', 'statut-' + commande.id);
    const select = creer('select');
    select.id = 'statut-' + commande.id;
    Object.keys(Shop.LIBELLES_STATUT).forEach(function (cle) {
      const option = creer('option', null, Shop.LIBELLES_STATUT[cle]);
      option.value = cle;
      if (cle === commande.status) option.selected = true;
      select.appendChild(option);
    });

    const boutonEnregistrer = creer('button', 'bouton petit', 'Enregistrer le statut');
    boutonEnregistrer.type = 'button';
    const retourStatut = creer('p', '', '');
    retourStatut.setAttribute('role', 'alert');

    boutonEnregistrer.addEventListener('click', async function () {
      if (boutonEnregistrer.disabled) return;
      afficher(retourStatut, '', '');
      occuperBouton(boutonEnregistrer, true, 'Enregistrement…');
      const resultat = await Shop.changerStatutCommande(commande.id, select.value, commande.updated_at);
      occuperBouton(boutonEnregistrer, false);

      if (!resultat.ok) {
        afficher(retourStatut, resultat.message, 'message-erreur');
        if (resultat.conflit && resultat.actuel) {
          commande.updated_at = resultat.actuel.updated_at;
          select.value = resultat.actuel.status;
        }
        return;
      }
      commande.status = select.value;
      commande.updated_at = resultat.details.miseAJour.updated_at;
      const badge = entete.querySelector('.badge-statut');
      badge.className = 'badge-statut statut-' + commande.status;
      badge.textContent = Shop.libelleStatut(commande.status);
      afficher(retourStatut, 'Statut enregistré.', 'message-ok');
    });

    zoneStatut.appendChild(label);
    zoneStatut.appendChild(select);
    zoneStatut.appendChild(boutonEnregistrer);
    zoneStatut.appendChild(retourStatut);
    detail.appendChild(zoneStatut);

    boutonDetail.addEventListener('click', function () {
      const ouvert = !detail.hidden;
      detail.hidden = ouvert;
      boutonDetail.textContent = ouvert ? '▶ Détail' : '▼ Détail';
      boutonDetail.setAttribute('aria-expanded', String(!ouvert));
    });

    article.appendChild(detail);
    return article;
  }

  // ----- Services (catalogue) -----
  const formulaireService = document.getElementById('formulaire-service');
  const listeServices = document.getElementById('liste-services');
  const etatServices = document.getElementById('etat-services');
  const retourService = document.getElementById('retour-service');
  const boutonNouveau = document.getElementById('bouton-nouveau-service');
  const boutonEnregistrer = document.getElementById('bouton-enregistrer-service');
  let idEnCours = null;
  let servicesEnMemoire = [];

  function remplirFormulaire(service) {
    document.getElementById('svc-id').value = service ? service.id : '';
    document.getElementById('svc-id').readOnly = !!service;
    document.getElementById('svc-nom').value = service ? service.name : '';
    document.getElementById('svc-categorie').value = service ? service.category : 'Stages';
    document.getElementById('svc-prix').value = service ? (service.price / 100).toFixed(2) : '';
    document.getElementById('svc-image').value = service ? (service.image || '') : '';
    document.getElementById('svc-description').value = service ? (service.description || '') : '';
    document.getElementById('svc-caracteristiques').value = service && Array.isArray(service.features)
      ? service.features.join('\n') : '';
    document.getElementById('svc-visible').checked = service ? !!service.is_available : true;
    idEnCours = service ? service.id : null;
    afficher(retourService, '', '');
  }

  async function chargerServices() {
    if (!listeServices) return;
    listeServices.innerHTML = '';
    etatServices.hidden = false;
    etatServices.className = 'etat-vide';
    etatServices.textContent = 'Chargement du catalogue…';

    const resultat = await Shop.listerServices();
    if (!resultat.ok) {
      etatServices.className = 'message-erreur';
      etatServices.textContent = resultat.message;
      return;
    }
    servicesEnMemoire = resultat.services;
    if (resultat.services.length === 0) {
      etatServices.className = 'etat-vide';
      etatServices.textContent = 'Aucun service enregistré.';
      return;
    }

    etatServices.hidden = true;
    resultat.services.forEach(function (service) {
      const ligne = creer('div', 'ligne-service');
      ligne.appendChild(creer('span', 'nom', service.name));
      ligne.appendChild(creer('span', 'categorie', service.category));
      ligne.appendChild(creer('span', 'prix', Shop.formatPrix(service.price)));
      ligne.appendChild(creer(
        'span',
        'badge-statut ' + (service.is_available ? 'statut-terminee' : 'statut-annulee'),
        service.is_available ? 'Visible' : 'Masqué'
      ));

      const boutonModifier = creer('button', 'bouton petit contour-bleu', 'Modifier');
      boutonModifier.type = 'button';
      boutonModifier.addEventListener('click', function () {
        remplirFormulaire(service);
        formulaireService.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });

      const boutonSupprimer = creer('button', 'bouton petit contour', 'Supprimer');
      boutonSupprimer.type = 'button';
      boutonSupprimer.addEventListener('click', async function () {
        const accord = window.confirm('Supprimer définitivement le service « ' + service.name + ' » ?');
        if (!accord) return;
        if (boutonSupprimer.disabled) return;
        boutonSupprimer.disabled = true;
        const suppression = await Shop.supprimerService(service.id);
        if (!suppression.ok) {
          boutonSupprimer.disabled = false;
          afficher(retourService, suppression.message, 'message-erreur');
          return;
        }
        if (idEnCours === service.id) remplirFormulaire(null);
        afficher(retourService, suppression.message, 'message-ok');
        chargerServices();
      });

      ligne.appendChild(boutonModifier);
      ligne.appendChild(boutonSupprimer);
      listeServices.appendChild(ligne);
    });
  }

  if (formulaireService) {
    formulaireService.addEventListener('submit', async function (event) {
      event.preventDefault();
      if (boutonEnregistrer && boutonEnregistrer.disabled) return;

      const infos = {
        id: document.getElementById('svc-id').value,
        name: document.getElementById('svc-nom').value,
        category: document.getElementById('svc-categorie').value,
        price: document.getElementById('svc-prix').value,
        image: document.getElementById('svc-image').value,
        description: document.getElementById('svc-description').value,
        features: document.getElementById('svc-caracteristiques').value,
        is_available: document.getElementById('svc-visible').checked
      };

      occuperBouton(boutonEnregistrer, true, 'Enregistrement…');
      const resultat = idEnCours
        ? await Shop.modifierService(idEnCours, infos)
        : await Shop.enregistrerService(infos);
      occuperBouton(boutonEnregistrer, false);

      if (!resultat.ok) {
        afficher(retourService, resultat.message, 'message-erreur');
        return;
      }

      afficher(retourService, resultat.message, 'message-ok');
      remplirFormulaire(null);
      chargerServices();
    });
  }

  if (boutonNouveau) {
    boutonNouveau.addEventListener('click', function () {
      remplirFormulaire(null);
      document.getElementById('svc-id').focus();
    });
  }

  // ----- Accès et rafraîchissement -----
  async function verifier() {
    const session = await Shop.getSession();
    if (!session) {
      if (chargement) chargement.hidden = true;
      if (refusAcces && texteRefus) {
        refusAcces.hidden = false;
        texteRefus.textContent = 'Vous devez être connecté(e) pour ouvrir cette page.';
      }
      return;
    }

    const role = await Shop.roleCourant();
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

    estAdmin = true;
    if (contenuAdmin) contenuAdmin.hidden = false;
    chargerCommandes(false);
    chargerServices();
  }

  verifier();

  if (filtreStatut) {
    filtreStatut.addEventListener('change', function () {
      if (estAdmin) chargerCommandes(false);
    });
  }
  if (boutonChargerPlus) {
    boutonChargerPlus.addEventListener('click', function () {
      if (estAdmin) chargerCommandes(true);
    });
  }
  const boutonActualiser = document.getElementById('bouton-actualiser-admin');
  if (boutonActualiser) {
    boutonActualiser.addEventListener('click', function () {
      if (estAdmin) {
        chargerCommandes(false);
        chargerServices();
      } else {
        window.location.reload();
      }
    });
  }
}

// ------------------------------------------
// Pages de compte : inscription / connexion / vérification
// ------------------------------------------
function brancherInscription() {
  const formulaireInscription = document.getElementById('formulaire-inscription');
  if (!formulaireInscription) return;

  const retour = document.getElementById('retour-inscription');
  const bouton = document.getElementById('bouton-inscription');
  const zoneSucces = document.getElementById('inscription-reussie');

  formulaireInscription.addEventListener('submit', async function (event) {
    event.preventDefault();
    afficher(retour, '', '');
    occuperBouton(bouton, true, 'Création du compte…');

    const resultat = await Shop.inscrire({
      prenom: document.getElementById('prenom').value,
      nom: document.getElementById('nom').value,
      email: document.getElementById('email-inscription').value,
      motDePasse: document.getElementById('mot-de-passe').value,
      confirmation: document.getElementById('confirmation').value
    });

    if (!resultat.ok) {
      occuperBouton(bouton, false);
      afficher(retour, resultat.message, 'message-erreur');
      return;
    }

    if (resultat.details && resultat.details.sessionImmediate) {
      window.location.href = 'compte.html';
      return;
    }

    formulaireInscription.hidden = true;
    if (zoneSucces) {
      zoneSucces.hidden = false;
      afficher(
        document.getElementById('inscription-succes-message'),
        resultat.message,
        'message-ok'
      );
    }
  });
}

function brancherConnexion() {
  const formulaireConnexion = document.getElementById('formulaire-connexion');
  if (!formulaireConnexion) return;

  const retour = document.getElementById('retour-connexion');
  const bouton = document.getElementById('bouton-connexion');

  formulaireConnexion.addEventListener('submit', async function (event) {
    event.preventDefault();
    afficher(retour, '', '');
    occuperBouton(bouton, true, 'Connexion…');

    const resultat = await Shop.connecter(
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
      window.location.href = retourSouhaite;
    } else {
      window.location.href = 'compte.html';
    }
  });
}

function brancherVerification() {
  const zone = document.getElementById('zone-verification');
  if (!zone) return;

  const message = document.getElementById('message-verification');
  const boutonVerifier = document.getElementById('bouton-verifier');

  async function evaluer() {
    const resultat = await Shop.confirmerRedirection();
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
// Démarrage
// ------------------------------------------
function demarrer() {
  majCompteurPanier();

  if (typeof window.Shop === 'undefined') {
    console.error('MatchUp : supabase-shop.js introuvable, les pages de compte sont inactives.');
    const zoneCatalogue = document.getElementById('catalogue-services');
    if (zoneCatalogue) {
      afficher(document.getElementById('catalogue-retour'), 'Catalogue indisponible (scripts Supabase manquants).', 'message-erreur');
    }
    const liste = document.getElementById('liste-commandes');
    if (liste) {
      liste.className = 'etat-vide';
      liste.textContent = 'Service de compte indisponible (scripts Supabase manquants).';
    }
    const refus = document.getElementById('admin-refus');
    const texteRefus = document.getElementById('admin-refus-texte');
    const chargement = document.getElementById('admin-chargement');
    if (chargement) chargement.hidden = true;
    if (refus && texteRefus) {
      refus.hidden = false;
      texteRefus.textContent = 'Service d\'administration indisponible (scripts Supabase manquants).';
    }
    afficher(document.getElementById('retour-inscription'), 'Service de compte indisponible (scripts Supabase manquants).', 'message-erreur');
    afficher(document.getElementById('retour-connexion'), 'Service de compte indisponible (scripts Supabase manquants).', 'message-erreur');
    return;
  }

  raccorderNavigation();
  brancherInscription();
  brancherConnexion();
  brancherVerification();
  brancherCompte();
  brancherCatalogue();
  brancherPanier();
  brancherCheckout();
  brancherConfirmation();
  brancherAdmin();
}

demarrer();
