// ==========================================
// MatchUp - Interactions simples
// ==========================================

// Bouton du menu mobile : affiche / cache le menu
const boutonMenu = document.getElementById('bouton-menu');
const menu = document.getElementById('menu');
if (boutonMenu && menu) {
  boutonMenu.addEventListener('click', function () {
    menu.classList.toggle('ouvert');
  });
}

// Bouton "retour en haut" : apparaît quand on descend dans la page
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
    event.preventDefault(); // empêche l'envoi réel (le site n'a pas de serveur)
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
