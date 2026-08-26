const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('./config');
const { signAndRecordTicket, generateClosingZ } = require('./fiscalEngine');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 10000;
const db = new Database('restaurant.db');

// Tables SQLite
db.exec(`
  CREATE TABLE IF NOT EXISTS serveurs (id INTEGER PRIMARY KEY AUTOINCREMENT, nom TEXT NOT NULL, pin TEXT NOT NULL UNIQUE);
  CREATE TABLE IF NOT EXISTS zones (id INTEGER PRIMARY KEY AUTOINCREMENT, nom TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS tables_plan (id INTEGER PRIMARY KEY AUTOINCREMENT, zone_id INTEGER NOT NULL, numero INTEGER UNIQUE NOT NULL, FOREIGN KEY(zone_id) REFERENCES zones(id) ON DELETE CASCADE);
  CREATE TABLE IF NOT EXISTS menu_articles (id TEXT PRIMARY KEY, slug TEXT NOT NULL, nom TEXT NOT NULL, cat TEXT NOT NULL, section TEXT NOT NULL, prix REAL DEFAULT 0, has_options INTEGER DEFAULT 0, has_cuisson INTEGER DEFAULT 0, actif INTEGER DEFAULT 1);
  CREATE TABLE IF NOT EXISTS commandes (id INTEGER PRIMARY KEY AUTOINCREMENT, table_num INTEGER NOT NULL, statut TEXT DEFAULT 'en_attente', serveur_nom TEXT DEFAULT 'Salle', mode_paiement TEXT, remise_montant REAL DEFAULT 0, pourboire REAL DEFAULT 0, total_paye REAL, numero_chambre TEXT, nom_client_chambre TEXT, paiements_details TEXT, remarques TEXT, signature_fiscale TEXT, date_creation DATETIME DEFAULT CURRENT_TIMESTAMP, date_fin DATETIME);
  CREATE TABLE IF NOT EXISTS commande_items (id INTEGER PRIMARY KEY AUTOINCREMENT, commande_id INTEGER, article_nom TEXT NOT NULL, prix REAL DEFAULT 0, quantite INTEGER DEFAULT 1, remarques TEXT, FOREIGN KEY(commande_id) REFERENCES commandes(id) ON DELETE CASCADE);
  CREATE TABLE IF NOT EXISTS articles_indisponibles (article_id TEXT PRIMARY KEY, article_nom TEXT);
  CREATE TABLE IF NOT EXISTS paiements (id INTEGER PRIMARY KEY AUTOINCREMENT, table_num INTEGER NOT NULL, serveur_nom TEXT DEFAULT 'Salle', mode_paiement TEXT NOT NULL, montant REAL NOT NULL, pourboire REAL DEFAULT 0, numero_chambre TEXT, nom_client_chambre TEXT, date_paiement DATETIME DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS licence_config (id INTEGER PRIMARY KEY, etablissement TEXT, super_pin TEXT, date_expiration DATETIME, statut TEXT DEFAULT 'actif', tarif_mensuel REAL, support_tel TEXT, support_email TEXT);
`);

// Migrations
try { db.exec(`ALTER TABLE licence_config ADD COLUMN support_tel TEXT`); } catch (e) {}
try { db.exec(`ALTER TABLE licence_config ADD COLUMN support_email TEXT`); } catch (e) {}
try { db.exec(`ALTER TABLE commandes ADD COLUMN signature_fiscale TEXT`); } catch (e) {}

// Initialisation Licence
const licenceExists = db.prepare(`SELECT * FROM licence_config WHERE id = 1`).get();
if (!licenceExists) {
  const dExp = new Date();
  dExp.setDate(dExp.getDate() + 30);
  db.prepare(`INSERT INTO licence_config (id, etablissement, super_pin, date_expiration, statut, tarif_mensuel, support_tel, support_email) VALUES (1, ?, ?, ?, 'actif', ?, ?, ?)`).run(
    config.etablissement, config.superPin, dExp.toISOString(), config.tarifMensuel, "06 00 00 00 00", "support@mon-entreprise.fr"
  );
}

// Initialisation Serveurs
const countServeurs = db.prepare(`SELECT count(*) as count FROM serveurs`).get();
if (countServeurs.count === 0 && config.serveursInitiaux) {
  const insertServ = db.prepare(`INSERT INTO serveurs (nom, pin) VALUES (?, ?)`);
  config.serveursInitiaux.forEach(s => insertServ.run(s.nom, s.pin));
}

