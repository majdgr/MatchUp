// ==========================================
// MatchUp - Initialisation du client Supabase
// Une seule création de client pour tout le site.
// Seules la Project URL et la Publishable key sont
// autorisées ici. Jamais de clé secrète, jamais de
// mot de passe de base de données.
// ==========================================

const SUPABASE_URL = "https://emgebkkbzcusapxhgxep.supabase.co";
const SUPABASE_KEY = "sb_publishable_VOYhuwhMbHZBV0nuwMBqMQ_meiWGyY3";

if (!window.sb) {
  if (typeof supabase === "undefined") {
    console.error(
      "MatchUp : la bibliothèque Supabase n'est pas chargée. " +
      "Vérifiez l'ordre des scripts (supabase-js, puis supabase-client.js)."
    );
    window.sb = null;
  } else {
    window.sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  }
}

const sb = window.sb;

// Construit l'URL absolue d'une page du site.
// Fonctionne en local (http://localhost:8000) comme sur Vercel (https://...vercel.app).
function urlDePage(nom) {
  return new URL(nom, window.location.href).toString();
}
