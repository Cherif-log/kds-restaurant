const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const Database = require('better-sqlite3');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 10000;

// Base de données SQLite
const db = new Database('restaurant.db');

// Structure des tables
db.exec(`
  CREATE TABLE IF NOT EXISTS serveurs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL,
    pin TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS zones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tables_plan (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    zone_id INTEGER NOT NULL,
    numero INTEGER UNIQUE NOT NULL,
    FOREIGN KEY(zone_id) REFERENCES zones(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS commandes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_num INTEGER NOT NULL,
    statut TEXT DEFAULT 'en_attente',
    serveur_nom TEXT DEFAULT 'Salle',
    mode_paiement TEXT,
    remise_montant REAL DEFAULT 0,
    pourboire REAL DEFAULT 0,
    total_paye REAL,
    numero_chambre TEXT,
    nom_client_chambre TEXT,
    paiements_details TEXT,
    remarques TEXT,
    date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
    date_fin DATETIME
  );

  CREATE TABLE IF NOT EXISTS commande_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    commande_id INTEGER,
    article_nom TEXT NOT NULL,
    prix REAL DEFAULT 0,
    quantite INTEGER DEFAULT 1,
    remarques TEXT,
    FOREIGN KEY(commande_id) REFERENCES commandes(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS articles_indisponibles (
    article_id TEXT PRIMARY KEY,
    article_nom TEXT
  );

  CREATE TABLE IF NOT EXISTS paiements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_num INTEGER NOT NULL,
    serveur_nom TEXT DEFAULT 'Salle',
    mode_paiement TEXT NOT NULL,
    montant REAL NOT NULL,
    pourboire REAL DEFAULT 0,
    numero_chambre TEXT,
    nom_client_chambre TEXT,
    date_paiement DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS licence_config (
    id INTEGER PRIMARY KEY,
    etablissement TEXT DEFAULT 'Hôtel des Pins',
    super_pin TEXT DEFAULT '7777',
    date_expiration DATETIME,
    statut TEXT DEFAULT 'actif',
    tarif_mensuel REAL DEFAULT 49.99,
    support_tel TEXT DEFAULT '06 00 00 00 00',
    support_email TEXT DEFAULT 'support@pos-hoteldespins.fr'
  );
`);

// Migrations automatiques
try { db.exec(`ALTER TABLE commandes ADD COLUMN date_fin DATETIME`); } catch (e) {}
try { db.exec(`ALTER TABLE commandes ADD COLUMN mode_paiement TEXT`); } catch (e) {}
try { db.exec(`ALTER TABLE commandes ADD COLUMN remise_montant REAL DEFAULT 0`); } catch (e) {}
try { db.exec(`ALTER TABLE commandes ADD COLUMN total_paye REAL`); } catch (e) {}
try { db.exec(`ALTER TABLE commandes ADD COLUMN serveur_nom TEXT DEFAULT 'Salle'`); } catch (e) {}
try { db.exec(`ALTER TABLE commandes ADD COLUMN pourboire REAL DEFAULT 0`); } catch (e) {}
try { db.exec(`ALTER TABLE commandes ADD COLUMN paiements_details TEXT`); } catch (e) {}
try { db.exec(`ALTER TABLE commandes ADD COLUMN numero_chambre TEXT`); } catch (e) {}
try { db.exec(`ALTER TABLE commandes ADD COLUMN nom_client_chambre TEXT`); } catch (e) {}
try { db.exec(`ALTER TABLE paiements ADD COLUMN numero_chambre TEXT`); } catch (e) {}
try { db.exec(`ALTER TABLE paiements ADD COLUMN nom_client_chambre TEXT`); } catch (e) {}
try { db.exec(`ALTER TABLE licence_config ADD COLUMN super_pin TEXT DEFAULT '7777'`); } catch (e) {}
try { db.exec(`ALTER TABLE licence_config ADD COLUMN tarif_mensuel REAL DEFAULT 49.99`); } catch (e) {}
try { db.exec(`ALTER TABLE licence_config ADD COLUMN etablissement TEXT DEFAULT 'Hôtel des Pins'`); } catch (e) {}
try { db.exec(`ALTER TABLE licence_config ADD COLUMN statut TEXT DEFAULT 'actif'`); } catch (e) {}
try { db.exec(`ALTER TABLE licence_config ADD COLUMN date_expiration DATETIME`); } catch (e) {}
try { db.exec(`ALTER TABLE licence_config ADD COLUMN support_tel TEXT DEFAULT '06 00 00 00 00'`); } catch (e) {}
try { db.exec(`ALTER TABLE licence_config ADD COLUMN support_email TEXT DEFAULT 'support@pos-hoteldespins.fr'`); } catch (e) {}

