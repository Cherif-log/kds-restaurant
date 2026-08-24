const Database = require('better-sqlite3');
const path = require('path');

// Connexion / Création de la base SQLite
const db = new Database(path.join(__dirname, 'commandes.db'));
db.pragma('journal_mode = WAL');

// 1. CRÉATION DES TABLES
db.exec(`
  CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL,
    categorie TEXT NOT NULL,
    prix REAL NOT NULL,
    disponible INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS commandes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_num INTEGER NOT NULL,
    statut TEXT DEFAULT 'en_attente',
    total REAL DEFAULT 0,
    date_creation DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS commande_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    commande_id INTEGER NOT NULL,
    article_nom TEXT NOT NULL,
    quantite INTEGER NOT NULL DEFAULT 1,
    prix REAL NOT NULL,
    remarques TEXT,
    FOREIGN KEY (commande_id) REFERENCES commandes(id) ON DELETE CASCADE
  );
`);

// 2. CARTE COMPLÈTE — HÔTEL DES PINS
const carteComplete = [
  // ==================== 1. FORMULES & MENU 40 € ====================
  { nom: "Formule : Menu Hôtel des Pins (E+P+D)", categorie: "Menu 40 €", prix: 40.00 },
  
  // Entrées dans le Menu 40€
  { nom: "[Menu 40€] Entrée du Jour", categorie: "Menu 40 €", prix: 0.00 },
  { nom: "[Menu 40€] Saumon fumé maison", categorie: "Menu 40 €", prix: 0.00 },
  { nom: "[Menu 40€] Foie gras de canard maison, chutney & toast", categorie: "Menu 40 €", prix: 0.00 },
  { nom: "[Menu 40€] Soupe de poissons du Bassin et ses croûtons", categorie: "Menu 40 €", prix: 0.00 },
  { nom: "[Menu 40€] Cornet de friture de calamars sauce tartare", categorie: "Menu 40 €", prix: 0.00 },
  { nom: "[Menu 40€] Assiette de charcuterie", categorie: "Menu 40 €", prix: 0.00 },
  { nom: "[Menu 40€] Asperges blanches, jambon et vierge de tomate", categorie: "Menu 40 €", prix: 0.00 },

  // Plats dans le Menu 40€
  { nom: "[Menu 40€] Plat du Jour", categorie: "Menu 40 €", prix: 0.00 },
  { nom: "[Menu 40€] Dos de maigre, sauce vierge", categorie: "Menu 40 €", prix: 0.00 },
  { nom: "[Menu 40€] Pavé de cabillaud rôti, petits légumes iodés", categorie: "Menu 40 €", prix: 0.00 },
  { nom: "[Menu 40€] Pavé de bar à l’huile, risotto de riz noir", categorie: "Menu 40 €", prix: 0.00 },
  { nom: "[Menu 40€] Blanquette de seiche safranée", categorie: "Menu 40 €", prix: 0.00 },
  { nom: "[Menu 40€] Carpaccio de bœuf maison basilic & Parmesan", categorie: "Menu 40 €", prix: 0.00 },
  { nom: "[Menu 40€] Entrecôte de bœuf, échalotes confites", categorie: "Menu 40 €", prix: 0.00 },
  { nom: "[Menu 40€] Magret de canard, sauce au poivre", categorie: "Menu 40 €", prix: 0.00 },

  // Desserts dans le Menu 40€
  { nom: "[Menu 40€] Dessert du jour", categorie: "Menu 40 €", prix: 0.00 },
  { nom: "[Menu 40€] Assiette de fromages", categorie: "Menu 40 €", prix: 0.00 },
  { nom: "[Menu 40€] Crème brûlée à la vanille de Madagascar", categorie: "Menu 40 €", prix: 0.00 },
  { nom: "[Menu 40€] Tiramisu au café", categorie: "Menu 40 €", prix: 0.00 },
  { nom: "[Menu 40€] Café gourmand", categorie: "Menu 40 €", prix: 0.00 },
  { nom: "[Menu 40€] Fromage blanc fermier et son coulis", categorie: "Menu 40 €", prix: 0.00 },
  { nom: "[Menu 40€] Mousse au chocolat noir", categorie: "Menu 40 €", prix: 0.00 },
  { nom: "[Menu 40€] Cheesecake au citron", categorie: "Menu 40 €", prix: 0.00 },
  { nom: "[Menu 40€] Coupe glacée 2 boules au choix", categorie: "Menu 40 €", prix: 0.00 },

  // ==================== 2. LA CARTE : ENTRÉES (15 €) ====================
  { nom: "Terrine de foie de canard maison, chutney & toast céréales", categorie: "Entrées", prix: 15.00 },
  { nom: "Soupe de poissons et son accompagnement", categorie: "Entrées", prix: 15.00 },
  { nom: "Saumon fumé maison", categorie: "Entrées", prix: 15.00 },
  { nom: "Cornet de friture de calamars, sauce tartare", categorie: "Entrées", prix: 15.00 },
  { nom: "Assiette de charcuterie", categorie: "Entrées", prix: 15.00 },
  { nom: "Asperges blanches, jambon et vierge de tomate", categorie: "Entrées", prix: 15.00 },

  // ==================== 3. LA CARTE : POISSONS (25 €) ====================
  { nom: "Pavé de bar, huile d’olive de Nice", categorie: "Poissons", prix: 25.00 },
  { nom: "Dos de maigre, sauce vierge", categorie: "Poissons", prix: 25.00 },
  { nom: "Pavé de cabillaud rôti, petits légumes consommés iodés", categorie: "Poissons", prix: 25.00 },
  { nom: "Blanquette de seiche safranée", categorie: "Poissons", prix: 25.00 },

  // ==================== 4. LA CARTE : VIANDES (25 €) ====================
  { nom: "Carpaccio de bœuf maison au basilic et parmesan", categorie: "Viandes", prix: 25.00 },
  { nom: "Entrecôte de bœuf, échalotes confites", categorie: "Viandes", prix: 25.00 },
  { nom: "Magret de canard, sauce au poivre", categorie: "Viandes", prix: 25.00 },

  // ==================== 5. LA CARTE : DESSERTS ====================
  { nom: "Dessert du jour", categorie: "Desserts", prix: 8.00 },
  { nom: "Café gourmand", categorie: "Desserts", prix: 10.00 },
  { nom: "Fromage blanc fermier et coulis fruits exotiques", categorie: "Desserts", prix: 8.00 },
  { nom: "Mousse au chocolat", categorie: "Desserts", prix: 8.00 },
  { nom: "Assiette de fromages", categorie: "Desserts", prix: 8.00 },
  { nom: "Crème brûlée à la vanille de Madagascar", categorie: "Desserts", prix: 8.00 },
  { nom: "Cheesecake au citron", categorie: "Desserts", prix: 8.00 },
  { nom: "Tiramisu au café", categorie: "Desserts", prix: 8.00 },
  { nom: "Coupe de glaces 2 boules au choix", categorie: "Desserts", prix: 8.00 },

  // ==================== 6. MENU ENFANT (15 €) ====================
  { nom: "Menu Enfant : Chicken tenders", categorie: "Menu Enfant", prix: 15.00 },
  { nom: "Menu Enfant : Steak haché", categorie: "Menu Enfant", prix: 15.00 },
  { nom: "Menu Enfant : Filet de poisson", categorie: "Menu Enfant", prix: 15.00 },

  // ==================== 7. GARNITURES (AU CHOIX) ====================
  { nom: "Garniture : Salade du jardin", categorie: "Garnitures", prix: 0.00 },
  { nom: "Garniture : Frites maison", categorie: "Garnitures", prix: 0.00 },
  { nom: "Garniture : Purée maison", categorie: "Garnitures", prix: 0.00 },
  { nom: "Garniture : Légumes sautés maison", categorie: "Garnitures", prix: 0.00 },

  // ==================== 8. PARFUMS DE GLACE ====================
  { nom: "Parfum : Vanille", categorie: "Glaces", prix: 0.00 },
  { nom: "Parfum : Café", categorie: "Glaces", prix: 0.00 },
  { nom: "Parfum : Chocolat", categorie: "Glaces", prix: 0.00 },
  { nom: "Parfum : Fraise", categorie: "Glaces", prix: 0.00 },
  { nom: "Parfum : Citron", categorie: "Glaces", prix: 0.00 },
  { nom: "Parfum : Coco", categorie: "Glaces", prix: 0.00 },
  { nom: "Parfum : Rhum raisin", categorie: "Glaces", prix: 0.00 },
  { nom: "Parfum : Caramel beurre salé", categorie: "Glaces", prix: 0.00 },
  { nom: "Parfum : Poire", categorie: "Glaces", prix: 0.00 }
];