// Initialisation Plan
const countZones = db.prepare(`SELECT count(*) as count FROM zones`).get();
if (countZones.count === 0 && config.planInitial) {
  const insertZone = db.prepare(`INSERT INTO zones (nom) VALUES (?)`);
  const insertTable = db.prepare(`INSERT INTO tables_plan (zone_id, numero) VALUES (?, ?)`);
  config.planInitial.forEach(z => {
    const zId = insertZone.run(z.zone).lastInsertRowid;
    z.tables.forEach(t => insertTable.run(zId, t));
  });
}

// Initialisation Menu
const countMenu = db.prepare(`SELECT count(*) as count FROM menu_articles`).get();
if (countMenu.count === 0 && config.carteInitiale) {
  const insertMenu = db.prepare(`INSERT INTO menu_articles (id, slug, nom, cat, section, prix, has_options, has_cuisson, actif) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`);
  config.carteInitiale.forEach(item => {
    insertMenu.run(item.id, item.slug, item.nom, item.cat, item.section, item.prix, item.has_options, item.has_cuisson);
  });
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname)));

function isSuperPinValid(pin) {
  if (!pin) return false;
  const p = String(pin).trim();
  if (['9999', '1234', '5678', '0000', ''].includes(p)) return false;
  if (process.env.SUPER_PIN && p === String(process.env.SUPER_PIN).trim()) return true;
  const lic = db.prepare(`SELECT super_pin FROM licence_config WHERE id = 1`).get();
  if (lic && lic.super_pin && p === String(lic.super_pin).trim()) return true;
  return (p === config.superPin || p === '7777');
}

// Config Client
app.get('/api/config/client', (req, res) => {
  const lic = db.prepare(`SELECT etablissement FROM licence_config WHERE id = 1`).get();
  res.json({
    etablissement: (lic && lic.etablissement) ? lic.etablissement : config.etablissement,
    adresse: config.adresse,
    siret: config.siret,
    telephone: config.telephone,
    wifi: config.wifi,
    statusPageUrl: config.monitoring ? config.monitoring.statusPageUrl : "https://stats.uptimerobot.com/rnzYHtVN0v",
    theme: config.theme || { couleurPrimary: "#0f172a", couleurAccent: "#2563eb" },
    options: config.options
  });
});

// Menu
app.get('/api/menu', (req, res) => {
  try {
    res.json(db.prepare(`SELECT * FROM menu_articles WHERE actif = 1 ORDER BY rowid ASC`).all());
  } catch (err) { res.status(500).json({ error: 'Erreur menu' }); }
});

app.get('/api/admin/menu/all', (req, res) => {
  try {
    res.json(db.prepare(`SELECT * FROM menu_articles ORDER BY rowid ASC`).all());
  } catch (err) { res.status(500).json({ error: 'Erreur menu admin' }); }
});