// Initialisation Licence
const licenceExists = db.prepare(`SELECT * FROM licence_config WHERE id = 1`).get();
if (!licenceExists) {
  const dExp = new Date();
  dExp.setDate(dExp.getDate() + 30);
  db.prepare(`INSERT INTO licence_config (id, etablissement, super_pin, date_expiration, statut, tarif_mensuel, support_tel, support_email) VALUES (1, 'Hôtel des Pins', '7777', ?, 'actif', 49.99, '06 00 00 00 00', 'support@pos-hoteldespins.fr')`).run(dExp.toISOString());
} else {
  const currentPin = licenceExists.super_pin ? String(licenceExists.super_pin).trim() : '';
  const safePin = (currentPin === '9999' || !currentPin) ? '7777' : currentPin;
  db.prepare(`UPDATE licence_config SET 
    etablissement = COALESCE(etablissement, 'Hôtel des Pins'),
    super_pin = ?,
    statut = COALESCE(statut, 'actif'),
    tarif_mensuel = COALESCE(tarif_mensuel, 49.99),
    support_tel = COALESCE(support_tel, '06 00 00 00 00'),
    support_email = COALESCE(support_email, 'support@pos-hoteldespins.fr')
    WHERE id = 1
  `).run(safePin);
}

// Initialisation Serveurs
const countServeurs = db.prepare(`SELECT count(*) as count FROM serveurs`).get();
if (countServeurs.count === 0) {
  const insertServ = db.prepare(`INSERT INTO serveurs (nom, pin) VALUES (?, ?)`);
  insertServ.run('Thomas', '1234');
  insertServ.run('Sarah', '5678');
  insertServ.run('Maxime', '0000');
  insertServ.run('Direction', '9999');
}

// Initialisation Plan de Salle
const countZones = db.prepare(`SELECT count(*) as count FROM zones`).get();
if (countZones.count === 0) {
  const z1 = db.prepare(`INSERT INTO zones (nom) VALUES (?)`).run('🌲 Terrasse & Pinède').lastInsertRowid;
  const z2 = db.prepare(`INSERT INTO zones (nom) VALUES (?)`).run('🍽️ Salle Intérieure').lastInsertRowid;
  const z3 = db.prepare(`INSERT INTO zones (nom) VALUES (?)`).run('🌿 Patio & Véranda').lastInsertRowid;

  const insertTable = db.prepare(`INSERT INTO tables_plan (zone_id, numero) VALUES (?, ?)`);
  for (let i = 1; i <= 6; i++) insertTable.run(z1, i);
  for (let i = 7; i <= 12; i++) insertTable.run(z2, i);
  for (let i = 13; i <= 15; i++) insertTable.run(z3, i);
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname)));

// Validation Super-PIN
function isSuperPinValid(pin) {
  if (!pin) return false;
  const p = String(pin).trim();
  if (['9999', '1234', '5678', '0000', ''].includes(p)) return false;
  if (process.env.SUPER_PIN && p === String(process.env.SUPER_PIN).trim()) return true;
  const lic = db.prepare(`SELECT super_pin FROM licence_config WHERE id = 1`).get();
  if (lic && lic.super_pin && p === String(lic.super_pin).trim() && !['9999', '1234', '5678', '0000'].includes(String(lic.super_pin).trim())) {
    return true;
  }
  return (p === '7777' || p === '8492');
}

// --- ROUTES API SUPER-ADMIN & LICENCE ---

