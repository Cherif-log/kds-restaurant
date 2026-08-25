// config.js — Profil du restaurant (Exemple : L'Auberge du Bassin)
module.exports = {
  // Identité de l'établissement
  etablissement: "L'Auberge du Bassin",
  adresse: "Quartier des Pêcheurs, 33970 Lège-Cap-Ferret",
  siret: "812 345 678 00019",
  telephone: "05 56 60 00 00",
  wifi: "AubergeBassin_Guest",

  // Modèle économique SaaS
  superPin: process.env.SUPER_PIN || "7777", // Ton code d'accès éditeur
  pinDirection: "9999",                     // Code client par défaut
  tarifMensuel: 49.99,

  // Modules activés
  options: {
    moduleHotel: true,      // true si hôtel/chambres, false si restaurant seul
    tauxTVA: 0.10,          // 10% restauration
    devise: "€"
  },

  // Plan de salle initial
  planInitial: [
    { zone: "🌊 Terrasse Bassin", tables: [1, 2, 3, 4, 5, 6, 7, 8] },
    { zone: "🍽️ Salle Principale", tables: [10, 11, 12, 13, 14, 15] },
    { zone: "🌿 Bar & Comptoir", tables: [20, 21, 22] }
  ],

  // Équipe initiale
  serveursInitiaux: [
    { nom: "Alexandre", pin: "1111" },
    { nom: "Julie", pin: "2222" },
    { nom: "Direction", pin: "9999" }
  ],

  // Carte initiale du restaurant
  carteInitiale: [
    // Ardoise du jour
    { id: "ard_formule", slug: "formule_jour", nom: "Formule du Marché (E+P ou P+D)", cat: "🍲 Ardoise du Jour", section: "1. Formules", prix: 24.00, has_options: 0, has_cuisson: 0 },
    { id: "ard_entree", slug: "entree_jour", nom: "Entrée du jour : Huîtres N°3 du Bassin (x6)", cat: "🍲 Ardoise du Jour", section: "2. Suggestions", prix: 11.00, has_options: 0, has_cuisson: 0 },
    { id: "ard_plat", slug: "plat_jour", nom: "Plat du jour : Lotte à l'Armoricaine", cat: "🍲 Ardoise du Jour", section: "2. Suggestions", prix: 21.00, has_options: 0, has_cuisson: 0 },
    { id: "ard_dessert", slug: "dessert_jour", nom: "Dessert du jour : Cannelés tièdes & glace vanille", cat: "🍲 Ardoise du Jour", section: "2. Suggestions", prix: 8.00, has_options: 0, has_cuisson: 0 },

    // Carte permanente
    { id: "ent_1", slug: "huitres_bassin", nom: "6 Huîtres du Cap Ferret N°3", cat: "Entrées", section: "Entrées", prix: 13.00, has_options: 0, has_cuisson: 0 },
    { id: "ent_2", slug: "soupe_poisson", nom: "Soupe de poissons artisanale", cat: "Entrées", section: "Entrées", prix: 12.50, has_options: 0, has_cuisson: 0 },
    { id: "plt_1", slug: "bar_grille", nom: "Bar entier grillé au fenouil", cat: "Plats", section: "Poissons & Viandes", prix: 26.00, has_options: 0, has_cuisson: 0 },
    { id: "plt_2", slug: "entrecote_bassin", nom: "Entrecôte grillée sauce échalotes", cat: "Plats", section: "Poissons & Viandes", prix: 25.00, has_options: 1, has_cuisson: 1 },
    { id: "des_1", slug: "dune_blanche", nom: "Assiette de Dunes Blanches locales", cat: "Desserts", section: "Desserts", prix: 7.50, has_options: 0, has_cuisson: 0 }
  ]
};