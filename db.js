const Database = require('better-sqlite3');
const path = require('path');

// Connexion / Création de la base de données SQLite
const db = new Database(path.join(__dirname, 'commandes.db'));

// Optimisation des performances
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
    statut TEXT DEFAULT 'en_attente', -- en_attente, en_preparation, pret, servi, annule
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
const carteHotelDesPins = [
  // --- FORMULES ---
  { nom: "Menu Hôtel des Pins (E+P+D)", categorie: "Formules", prix: 40.00 },
  { nom: "Menu Enfant (Plat + Garniture)", categorie: "Formules", prix: 15.00 },

  // --- ENTRÉES (15 €) ---
  { nom: "Terrine de foie de canard maison, chutney & toasts", categorie: "Entrées", prix: 15.00 },
  { nom: "Soupe de poissons du Bassin et ses croûtons", categorie: "Entrées", prix: 15.00 },
  { nom: "Saumon fumé maison", categorie: "Entrées", prix: 15.00 },
  { nom: "Cornet de friture de calamars, sauce tartare", categorie: "Entrées", prix: 15.00 },
  { nom: "Assiette de charcuterie", categorie: "Entrées", prix: 15.00 },
  { nom: "Asperges blanches, jambon et vierge de tomate", categorie: "Entrées", prix: 15.00 },

  // --- POISSONS (25 €) ---
  { nom: "Pavé de bar, huile d'olive de Nice", categorie: "Poissons", prix: 25.00 },
  { nom: "Dos de maigre, sauce vierge", categorie: "Poissons", prix: 25.00 },
  { nom: "Pavé de cabillaud rôti, petits légumes iodés", categorie: "Poissons", prix: 25.00 },
  { nom: "Blanquette de seiche safranée", categorie: "Poissons", prix: 25.00 },

  // --- VIANDES (25 €) ---
  { nom: "Carpaccio de bœuf maison, basilic & parmesan", categorie: "Viandes", prix: 25.00 },
  { nom: "Entrecôte de bœuf, échalotes confites", categorie: "Viandes", prix: 25.00 },
  { nom: "Magret de canard, sauce au poivre", categorie: "Viandes", prix: 25.00 },

  // --- DESSERTS ---
  { nom: "Dessert du jour", categorie: "Desserts", prix: 8.00 },
  { nom: "Café gourmand", categorie: "Desserts", prix: 10.00 },
  { nom: "Fromage blanc fermier et son coulis", categorie: "Desserts", prix: 8.00 },
  { nom: "Mousse au chocolat noir", categorie: "Desserts", prix: 8.00 },
  { nom: "Assiette de fromages", categorie: "Desserts", prix: 8.00 },
  { nom: "Crème brûlée à la vanille de Madagascar", categorie: "Desserts", prix: 8.00 },
  { nom: "Cheesecake au citron", categorie: "Desserts", prix: 8.00 },
  { nom: "Tiramisu au café", categorie: "Desserts", prix: 8.00 },
  { nom: "Coupe glacée 2 boules au choix", categorie: "Desserts", prix: 8.00 }
];

// 3. SYNCHRONISATION AUTOMATIQUE DE LA CARTE
function synchroniserCarte() {
  const insert = db.prepare('INSERT INTO articles (nom, categorie, prix, disponible) VALUES (?, ?, ?, 1)');
  const insertMany = db.transaction((items) => {
    db.prepare('DELETE FROM articles').run();
    for (const item of items) {
      insert.run(item.nom, item.categorie, item.prix);
    }
  });
  insertMany(carteHotelDesPins);
}

// Vérifie si la nouvelle carte est déjà installée
const articleTest = db.prepare("SELECT id FROM articles WHERE nom LIKE '%Hôtel des Pins%' LIMIT 1").get();
if (!articleTest) {
  synchroniserCarte();
}

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