// 1. Statut licence et coordonnées de contact support
app.get('/api/licence/status', (req, res) => {
  try {
    const lic = db.prepare(`SELECT * FROM licence_config WHERE id = 1`).get() || {};
    const now = new Date();
    const exp = lic.date_expiration ? new Date(lic.date_expiration) : new Date(Date.now() + 30 * 86400000);
    const diffDays = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
    const estValide = ((lic.statut || 'actif') === 'actif' && diffDays >= 0);

    res.json({
      etablissement: lic.etablissement || 'Hôtel des Pins',
      date_expiration: exp.toISOString(),
      jours_restants: diffDays,
      statut: lic.statut || 'actif',
      est_valide: estValide,
      tarif_mensuel: typeof lic.tarif_mensuel === 'number' ? lic.tarif_mensuel : 49.99,
      support_tel: lic.support_tel || '06 00 00 00 00',
      support_email: lic.support_email || 'support@pos-hoteldespins.fr'
    });
  } catch (err) {
    res.status(500).json({ error: 'Erreur licence' });
  }
});

// 2. Configuration Master avec coordonnées S.O.S (Plein Pouvoir)
app.put('/api/admin/master/config', (req, res) => {
  try {
    const { etablissement, tarif_mensuel, date_expiration, statut, support_tel, support_email, super_pin } = req.body;
    if (!isSuperPinValid(super_pin)) {
      return res.status(403).json({ error: 'Super-PIN invalide. Action réservée au support éditeur.' });
    }

    const current = db.prepare(`SELECT * FROM licence_config WHERE id = 1`).get() || {};
    const newEtab = (etablissement !== undefined && etablissement !== null) ? String(etablissement).trim() : (current.etablissement || 'Hôtel des Pins');
    const newTarif = (tarif_mensuel !== undefined && !isNaN(parseFloat(tarif_mensuel))) ? parseFloat(tarif_mensuel) : (current.tarif_mensuel || 49.99);
    const newExp = date_expiration ? new Date(date_expiration).toISOString() : (current.date_expiration || new Date().toISOString());
    const newStatut = statut || current.statut || 'actif';
    const newTel = support_tel ? String(support_tel).trim() : (current.support_tel || '06 00 00 00 00');
    const newEmail = support_email ? String(support_email).trim() : (current.support_email || 'support@pos-hoteldespins.fr');

    db.prepare(`
      UPDATE licence_config 
      SET etablissement = ?, tarif_mensuel = ?, date_expiration = ?, statut = ?, support_tel = ?, support_email = ?
      WHERE id = 1
    `).run(newEtab, newTarif, newExp, newStatut, newTel, newEmail);

    io.emit('licence_update');
    res.json({ success: true, message: 'Paramètres et coordonnées mis à jour avec succès.' });
  } catch (err) {
    res.status(500).json({ error: 'Erreur mise à jour configuration' });
  }
});

// 3. Prolonger licence
app.post('/api/licence/prolonger', (req, res) => {
  try {
    const { jours, super_pin } = req.body;
    if (!isSuperPinValid(super_pin)) {
      return res.status(403).json({ error: 'Super-PIN invalide.' });
    }

    const lic = db.prepare(`SELECT date_expiration FROM licence_config WHERE id = 1`).get() || {};
    let baseDate = lic.date_expiration ? new Date(lic.date_expiration) : new Date();
    const now = new Date();
    if (baseDate < now) baseDate = now;

    baseDate.setDate(baseDate.getDate() + (parseInt(jours, 10) || 30));
    db.prepare(`UPDATE licence_config SET date_expiration = ?, statut = 'actif' WHERE id = 1`).run(baseDate.toISOString());

    io.emit('licence_update');
    res.json({ success: true, nouvelle_date: baseDate.toISOString() });
  } catch (err) {
    res.status(500).json({ error: 'Erreur prolongation' });
  }
});

// 4. Modifier Super-PIN
app.put('/api/licence/super-pin', (req, res) => {
  try {
    const { old_pin, new_pin } = req.body;
    if (!isSuperPinValid(old_pin)) {
      return res.status(403).json({ error: 'Ancien Super-PIN incorrect.' });
    }
    const cleanNew = String(new_pin).trim();
    if (!cleanNew || cleanNew.length < 4 || ['9999', '1234', '5678', '0000'].includes(cleanNew)) {
      return res.status(400).json({ error: 'Le nouveau Super-PIN est invalide.' });
    }

    db.prepare(`UPDATE licence_config SET super_pin = ? WHERE id = 1`).run(cleanNew);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur modification Super-PIN' });
  }
});