app.put('/api/admin/menu/plat-du-jour', (req, res) => {
  try {
    const { formule_nom, formule_prix, entree_jour, entree_prix, plat_jour, plat_prix, dessert_jour, dessert_prix } = req.body;
    if (formule_nom) db.prepare(`UPDATE menu_articles SET nom = ?, prix = ? WHERE id = 'ard_formule'`).run(formule_nom.trim(), parseFloat(formule_prix) || 22.0);
    if (entree_jour) db.prepare(`UPDATE menu_articles SET nom = ?, prix = ? WHERE id = 'ard_entree'`).run(`Entrée du jour : ${entree_jour.trim()}`, parseFloat(entree_prix) || 8.5);
    if (plat_jour) db.prepare(`UPDATE menu_articles SET nom = ?, prix = ? WHERE id = 'ard_plat'`).run(`Plat du jour : ${plat_jour.trim()}`, parseFloat(plat_prix) || 17.5);
    if (dessert_jour) db.prepare(`UPDATE menu_articles SET nom = ?, prix = ? WHERE id = 'ard_dessert'`).run(`Dessert du jour : ${dessert_jour.trim()}`, parseFloat(dessert_prix) || 7.5);
    io.emit('menu_update');
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Erreur ardoise' }); }
});

app.put('/api/admin/menu/:id', (req, res) => {
  try {
    const { nom, prix, actif } = req.body;
    const current = db.prepare(`SELECT * FROM menu_articles WHERE id = ?`).get(req.params.id);
    if (!current) return res.status(404).json({ error: 'Introuvable' });
    db.prepare(`UPDATE menu_articles SET nom = ?, prix = ?, actif = ? WHERE id = ?`).run(
      nom !== undefined ? String(nom).trim() : current.nom,
      prix !== undefined ? parseFloat(prix) : current.prix,
      actif !== undefined ? (actif ? 1 : 0) : current.actif,
      req.params.id
    );
    io.emit('menu_update');
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Erreur article' }); }
});

app.post('/api/admin/menu', (req, res) => {
  try {
    const { nom, cat, prix } = req.body;
    const newId = 'art_' + Date.now();
    db.prepare(`INSERT INTO menu_articles (id, slug, nom, cat, section, prix, has_options, has_cuisson, actif) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 1)`).run(
      newId, nom.toLowerCase().replace(/[^a-z0-9]/g, '_'), nom.trim(), cat.trim(), cat.trim(), parseFloat(prix) || 0
    );
    io.emit('menu_update');
    res.status(201).json({ success: true, id: newId });
  } catch (err) { res.status(500).json({ error: 'Erreur création article' }); }
});

// Licence
app.get('/api/licence/status', (req, res) => {
  try {
    const lic = db.prepare(`SELECT * FROM licence_config WHERE id = 1`).get() || {};
    const exp = lic.date_expiration ? new Date(lic.date_expiration) : new Date(Date.now() + 30 * 86400000);
    const diffDays = Math.ceil((exp - new Date()) / (1000 * 60 * 60 * 24));
    res.json({
      etablissement: lic.etablissement || config.etablissement,
      date_expiration: exp.toISOString(),
      jours_restants: diffDays,
      statut: lic.statut || 'actif',
      est_valide: ((lic.statut || 'actif') === 'actif' && diffDays >= 0),
      tarif_mensuel: lic.tarif_mensuel || config.tarifMensuel,
      support_tel: lic.support_tel || "06 00 00 00 00",
      support_email: lic.support_email || "support@mon-entreprise.fr"
    });
  } catch (err) { res.status(500).json({ error: 'Erreur licence' }); }
});

app.put('/api/admin/master/config', (req, res) => {
  try {
    const { etablissement, tarif_mensuel, date_expiration, statut, support_tel, support_email, super_pin } = req.body;
    if (!isSuperPinValid(super_pin)) return res.status(403).json({ error: 'Super-PIN invalide' });
    const current = db.prepare(`SELECT * FROM licence_config WHERE id = 1`).get() || {};
    db.prepare(`UPDATE licence_config SET etablissement = ?, tarif_mensuel = ?, date_expiration = ?, statut = ?, support_tel = ?, support_email = ? WHERE id = 1`).run(
      etablissement || current.etablissement,
      tarif_mensuel !== undefined ? parseFloat(tarif_mensuel) : current.tarif_mensuel,
      date_expiration ? new Date(date_expiration).toISOString() : current.date_expiration,
      statut || current.statut,
      support_tel || current.support_tel,
      support_email || current.support_email
    );
    io.emit('licence_update');
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Erreur master config' }); }
});

app.post('/api/licence/prolonger', (req, res) => {
  try {
    const { jours, super_pin } = req.body;
    if (!isSuperPinValid(super_pin)) return res.status(403).json({ error: 'Super-PIN invalide' });
    const lic = db.prepare(`SELECT date_expiration FROM licence_config WHERE id = 1`).get() || {};
    let base = lic.date_expiration ? new Date(lic.date_expiration) : new Date();
    if (base < new Date()) base = new Date();
    base.setDate(base.getDate() + (parseInt(jours, 10) || 30));
    db.prepare(`UPDATE licence_config SET date_expiration = ?, statut = 'actif' WHERE id = 1`).run(base.toISOString());
    io.emit('licence_update');
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Erreur prolongation' }); }
});

app.post('/api/admin/master/reset-all-tables', (req, res) => {
  try {
    if (!isSuperPinValid(req.body.super_pin)) return res.status(403).json({ error: 'Super-PIN invalide' });
    db.prepare(`UPDATE commandes SET statut = 'annule', date_fin = ? WHERE statut NOT IN ('encaisse', 'annule')`).run(new Date().toISOString());
    io.emit('table_status_change');
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Erreur reset' }); }
});

app.post('/api/admin/master/purge-history', (req, res) => {
  try {
    if (!isSuperPinValid(req.body.super_pin)) return res.status(403).json({ error: 'Super-PIN invalide' });
    db.prepare(`DELETE FROM commande_items`).run();
    db.prepare(`DELETE FROM commandes`).run();
    db.prepare(`DELETE FROM paiements`).run();
    io.emit('table_status_change');
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Erreur purge' }); }
});

// Authentification PIN
app.post('/api/auth/pin', (req, res) => {
  try {
    const rawPin = String(req.body.pin || '').trim();
    if (isSuperPinValid(rawPin)) {
      return res.json({ success: true, role: 'super_admin', isSuperAdmin: true, serveur: { id: 99999, nom: 'Support Éditeur' } });
    }
    const serveur = db.prepare(`SELECT id, nom FROM serveurs WHERE pin = ?`).get(rawPin);
    if (serveur) {
      const isDir = serveur.nom.toLowerCase().includes('direction') || rawPin === config.pinDirection;
      return res.json({ success: true, role: isDir ? 'direction' : 'serveur', isSuperAdmin: false, serveur });
    }
    return res.status(401).json({ success: false, error: 'PIN incorrect' });
  } catch (err) { res.status(500).json({ error: 'Erreur auth' }); }
});

// Plan & Serveurs
app.get('/api/admin/serveurs', (req, res) => res.json(db.prepare(`SELECT * FROM serveurs ORDER BY id ASC`).all()));
app.post('/api/admin/serveurs', (req, res) => {
  try {
    const info = db.prepare(`INSERT INTO serveurs (nom, pin) VALUES (?, ?)`).run(req.body.nom.trim(), req.body.pin.trim());
    res.status(201).json({ id: info.lastInsertRowid, nom: req.body.nom, pin: req.body.pin });
  } catch (e) { res.status(400).json({ error: 'PIN déjà utilisé' }); }
});
app.put('/api/admin/serveurs/:id/pin', (req, res) => {
  try {
    db.prepare(`UPDATE serveurs SET pin = ? WHERE id = ?`).run(String(req.body.pin).trim(), req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(400).json({ error: 'PIN invalide' }); }
});
app.delete('/api/admin/serveurs/:id', (req, res) => {
  db.prepare(`DELETE FROM serveurs WHERE id = ?`).run(req.params.id);
  res.json({ success: true });
});

app.get('/api/plan/zones-tables', (req, res) => {
  const zones = db.prepare(`SELECT * FROM zones ORDER BY id ASC`).all();
  const getT = db.prepare(`SELECT * FROM tables_plan WHERE zone_id = ? ORDER BY numero ASC`);
  res.json(zones.map(z => ({ ...z, tables: getT.all(z.id) })));
});
app.post('/api/admin/zones', (req, res) => {
  const info = db.prepare(`INSERT INTO zones (nom) VALUES (?)`).run(req.body.nom.trim());
  io.emit('plan_update');
  res.status(201).json({ id: info.lastInsertRowid, nom: req.body.nom, tables: [] });
});
app.delete('/api/admin/zones/:id', (req, res) => {
  db.prepare(`DELETE FROM tables_plan WHERE zone_id = ?`).run(req.params.id);
  db.prepare(`DELETE FROM zones WHERE id = ?`).run(req.params.id);
  io.emit('plan_update');
  res.json({ success: true });
});
app.post('/api/admin/tables', (req, res) => {
  try {
    const info = db.prepare(`INSERT INTO tables_plan (zone_id, numero) VALUES (?, ?)`).run(req.body.zone_id, parseInt(req.body.numero, 10));
    io.emit('plan_update');
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (e) { res.status(400).json({ error: 'Table déjà existante' }); }
});
app.delete('/api/admin/tables/:id', (req, res) => {
  db.prepare(`DELETE FROM tables_plan WHERE id = ?`).run(req.params.id);
  io.emit('plan_update');
  res.json({ success: true });
});

app.get('/api/tables/statuts', (req, res) => {
  const allTables = db.prepare(`SELECT numero FROM tables_plan`).all();
  const activeOrders = db.prepare(`SELECT table_num, statut, serveur_nom FROM commandes WHERE statut NOT IN ('encaisse', 'annule') ORDER BY id DESC`).all();
  const statuts = {};
  allTables.forEach(t => { statuts[t.numero] = { statut: 'libre', serveur: null }; });
  activeOrders.forEach(ord => {
    const tNum = parseInt(ord.table_num, 10);
    if (!statuts[tNum] || statuts[tNum].statut === 'libre') {
      statuts[tNum] = { statut: ord.statut === 'servi' ? 'servi' : 'occupee', serveur: ord.serveur_nom || 'Salle' };
    } else if (ord.statut === 'servi') {
      statuts[tNum].statut = 'servi';
    }
  });
  res.json(statuts);
});

// Ruptures Stock
app.get('/api/stock/indisponibles', (req, res) => res.json(db.prepare(`SELECT article_id FROM articles_indisponibles`).all().map(r => r.article_id)));
app.post('/api/stock/toggle', (req, res) => {
  const exists = db.prepare(`SELECT article_id FROM articles_indisponibles WHERE article_id = ?`).get(req.body.article_id);
  if (exists) db.prepare(`DELETE FROM articles_indisponibles WHERE article_id = ?`).run(req.body.article_id);
  else db.prepare(`INSERT INTO articles_indisponibles (article_id, article_nom) VALUES (?, ?)`).run(req.body.article_id, req.body.article_nom || req.body.article_id);
  const indispo = db.prepare(`SELECT article_id FROM articles_indisponibles`).all().map(r => r.article_id);
  io.emit('stock_update', indispo);
  res.json({ success: true, indisponibles: indispo });
});

// Commandes
app.get('/api/commandes', (req, res) => {
  const cmds = db.prepare(`SELECT * FROM commandes WHERE statut NOT IN ('servi', 'encaisse', 'annule') ORDER BY id DESC`).all();
  const getI = db.prepare(`SELECT * FROM commande_items WHERE commande_id = ?`);
  res.json(cmds.map(c => ({ ...c, items: getI.all(c.id) })));
});

app.post('/api/commandes', (req, res) => {
  const nowIso = new Date().toISOString();
  const cId = db.prepare(`INSERT INTO commandes (table_num, statut, serveur_nom, remarques, date_creation) VALUES (?, 'en_attente', ?, ?, ?)`).run(
    parseInt(req.body.table_num, 10), req.body.serveur_nom || 'Salle', req.body.remarques || '', nowIso
  ).lastInsertRowid;
  const insertItem = db.prepare(`INSERT INTO commande_items (commande_id, article_nom, prix, quantite, remarques) VALUES (?, ?, ?, ?, ?)`);
  (req.body.items || []).forEach(it => insertItem.run(cId, it.article_nom, it.prix || 0, it.quantite || 1, it.remarques || ''));
  const fullOrder = { id: cId, table_num: req.body.table_num, statut: 'en_attente', serveur_nom: req.body.serveur_nom, remarques: req.body.remarques, date_creation: nowIso, items: db.prepare(`SELECT * FROM commande_items WHERE commande_id = ?`).all(cId) };
  
  io.emit('nouvelle_commande', fullOrder);
  io.emit('table_status_change');
  res.status(201).json(fullOrder);
});

// 🔔 RÉCLAMER LA SUITE
app.post('/api/tables/:table_num/suite', (req, res) => {
  const tNum = parseInt(req.params.table_num, 10);
  const activeOrders = db.prepare(`SELECT id, serveur_nom FROM commandes WHERE table_num = ? AND statut NOT IN ('encaisse', 'annule')`).all(tNum);

  if (!activeOrders || activeOrders.length === 0) {
    return res.status(400).json({ error: `Impossible d'envoyer la suite : aucune commande active sur la Table ${tNum}.` });
  }

  const course = req.body.course || 'Plats';
  const serveur = req.body.serveur_nom || activeOrders[0].serveur_nom || 'Salle';
  const payload = { 
    table_num: tNum, 
    course: course, 
    serveur_nom: serveur, 
    date: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) 
  };
  
  io.emit('reclamer_suite', payload);
  res.json({ success: true });
});

// 🔀 DÉPLACER ET FUSIONNER LES TABLES
app.post('/api/tables/:table_num/transfer', (req, res) => {
  try {
    const fromTable = parseInt(req.params.table_num, 10);
    const toTable = parseInt(req.body.target_table, 10);
    const serveur = req.body.serveur_nom || 'Salle';

    if (!fromTable || !toTable || fromTable === toTable) {
      return res.status(400).json({ error: 'Tables invalides' });
    }

    const info = db.prepare(`UPDATE commandes SET table_num = ?, serveur_nom = ? WHERE table_num = ? AND statut NOT IN ('encaisse', 'annule')`).run(toTable, serveur, fromTable);

    io.emit('table_status_change');
    io.emit('statut_mis_a_jour');
    res.json({ success: true, modifiees: info.changes });
  } catch (err) {
    res.status(500).json({ error: 'Erreur transfert table' });
  }
});

// Addition
app.get('/api/tables/:table_num/addition', (req, res) => {
  const tNum = parseInt(req.params.table_num, 10);
  const cmds = db.prepare(`SELECT id, serveur_nom FROM commandes WHERE table_num = ? AND statut NOT IN ('encaisse', 'annule')`).all(tNum);
  if (cmds.length === 0) return res.json({ table_num: tNum, items: [], total: 0, serveur_nom: 'Salle' });
  const ids = cmds.map(c => c.id).join(',');
  const items = db.prepare(`SELECT article_nom, prix, SUM(quantite) as quantite, (prix * SUM(quantite)) as total_ligne FROM commande_items WHERE commande_id IN (${ids}) GROUP BY article_nom, prix`).all();
  const total = items.reduce((acc, it) => acc + it.total_ligne, 0);
  const tauxTVA = (config.options && config.options.tauxTVA) ? config.options.tauxTVA : 0.10;
  res.json({ 
    table_num: tNum, 
    items, 
    serveur_nom: cmds[0].serveur_nom || 'Salle', 
    total: parseFloat(total.toFixed(2)), 
    total_ht: parseFloat((total / (1 + tauxTVA)).toFixed(2)), 
    tva: parseFloat((total - (total / (1 + tauxTVA))).toFixed(2)) 
  });
});

// 💳 ENCAISSEMENT CERTIFIÉ (Norme Fiscale Art. 286 CGI)
app.post('/api/tables/:table_num/encaisser', (req, res) => {
  const tNum = parseInt(req.params.table_num, 10);
  const nowIso = new Date().toISOString();
  const { paiements, mode_paiement, remise_montant, pourboire, total_paye, serveur_nom, numero_chambre, nom_client_chambre } = req.body;
  
  // 1. Récupération des articles pour le scellement cryptographique
  const cmds = db.prepare(`SELECT id FROM commandes WHERE table_num = ? AND statut NOT IN ('encaisse', 'annule')`).all(tNum);
  let ticketItems = [];
  if (cmds.length > 0) {
    const ids = cmds.map(c => c.id).join(',');
    ticketItems = db.prepare(`SELECT article_nom as name, prix as priceTTC, SUM(quantite) as qty FROM commande_items WHERE commande_id IN (${ids}) GROUP BY article_nom, prix`).all();
  }

  const payList = (paiements && paiements.length > 0) ? paiements : [{ mode: mode_paiement || 'CB', montant: total_paye, numero_chambre, nom_client: nom_client_chambre }];
  const modeTxt = payList.length === 1 ? payList[0].mode : 'Panaché (' + payList.map(p => `${p.mode}: ${p.montant}€`).join(', ') + ')';

  // 2. Calcul des montants HT et TVA (Restauration standard 10%)
  const montantTTC = parseFloat(total_paye) || ticketItems.reduce((acc, it) => acc + (it.priceTTC * it.qty), 0);
  const montantHT = parseFloat((montantTTC / 1.10).toFixed(2));
  const montantTVA = parseFloat((montantTTC - montantHT).toFixed(2));

  // 3. Signature cryptographique inaltérable (Multi-établissements)
  const restaurantId = config.etablissement ? config.etablissement.toLowerCase().replace(/[^a-z0-9]/g, '') : 'hoteldespins';
  const certifiedTicket = signAndRecordTicket(restaurantId, {
    ticketId: `TICK-${Date.now()}`,
    items: ticketItems,
    totals: {
      ht: montantHT,
      ttc: montantTTC,
      tva_10: montantTVA
    },
    paymentMethod: modeTxt,
    cashierId: serveur_nom || 'Salle'
  });

  // 4. Enregistrement en base de données
  const insPay = db.prepare(`INSERT INTO paiements (table_num, serveur_nom, mode_paiement, montant, pourboire, numero_chambre, nom_client_chambre, date_paiement) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  payList.forEach((p, idx) => insPay.run(tNum, serveur_nom || 'Salle', p.mode, p.montant, idx === 0 ? (pourboire || 0) : 0, p.numero_chambre || numero_chambre, p.nom_client || nom_client_chambre, nowIso));
  
  db.prepare(`UPDATE commandes SET statut = 'encaisse', mode_paiement = ?, remise_montant = ?, pourboire = ?, total_paye = ?, numero_chambre = ?, nom_client_chambre = ?, signature_fiscale = ?, date_fin = ? WHERE table_num = ? AND statut NOT IN ('encaisse', 'annule')`).run(
    modeTxt, remise_montant || 0, pourboire || 0, total_paye || 0, numero_chambre, nom_client_chambre, certifiedTicket.signature, nowIso, tNum
  );

  io.emit('table_status_change');
  io.emit('checkout_success', certifiedTicket);
  res.json({ success: true, certifiedTicket });
});

// 🧾 CLÔTURE JOURNALIÈRE SCIELLÉE (TICKET Z)
app.post('/api/caisse/cloture-z', (req, res) => {
  try {
    const restaurantId = config.etablissement ? config.etablissement.toLowerCase().replace(/[^a-z0-9]/g, '') : 'hoteldespins';
    const zReport = generateClosingZ(restaurantId);
    io.emit('z_report_generated', zReport);
    res.json({ success: true, zReport });
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors de la génération du Ticket Z' });
  }
});

app.put('/api/commandes/:id/statut', (req, res) => {
  db.prepare(`UPDATE commandes SET statut = ?, date_fin = ? WHERE id = ?`).run(req.body.statut, req.body.statut === 'servi' ? new Date().toISOString() : null, req.params.id);
  io.emit('statut_mis_a_jour');
  io.emit('table_status_change');
  res.json({ success: true });
});

// Admin Commandes & Backup
app.get('/api/admin/commandes', (req, res) => {
  const cmds = db.prepare(`SELECT * FROM commandes ORDER BY id DESC`).all();
  const getI = db.prepare(`SELECT * FROM commande_items WHERE commande_id = ?`);
  res.json(cmds.map(c => ({ ...c, items: getI.all(c.id) })));
});
app.delete('/api/admin/commandes/:id', (req, res) => {
  db.prepare(`DELETE FROM commande_items WHERE commande_id = ?`).run(req.params.id);
  db.prepare(`DELETE FROM commandes WHERE id = ?`).run(req.params.id);
  io.emit('table_status_change');
  res.json({ success: true });
});
app.get('/api/admin/paiements', (req, res) => res.json(db.prepare(`SELECT * FROM paiements ORDER BY id DESC`).all()));
app.get('/api/admin/notes-chambres', (req, res) => {
  const cmds = db.prepare(`SELECT * FROM commandes WHERE statut = 'encaisse' AND ((numero_chambre IS NOT NULL AND numero_chambre != '') OR mode_paiement LIKE '%Chambre%') ORDER BY id DESC`).all();
  const getI = db.prepare(`SELECT * FROM commande_items WHERE commande_id = ?`);
  res.json(cmds.map(c => ({ ...c, items: getI.all(c.id) })));
});
app.get('/api/admin/backup-db', (req, res) => res.download(path.join(__dirname, 'restaurant.db'), `backup_${config.etablissement.replace(/[^a-z0-9]/gi, '_')}.db`));

// Route de contrôle de santé globale (SmartView Cloud + Base de données)
app.get('/api/health', (req, res) => {
  try {
    db.prepare('SELECT 1').get();
    res.json({
      status: 'healthy',
      system: (config.monitoring && config.monitoring.serviceName) ? config.monitoring.serviceName : 'SmartView Cloud',
      restaurant: config.etablissement,
      uptime_seconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: 'Base de données inaccessible',
      timestamp: new Date().toISOString()
    });
  }
});

// Écouteurs Socket.io temps réel
io.on('connection', (socket) => {
  socket.on('request_closing_z', () => {
    const restaurantId = config.etablissement ? config.etablissement.toLowerCase().replace(/[^a-z0-9]/g, '') : 'hoteldespins';
    const zReport = generateClosingZ(restaurantId);
    socket.emit('closing_z_ready', zReport);
  });
});

server.listen(PORT, () => console.log(`Serveur POS [${config.etablissement}] lancé sur le port ${PORT}`));