// 3. SYNCHRONISATION FORCÉE DE LA BASE DE DONNÉES
function reinitialiserCarte() {
  const insert = db.prepare('INSERT INTO articles (nom, categorie, prix, disponible) VALUES (?, ?, ?, 1)');
  const syncTx = db.transaction((items) => {
    db.prepare('DELETE FROM articles').run();
    for (const item of items) {
      insert.run(item.nom, item.categorie, item.prix);
    }
  });
  syncTx(carteComplete);
}

// Réinitialisation automatique au lancement
reinitialiserCarte();

// 4. FONCTIONS UTILITAIRES
db.getArticles = () => db.prepare('SELECT * FROM articles WHERE disponible = 1').all();
db.getAllArticles = () => db.prepare('SELECT * FROM articles').all();

db.getCommandesActives = () => {
  const commandes = db.prepare("SELECT * FROM commandes WHERE statut NOT IN ('servi', 'annule') ORDER BY date_creation ASC").all();
  return commandes.map(cmd => {
    const items = db.prepare('SELECT * FROM commande_items WHERE commande_id = ?').all(cmd.id);
    return { ...cmd, items };
  });
};

db.getCommandes = () => {
  const commandes = db.prepare('SELECT * FROM commandes ORDER BY date_creation DESC').all();
  return commandes.map(cmd => {
    const items = db.prepare('SELECT * FROM commande_items WHERE commande_id = ?').all(cmd.id);
    return { ...cmd, items };
  });
};

db.creerCommande = (table_num, items, total = 0) => {
  const insertCmd = db.prepare('INSERT INTO commandes (table_num, statut, total) VALUES (?, ?, ?)');
  const insertItem = db.prepare('INSERT INTO commande_items (commande_id, article_nom, quantite, prix, remarques) VALUES (?, ?, ?, ?, ?)');
  
  let calculatedTotal = 0;
  items.forEach(it => { calculatedTotal += (it.prix || 0) * (it.quantite || 1); });
  const finalTotal = total > 0 ? total : calculatedTotal;

  const info = insertCmd.run(table_num, 'en_attente', finalTotal);
  const commandeId = info.lastInsertRowid;

  for (const it of items) {
    insertItem.run(commandeId, it.nom || it.article_nom, it.quantite || 1, it.prix || 0, it.remarques || '');
  }

  return commandeId;
};

db.updateStatut = (id, statut) => {
  db.prepare('UPDATE commandes SET statut = ? WHERE id = ?').run(statut, id);
};

module.exports = db;