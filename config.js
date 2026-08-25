// config.js — Configuration personnalisée de l'établissement
module.exports = {
  // Identité officielle du restaurant (Dynamique avec repli par défaut)
  etablissement: process.env.RESTAURANT_NAME || "Hôtel des Pins",
  adresse: process.env.RESTAURANT_ADDRESS || "23 Rue des Fauvettes, 33970 Lège-Cap-Ferret",
  siret: process.env.RESTAURANT_SIRET || "412 655 326 00012",
  telephone: process.env.RESTAURANT_PHONE || "05 56 60 60 11",
  wifi: "HotelDesPins_Guest",

  // Monitoring UptimeRobot & Statut public
  monitoring: {
    serviceName: "SmartView FAST",
    statusPageUrl: process.env.UPTIMEROBOT_STATUS_URL || "https://stats.uptimerobot.com/rnzYHtVN0v"
  },

  // 🎨 THÈME & CHARTE GRAPHIQUE
  theme: {
    logoUrl: "",                   
    couleurPrimary: "#0f172a",     
    couleurAccent: "#2563eb",      
    couleurHeaderTexte: "#ffffff"  
  },

  // Modèle économique SaaS & codes d'accès
  superPin: process.env.SUPER_PIN || "7777", 
  pinDirection: process.env.PIN_DIRECTION || "9999",                     
  tarifMensuel: 49.99,

  // Modules et options
  options: {
    moduleHotel: process.env.ENABLE_HOTEL ? process.env.ENABLE_HOTEL === "true" : true, // false si restaurant simple
    tauxTVA: 0.10,          
    devise: "€"
  },

  // Plan de salle initial
  planInitial: [
    { zone: "🌲 Terrasse & Pinède", tables: [1, 2, 3, 4, 5, 6] },
    { zone: "🍽️ Salle Intérieure", tables: [7, 8, 9, 10, 11, 12] },
    { zone: "🌿 Patio & Véranda", tables: [13, 14, 15] }
  ],

  // Équipe initiale
  serveursInitiaux: [
    { nom: "Thomas", pin: "1234" },
    { nom: "Sarah", pin: "5678" },
    { nom: "Maxime", pin: "0000" },
    { nom: "Direction", pin: "9999" }
  ],

  // Carte initiale du restaurant
  carteInitiale: [
    // 🍲 Ardoise du jour
    { id: "ard_formule", slug: "formule_jour", nom: "Formule du Jour (E+P ou P+D)", cat: "🍲 Ardoise du Jour", section: "1. Formules du Jour", prix: 22.00, has_options: 0, has_cuisson: 0 },
    { id: "ard_entree", slug: "entree_jour", nom: "Entrée du jour : Gaspacho de tomates & burrata", cat: "🍲 Ardoise du Jour", section: "2. Suggestions du Marché", prix: 8.50, has_options: 0, has_cuisson: 0 },
    { id: "ard_plat", slug: "plat_jour", nom: "Plat du jour : Dos de cabillaud rôti aux agrumes", cat: "🍲 Ardoise du Jour", section: "2. Suggestions du Marché", prix: 17.50, has_options: 0, has_cuisson: 0 },
    { id: "ard_dessert", slug: "dessert_jour", nom: "Dessert du jour : Tartelette fraises & crème d'amande", cat: "🍲 Ardoise du Jour", section: "2. Suggestions du Marché", prix: 7.50, has_options: 0, has_cuisson: 0 },

    // 🍽️ Menu 40 €
    { id: "m40_formule", slug: "formule_40", nom: "Formule : Menu Hôtel des Pins (E+P+D)", cat: "Menu 40 €", section: "1. Facturation Formule", prix: 40.00, has_options: 0, has_cuisson: 0 },
    { id: "m40_e1", slug: "saumon_fume", nom: "Saumon fumé maison (Menu 40€)", cat: "Menu 40 €", section: "2. Entrées du Menu", prix: 0.00, has_options: 0, has_cuisson: 0 },
    { id: "m40_e2", slug: "foie_gras", nom: "Foie gras de canard maison (Menu 40€)", cat: "Menu 40 €", section: "2. Entrées du Menu", prix: 0.00, has_options: 0, has_cuisson: 0 },
    { id: "m40_e3", slug: "soupe_poissons", nom: "Soupe de poissons du Bassin (Menu 40€)", cat: "Menu 40 €", section: "2. Entrées du Menu", prix: 0.00, has_options: 0, has_cuisson: 0 },
    { id: "m40_e4", slug: "calamars", nom: "Friture de calamars (Menu 40€)", cat: "Menu 40 €", section: "2. Entrées du Menu", prix: 0.00, has_options: 0, has_cuisson: 0 },
    { id: "m40_p1", slug: "dos_maigre", nom: "Dos de maigre, sauce vierge (Menu 40€)", cat: "Menu 40 €", section: "3. Plats du Menu", prix: 0.00, has_options: 0, has_cuisson: 0 },
    { id: "m40_p2", slug: "cabillaud", nom: "Pavé de cabillaud rôti (Menu 40€)", cat: "Menu 40 €", section: "3. Plats du Menu", prix: 0.00, has_options: 0, has_cuisson: 0 },
    { id: "m40_p3", slug: "entrecote", nom: "Entrecôte de bœuf, échalotes (Menu 40€)", cat: "Menu 40 €", section: "3. Plats du Menu", prix: 0.00, has_options: 1, has_cuisson: 1 },
    { id: "m40_p4", slug: "magret", nom: "Magret de canard, poivre (Menu 40€)", cat: "Menu 40 €", section: "3. Plats du Menu", prix: 0.00, has_options: 1, has_cuisson: 1 },
    { id: "m40_d1", slug: "creme_brulee", nom: "Crème brûlée à la vanille (Menu 40€)", cat: "Menu 40 €", section: "4. Desserts du Menu", prix: 0.00, has_options: 0, has_cuisson: 0 },
    { id: "m40_d2", slug: "tiramisu", nom: "Tiramisu au café (Menu 40€)", cat: "Menu 40 €", section: "4. Desserts du Menu", prix: 0.00, has_options: 0, has_cuisson: 0 },
    { id: "m40_d3", slug: "cafe_gourmand", nom: "Café gourmand (Menu 40€)", cat: "Menu 40 €", section: "4. Desserts du Menu", prix: 0.00, has_options: 0, has_cuisson: 0 },

    // 🥩 Entrées à la carte
    { id: "c_e1", slug: "foie_gras_carte", nom: "Terrine de foie de canard maison", cat: "Entrées (15 €)", section: "Entrées à la carte", prix: 15.00, has_options: 0, has_cuisson: 0 },
    { id: "c_e2", slug: "saumon_fume_carte", nom: "Saumon fumé maison", cat: "Entrées (15 €)", section: "Entrées à la carte", prix: 15.00, has_options: 0, has_cuisson: 0 },

    // 🐟 Poissons & Viandes à la carte
    { id: "c_p1", slug: "bar_carte", nom: "Pavé de bar, huile d’olive de Nice", cat: "Poissons (25 €)", section: "Poissons à la carte", prix: 25.00, has_options: 0, has_cuisson: 0 },
    { id: "c_v1", slug: "entrecote_carte", nom: "Entrecôte de bœuf, échalotes", cat: "Viandes (25 €)", section: "Viandes à la carte", prix: 25.00, has_options: 1, has_cuisson: 1 },

    // 🍨 Desserts à la carte
    { id: "c_d1", slug: "cafe_gourmand_carte", nom: "Café gourmand", cat: "Desserts", section: "Desserts à la carte", prix: 10.00, has_options: 0, has_cuisson: 0 },
    { id: "c_d2", slug: "creme_brulee_carte", nom: "Crème brûlée à la vanille", cat: "Desserts", section: "Desserts à la carte", prix: 8.00, has_options: 0, has_cuisson: 0 },

    // 🧒 Menu Enfant
    { id: "enf_p1", slug: "tenders_enf", nom: "Menu Enfant : Chicken tenders", cat: "Menu Enfant (15 €)", section: "1. Plats Enfant (15 €)", prix: 15.00, has_options: 0, has_cuisson: 0 },
    { id: "enf_p2", slug: "steak_enf", nom: "Menu Enfant : Steak haché", cat: "Menu Enfant (15 €)", section: "1. Plats Enfant (15 €)", prix: 15.00, has_options: 1, has_cuisson: 1 }
  ]
};