// 5. Débloquer toutes les tables
app.post('/api/admin/master/reset-all-tables', (req, res) => {
  try {
    const { super_pin } = req.body;
    if (!isSuperPinValid(super_pin)) return res.status(403).json({ error: 'Super-PIN invalide.' });

    const nowIso = new Date().toISOString();
    db.prepare(`UPDATE commandes SET statut = 'annule', date_fin = ? WHERE statut NOT IN ('encaisse', 'annule')`).run(nowIso);
    io.emit('table_status_change');
    io.emit('statut_mis_a_jour');
    res.json({ success: true, message: 'Toutes les tables bloquées ont été libérées.' });
  } catch (err) {
    res.status(500).json({ error: 'Erreur reset tables' });
  }
});

// 6. Purge historique
app.post('/api/admin/master/purge-history', (req, res) => {
  try {
    const { super_pin } = req.body;
    if (!isSuperPinValid(super_pin)) return res.status(403).json({ error: 'Super-PIN invalide.' });

    db.prepare(`DELETE FROM commande_items`).run();
    db.prepare(`DELETE FROM commandes`).run();
    db.prepare(`DELETE FROM paiements`).run();
    io.emit('table_status_change');
    io.emit('statut_mis_a_jour');
    res.json({ success: true, message: 'Données purgées.' });
  } catch (err) {
    res.status(500).json({ error: 'Erreur purge' });
  }
});

// 7. Supprimer commande
app.delete('/api/admin/commandes/:id', (req, res) => {
  try {
    const { id } = req.params;
    db.prepare(`DELETE FROM commande_items WHERE commande_id = ?`).run(id);
    db.prepare(`DELETE FROM commandes WHERE id = ?`).run(id);
    io.emit('table_status_change');
    io.emit('statut_mis_a_jour');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur suppression commande' });
  }
});

// --- AUTHENTIFICATION PIN AVEC RÔLE EXPLICITE ---
app.post('/api/auth/pin', (req, res) => {
  try {
    const rawPin = req.body.pin ? String(req.body.pin).trim() : '';

    if (isSuperPinValid(rawPin)) {
      return res.json({ 
        success: true, 
        role: 'super_admin',
        isSuperAdmin: true,
        serveur: { id: 99999, nom: 'Support Éditeur (Super-Admin)' } 
      });
    }

    const serveur = db.prepare(`SELECT id, nom FROM serveurs WHERE pin = ?`).get(rawPin);
    if (serveur) {
      const isDir = serveur.nom.toLowerCase().includes('direction') || rawPin === '9999';
      return res.json({ 
        success: true, 
        role: isDir ? 'direction' : 'serveur',
        isSuperAdmin: false,
        serveur 
      });
    }

    return res.status(401).json({ success: false, error: 'Code PIN incorrect' });
  } catch (err) {
    res.status(500).json({ error: 'Erreur auth' });
  }
});

// Gestion équipe
app.get('/api/admin/serveurs', (req, res) => {
  try {
    res.json(db.prepare(`SELECT * FROM serveurs ORDER BY id ASC`).all());
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveurs' });
  }
});

app.post('/api/admin/serveurs', (req, res) => {
  try {
    const { nom, pin } = req.body;
    const info = db.prepare(`INSERT INTO serveurs (nom, pin) VALUES (?, ?)`).run(nom.trim(), pin.trim());
    res.status(201).json({ id: info.lastInsertRowid, nom: nom.trim(), pin: pin.trim() });
  } catch (err) {
    res.status(400).json({ error: 'Code PIN déjà attribué.' });
  }
});

app.delete('/api/admin/serveurs/:id', (req, res) => {
  try {
    db.prepare(`DELETE FROM serveurs WHERE id = ?`).run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur suppression' });
  }
});

