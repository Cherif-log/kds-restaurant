const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'commandes.db'));

// Création de la table avec colonnes d'horodatage
db.exec(`
  CREATE TABLE IF NOT EXISTS commandes (
    id TEXT PRIMARY KEY,
    table_nom TEXT NOT NULL,
    details TEXT NOT NULL,
    statut TEXT NOT NULL,
    heure TEXT NOT NULL,
    timestamp_creation INTEGER DEFAULT 0,
    timestamp_fin INTEGER
  )
`);

// Migration automatique pour les bases de données existantes
try { db.exec("ALTER TABLE commandes ADD COLUMN timestamp_creation INTEGER DEFAULT 0"); } catch (e) {}
try { db.exec("ALTER TABLE commandes ADD COLUMN timestamp_fin INTEGER"); } catch (e) {}

// Commandes actives uniquement (pour la cuisine et la salle)
function recupererCommandes() {
  return db.prepare(`
    SELECT id, table_nom AS "table", details, statut, heure, timestamp_creation 
    FROM commandes 
    WHERE statut != 'Servie'
    ORDER BY timestamp_creation ASC
  `).all();
}

// Historique complet pour l'administration
function recupererHistorique() {
  return db.prepare(`
    SELECT id, table_nom AS "table", details, statut, heure, timestamp_creation, timestamp_fin 
    FROM commandes 
    ORDER BY timestamp_creation DESC
  `).all();
}

// Statistiques globales du service
function recupererStatistiques() {
  const total = db.prepare('SELECT COUNT(*) as nb FROM commandes').get().nb;
  const enCours = db.prepare("SELECT COUNT(*) as nb FROM commandes WHERE statut != 'Servie'").get().nb;
  const servies = db.prepare("SELECT COUNT(*) as nb FROM commandes WHERE statut = 'Servie'").get().nb;
  
  const tempsMoyenReq = db.prepare(`
    SELECT AVG((timestamp_fin - timestamp_creation) / 60000.0) as moyenne 
    FROM commandes 
    WHERE statut = 'Servie' AND timestamp_fin IS NOT NULL
  `).get();

  const tempsMoyenMinutes = tempsMoyenReq.moyenne ? Math.round(tempsMoyenReq.moyenne * 10) / 10 : 0;

  return { total, enCours, servies, tempsMoyenMinutes };
}

function ajouterCommande(commande) {
  const insert = db.prepare(`
    INSERT INTO commandes (id, table_nom, details, statut, heure, timestamp_creation)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insert.run(
    commande.id, 
    commande.table, 
    commande.details, 
    commande.statut, 
    commande.heure, 
    commande.timestamp_creation || Date.now()
  );
}

function changerStatutCommande(id, statut) {
  if (statut === 'Servie') {
    const update = db.prepare('UPDATE commandes SET statut = ?, timestamp_fin = ? WHERE id = ?');
    update.run(statut, Date.now(), id);
  } else {
    const update = db.prepare('UPDATE commandes SET statut = ? WHERE id = ?');
    update.run(statut, id);
  }
}

function supprimerCommande(id) {
  const suppression = db.prepare('DELETE FROM commandes WHERE id = ?');
  suppression.run(id);
}

module.exports = {
  recupererCommandes,
  recupererHistorique,
  recupererStatistiques,
  ajouterCommande,
  changerStatutCommande,
  supprimerCommande
};