app.put('/api/admin/serveurs/:id/pin', (req, res) => {
  try {
    const { id } = req.params;
    const { pin } = req.body;
    
    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      return res.status(400).json({ error: 'Le code PIN doit comporter exactement 4 chiffres.' });
    }

    const existing = db.prepare(`SELECT id, nom FROM serveurs WHERE pin = ? AND id != ?`).get(pin.trim(), id);
    if (existing) {
      return res.status(400).json({ error: `Ce code PIN est déjà utilisé par ${existing.nom}.` });
    }

    db.prepare(`UPDATE serveurs SET pin = ? WHERE id = ?`).run(pin.trim(), id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors de la modification du code PIN.' });
  }
});

// Plan de salle
app.get('/api/plan/zones-tables', (req, res) => {
  try {
    const zones = db.prepare(`SELECT * FROM zones ORDER BY id ASC`).all();
    const getTables = db.prepare(`SELECT * FROM tables_plan WHERE zone_id = ? ORDER BY numero ASC`);
    const result = zones.map(z => ({
      ...z,
      tables: getTables.all(z.id)
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Erreur plan' });
  }
});

app.post('/api/admin/zones', (req, res) => {
  try {
    const { nom } = req.body;
    if (!nom) return res.status(400).json({ error: 'Nom requis' });
    const info = db.prepare(`INSERT INTO zones (nom) VALUES (?)`).run(nom.trim());
    io.emit('plan_update');
    res.status(201).json({ id: info.lastInsertRowid, nom: nom.trim(), tables: [] });
  } catch (err) {
    res.status(500).json({ error: 'Erreur zone' });
  }
});

app.delete('/api/admin/zones/:id', (req, res) => {
  try {
    const { id } = req.params;
    db.prepare(`DELETE FROM tables_plan WHERE zone_id = ?`).run(id);
    db.prepare(`DELETE FROM zones WHERE id = ?`).run(id);
    io.emit('plan_update');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur zone' });
  }
});

app.post('/api/admin/tables', (req, res) => {
  try {
    const { zone_id, numero } = req.body;
    const tableNum = parseInt(numero, 10);
    if (!zone_id || isNaN(tableNum) || tableNum <= 0) {
      return res.status(400).json({ error: 'Numéro de table invalide' });
    }
    const info = db.prepare(`INSERT INTO tables_plan (zone_id, numero) VALUES (?, ?)`).run(zone_id, tableNum);
    io.emit('plan_update');
    io.emit('table_status_change');
    res.status(201).json({ id: info.lastInsertRowid, zone_id, numero: tableNum });
  } catch (err) {
    res.status(400).json({ error: `La Table ${req.body.numero} existe déjà.` });
  }
});

app.delete('/api/admin/tables/:id', (req, res) => {
  try {
    db.prepare(`DELETE FROM tables_plan WHERE id = ?`).run(req.params.id);
    io.emit('plan_update');
    io.emit('table_status_change');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur table' });
  }
});

// Statuts tables
app.get('/api/tables/statuts', (req, res) => {
  try {
    const allTables = db.prepare(`SELECT numero FROM tables_plan`).all();
    const activeOrders = db.prepare(`SELECT table_num, statut, serveur_nom FROM commandes WHERE statut NOT IN ('encaisse', 'annule') ORDER BY id DESC`).all();

    const statuts = {};
    allTables.forEach(t => { 
      statuts[t.numero] = { statut: 'libre', serveur: null }; 
    });

    activeOrders.forEach(ord => {
      const tNum = parseInt(ord.table_num, 10);
      if (!statuts[tNum] || statuts[tNum].statut === 'libre') {
        statuts[tNum] = {
          statut: ord.statut === 'servi' ? 'servi' : 'occupee',
          serveur: ord.serveur_nom || 'Salle'
        };
      } else if (ord.statut === 'servi') {
        statuts[tNum].statut = 'servi';
      }
    });

    res.json(statuts);
  } catch (err) {
    res.status(500).json({ error: 'Erreur statuts' });
  }
});

// Ruptures stock
app.get('/api/stock/indisponibles', (req, res) => {
  try {
    const rows = db.prepare(`SELECT article_id FROM articles_indisponibles`).all();
    res.json(rows.map(r => r.article_id));
  } catch (err) {
    res.status(500).json({ error: 'Erreur stock' });
  }
});

app.post('/api/stock/toggle', (req, res) => {
  try {
    const { article_id, article_nom } = req.body;
    const exists = db.prepare(`SELECT article_id FROM articles_indisponibles WHERE article_id = ?`).get(article_id);

    if (exists) {
      db.prepare(`DELETE FROM articles_indisponibles WHERE article_id = ?`).run(article_id);
    } else {
      db.prepare(`INSERT INTO articles_indisponibles (article_id, article_nom) VALUES (?, ?)`).run(article_id, article_nom || article_id);
    }

    const rows = db.prepare(`SELECT article_id FROM articles_indisponibles`).all();
    const indisponibles = rows.map(r => r.article_id);

    io.emit('stock_update', indisponibles);
    res.json({ success: true, indisponibles });
  } catch (err) {
    res.status(500).json({ error: 'Erreur stock' });
  }
});

// Commandes cuisine
app.get('/api/commandes', (req, res) => {
  try {
    const commandes = db.prepare(`SELECT * FROM commandes WHERE statut NOT IN ('servi', 'encaisse', 'annule') ORDER BY id DESC`).all();
    const getItems = db.prepare(`SELECT * FROM commande_items WHERE commande_id = ?`);
    res.json(commandes.map(cmd => ({ ...cmd, items: getItems.all(cmd.id) })));
  } catch (err) {
    res.status(500).json({ error: 'Erreur commandes' });
  }
});

// Addition
app.get('/api/tables/:table_num/addition', (req, res) => {
  try {
    const table_num = parseInt(req.params.table_num, 10);
    const commandes = db.prepare(`SELECT id, serveur_nom FROM commandes WHERE table_num = ? AND statut NOT IN ('encaisse', 'annule')`).all(table_num);

    if (commandes.length === 0) {
      return res.json({ table_num, items: [], total: 0, serveur_nom: 'Salle' });
    }

    const commandeIds = commandes.map(c => c.id);
    const getItems = db.prepare(`
      SELECT article_nom, prix, SUM(quantite) as quantite, (prix * SUM(quantite)) as total_ligne 
      FROM commande_items 
      WHERE commande_id IN (${commandeIds.join(',')})
      GROUP BY article_nom, prix
    `);

    const items = getItems.all();
    const total = items.reduce((acc, it) => acc + it.total_ligne, 0);

    res.json({
      table_num,
      items,
      serveur_nom: commandes[0].serveur_nom || 'Salle',
      total: parseFloat(total.toFixed(2)),
      total_ht: parseFloat((total / 1.10).toFixed(2)),
      tva: parseFloat((total - (total / 1.10)).toFixed(2))
    });
  } catch (err) {
    res.status(500).json({ error: 'Erreur addition' });
  }
});

// Créer commande
app.post('/api/commandes', (req, res) => {
  try {
    const { table_num, items, remarques, serveur_nom } = req.body;
    const tNum = parseInt(table_num, 10) || 1;
    const nowIso = new Date().toISOString();

    const insertCmd = db.prepare(`INSERT INTO commandes (table_num, statut, serveur_nom, remarques, date_creation) VALUES (?, 'en_attente', ?, ?, ?)`);
    const info = insertCmd.run(tNum, serveur_nom || 'Salle', remarques || '', nowIso);
    const commandeId = info.lastInsertRowid;

    const insertItem = db.prepare(`INSERT INTO commande_items (commande_id, article_nom, prix, quantite, remarques) VALUES (?, ?, ?, ?, ?)`);
    if (items && Array.isArray(items)) {
      items.forEach(it => {
        insertItem.run(commandeId, it.article_nom || it.nom || 'Article', it.prix || 0, it.quantite || 1, it.remarques || '');
      });
    }

    const completeOrder = {
      id: commandeId,
      table_num: tNum,
      statut: 'en_attente',
      serveur_nom: serveur_nom || 'Salle',
      remarques: remarques || '',
      date_creation: nowIso,
      items: db.prepare(`SELECT * FROM commande_items WHERE commande_id = ?`).all(commandeId)
    };

    io.emit('nouvelle_commande', completeOrder);
    io.emit('table_status_change');
    res.status(201).json(completeOrder);
  } catch (err) {
    res.status(500).json({ error: 'Erreur création' });
  }
});

// Encaisser Table
app.post('/api/tables/:table_num/encaisser', (req, res) => {
  try {
    const table_num = parseInt(req.params.table_num, 10);
    const { paiements, mode_paiement, remise_montant, pourboire, total_paye, serveur_nom, numero_chambre, nom_client_chambre } = req.body;
    const nowIso = new Date().toISOString();

    const tipAmount = parseFloat(pourboire) || 0;
    const discountAmount = parseFloat(remise_montant) || 0;
    const netPaye = parseFloat(total_paye) || 0;
    const sNom = serveur_nom || 'Salle';

    let numChambre = numero_chambre ? String(numero_chambre).trim() : null;
    let nomClient = nom_client_chambre ? String(nom_client_chambre).trim() : null;

    let paiementsList = [];
    if (paiements && Array.isArray(paiements) && paiements.length > 0) {
      paiementsList = paiements;
      const chPay = paiementsList.find(p => (p.mode && p.mode.includes('Chambre')) || p.numero_chambre);
      if (chPay) {
        if (!numChambre && chPay.numero_chambre) numChambre = String(chPay.numero_chambre).trim();
        if (!nomClient && chPay.nom_client) nomClient = String(chPay.nom_client).trim();
      }
    } else {
      paiementsList = [{ 
        mode: mode_paiement || 'CB', 
        montant: netPaye,
        numero_chambre: numChambre,
        nom_client: nomClient
      }];
    }

    const modeResume = paiementsList.length === 1 
      ? paiementsList[0].mode 
      : 'Panaché (' + paiementsList.map(p => `${p.mode}: ${p.montant.toFixed(2)}€`).join(', ') + ')';

    const paiementsJson = JSON.stringify(paiementsList);

    const insertPaiement = db.prepare(`
      INSERT INTO paiements (table_num, serveur_nom, mode_paiement, montant, pourboire, numero_chambre, nom_client_chambre, date_paiement) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    paiementsList.forEach((p, index) => {
      const pTip = (index === 0) ? tipAmount : 0;
      const pChambre = p.numero_chambre || numChambre;
      const pNom = p.nom_client || nomClient;
      insertPaiement.run(table_num, sNom, p.mode || 'CB', p.montant || 0, pTip, pChambre, pNom, nowIso);
    });

    const update = db.prepare(`
      UPDATE commandes 
      SET statut = 'encaisse', mode_paiement = ?, remise_montant = ?, pourboire = ?, total_paye = ?, numero_chambre = ?, nom_client_chambre = ?, paiements_details = ?, serveur_nom = COALESCE(?, serveur_nom), date_fin = ? 
      WHERE table_num = ? AND statut NOT IN ('encaisse', 'annule')
    `);
    update.run(modeResume, discountAmount, tipAmount, netPaye, numChambre, nomClient, paiementsJson, sNom, nowIso, table_num);

    io.emit('table_status_change');
    io.emit('statut_mis_a_jour');
    res.json({ success: true, modeResume, total_paye: netPaye, pourboire: tipAmount, numero_chambre: numChambre });
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors de l\'encaissement.' });
  }
});

// Forcer libération
app.post('/api/tables/:table_num/reset', (req, res) => {
  try {
    const table_num = parseInt(req.params.table_num, 10);
    const nowIso = new Date().toISOString();
    db.prepare(`UPDATE commandes SET statut = 'annule', date_fin = ? WHERE table_num = ? AND statut NOT IN ('encaisse', 'annule')`).run(nowIso, table_num);
    io.emit('table_status_change');
    io.emit('statut_mis_a_jour');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur reset table' });
  }
});

// Transfert & Fusion
app.post('/api/tables/:table_num/transfer', (req, res) => {
  try {
    const sourceTable = parseInt(req.params.table_num, 10);
    const targetTable = parseInt(req.body.target_table, 10);
    const serveurNom = req.body.serveur_nom || 'Salle';

    if (!targetTable || isNaN(targetTable) || sourceTable === targetTable) {
      return res.status(400).json({ error: 'Table de destination invalide.' });
    }

    const activeOrders = db.prepare(`SELECT id FROM commandes WHERE table_num = ? AND statut NOT IN ('encaisse', 'annule')`).all(sourceTable);
    if (activeOrders.length === 0) {
      return res.status(400).json({ error: `La Table ${sourceTable} n'a aucune commande active à transférer.` });
    }

    db.prepare(`
      UPDATE commandes 
      SET table_num = ?, serveur_nom = ? 
      WHERE table_num = ? AND statut NOT IN ('encaisse', 'annule')
    `).run(targetTable, serveurNom, sourceTable);

    io.emit('table_status_change');
    io.emit('statut_mis_a_jour');

    res.json({ success: true, message: `Table ${sourceTable} transférée/fusionnée vers Table ${targetTable}` });
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors du transfert de table.' });
  }
});

// Réclamer suite
app.post('/api/tables/:table_num/suite', (req, res) => {
  try {
    const table_num = parseInt(req.params.table_num, 10);
    const { course, serveur_nom } = req.body;
    const nowIso = new Date().toISOString();

    const activeOrders = db.prepare(`SELECT id FROM commandes WHERE table_num = ? AND statut NOT IN ('encaisse', 'annule')`).all(table_num);
    if (activeOrders.length === 0) {
      return res.status(400).json({ error: `Aucune commande en cours sur la Table ${table_num}.` });
    }

    const suiteData = {
      table_num,
      course: course || 'Plats',
      serveur_nom: serveur_nom || 'Salle',
      timestamp: nowIso
    };

    io.emit('reclamer_suite', suiteData);
    res.json({ success: true, message: `Suite (${suiteData.course}) réclamée pour la Table ${table_num}` });
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors de la réclamation de la suite.' });
  }
});

// Statut commande
app.put('/api/commandes/:id/statut', (req, res) => {
  try {
    const { id } = req.params;
    const { statut } = req.body;
    const nowIso = new Date().toISOString();

    if (statut === 'servi') {
      db.prepare(`UPDATE commandes SET statut = ?, date_fin = ? WHERE id = ?`).run(statut, nowIso, id);
    } else {
      db.prepare(`UPDATE commandes SET statut = ? WHERE id = ?`).run(statut, id);
    }

    io.emit('statut_mis_a_jour', { id, statut });
    io.emit('table_status_change');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur statut' });
  }
});

// Admin historique & paiements
app.get('/api/admin/commandes', (req, res) => {
  try {
    const commandes = db.prepare(`SELECT * FROM commandes ORDER BY id DESC`).all();
    const getItems = db.prepare(`SELECT * FROM commande_items WHERE commande_id = ?`);
    res.json(commandes.map(cmd => ({ ...cmd, items: getItems.all(cmd.id) })));
  } catch (err) {
    res.status(500).json({ error: 'Erreur admin' });
  }
});

app.get('/api/admin/paiements', (req, res) => {
  try {
    res.json(db.prepare(`SELECT * FROM paiements ORDER BY id DESC`).all());
  } catch (err) {
    res.status(500).json({ error: 'Erreur paiements' });
  }
});

app.get('/api/admin/notes-chambres', (req, res) => {
  try {
    const commandes = db.prepare(`
      SELECT * FROM commandes 
      WHERE statut = 'encaisse' AND (
        (numero_chambre IS NOT NULL AND numero_chambre != '') 
        OR mode_paiement LIKE '%Chambre%'
        OR paiements_details LIKE '%Chambre%'
      )
      ORDER BY id DESC
    `).all();

    const getItems = db.prepare(`SELECT * FROM commande_items WHERE commande_id = ?`);
    res.json(commandes.map(cmd => ({ ...cmd, items: getItems.all(cmd.id) })));
  } catch (err) {
    res.status(500).json({ error: 'Erreur notes de chambres' });
  }
});

// Backup SQLite
app.get('/api/admin/backup-db', (req, res) => {
  const dbPath = path.join(__dirname, 'restaurant.db');
  res.download(dbPath, `backup_restaurant_${new Date().toISOString().slice(0,10)}.db`);
});

// Socket.io
io.on('connection', (socket) => {
  socket.on('changer_statut', (data) => {
    io.emit('statut_mis_a_jour', data);
    io.emit('table_status_change');
  });
});

server.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});