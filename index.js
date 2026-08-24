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

  CREATE TABLE IF NOT EXISTS commandes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_num INTEGER NOT NULL,
    statut TEXT DEFAULT 'en_attente',
    serveur_nom TEXT DEFAULT 'Salle',
    mode_paiement TEXT,
    remise_montant REAL DEFAULT 0,
    total_paye REAL,
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
`);

// Migrations automatiques
try { db.exec(`ALTER TABLE commandes ADD COLUMN date_fin DATETIME`); } catch (e) {}
try { db.exec(`ALTER TABLE commandes ADD COLUMN mode_paiement TEXT`); } catch (e) {}
try { db.exec(`ALTER TABLE commandes ADD COLUMN remise_montant REAL DEFAULT 0`); } catch (e) {}
try { db.exec(`ALTER TABLE commandes ADD COLUMN total_paye REAL`); } catch (e) {}
try { db.exec(`ALTER TABLE commandes ADD COLUMN serveur_nom TEXT DEFAULT 'Salle'`); } catch (e) {}

// Initialisation des serveurs par défaut
const countServeurs = db.prepare(`SELECT count(*) as count FROM serveurs`).get();
if (countServeurs.count === 0) {
  const insertServ = db.prepare(`INSERT INTO serveurs (nom, pin) VALUES (?, ?)`);
  insertServ.run('Thomas', '1234');
  insertServ.run('Sarah', '5678');
  insertServ.run('Maxime', '0000');
  insertServ.run('Direction', '9999');
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname)));

// --- ROUTES API ---

// 1. Authentification Serveur par PIN
app.post('/api/auth/pin', (req, res) => {
  try {
    const { pin } = req.body;
    const serveur = db.prepare(`SELECT id, nom FROM serveurs WHERE pin = ?`).get(pin);
    if (serveur) {
      res.json({ success: true, serveur });
    } else {
      res.status(401).json({ success: false, error: 'Code PIN incorrect' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Erreur authentification' });
  }
});

// 2. Statut des tables
app.get('/api/tables/statuts', (req, res) => {
  try {
    const activeOrders = db.prepare(`
      SELECT table_num, statut FROM commandes 
      WHERE statut NOT IN ('encaisse', 'annule')
    `).all();

    const statuts = {};
    for (let i = 1; i <= 15; i++) statuts[i] = 'libre';

    activeOrders.forEach(ord => {
      if (ord.statut === 'servi') {
        statuts[ord.table_num] = 'servi';
      } else if (statuts[ord.table_num] !== 'servi') {
        statuts[ord.table_num] = 'occupee';
      }
    });

    res.json(statuts);
  } catch (err) {
    res.status(500).json({ error: 'Erreur statuts tables' });
  }
});

// 3. Ruptures de Stock (86-List)
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

// 4. Commandes actives (Cuisine)
app.get('/api/commandes', (req, res) => {
  try {
    const commandes = db.prepare(`
      SELECT * FROM commandes 
      WHERE statut NOT IN ('servi', 'encaisse', 'annule') 
      ORDER BY id DESC
    `).all();

    const getItems = db.prepare(`SELECT * FROM commande_items WHERE commande_id = ?`);
    const result = commandes.map(cmd => ({
      ...cmd,
      items: getItems.all(cmd.id)
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Erreur base de données' });
  }
});

// 5. Addition d'une table
app.get('/api/tables/:table_num/addition', (req, res) => {
  try {
    const { table_num } = req.params;
    const commandes = db.prepare(`
      SELECT id, serveur_nom FROM commandes 
      WHERE table_num = ? AND statut NOT IN ('encaisse', 'annule')
    `).all(table_num);

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

// 6. Créer une commande
app.post('/api/commandes', (req, res) => {
  try {
    const { table_num, items, remarques, serveur_nom } = req.body;

    const insertCmd = db.prepare(`
      INSERT INTO commandes (table_num, statut, serveur_nom, remarques, date_creation) 
      VALUES (?, 'en_attente', ?, ?, datetime('now', 'localtime'))
    `);
    const info = insertCmd.run(table_num || 1, serveur_nom || 'Salle', remarques || '');
    const commandeId = info.lastInsertRowid;

    const insertItem = db.prepare(`
      INSERT INTO commande_items (commande_id, article_nom, prix, quantite, remarques)
      VALUES (?, ?, ?, ?, ?)
    `);

    if (items && Array.isArray(items)) {
      items.forEach(it => {
        insertItem.run(
          commandeId,
          it.article_nom || it.nom || 'Article',
          it.prix || 0,
          it.quantite || 1,
          it.remarques || ''
        );
      });
    }

    const getItems = db.prepare(`SELECT * FROM commande_items WHERE commande_id = ?`);
    const completeOrder = {
      id: commandeId,
      table_num: table_num || 1,
      statut: 'en_attente',
      serveur_nom: serveur_nom || 'Salle',
      remarques: remarques || '',
      date_creation: new Date().toISOString(),
      items: getItems.all(commandeId)
    };

    io.emit('nouvelle_commande', completeOrder);
    io.emit('table_status_change');

    res.status(201).json(completeOrder);
  } catch (err) {
    res.status(500).json({ error: 'Erreur création' });
  }
});

// 7. Encaisser table
app.post('/api/tables/:table_num/encaisser', (req, res) => {
  try {
    const { table_num } = req.params;
    const { mode_paiement, remise_montant, total_paye, serveur_nom } = req.body;

    const update = db.prepare(`
      UPDATE commandes 
      SET statut = 'encaisse', 
          mode_paiement = ?, 
          remise_montant = ?, 
          total_paye = ?, 
          serveur_nom = COALESCE(?, serveur_nom),
          date_fin = datetime('now', 'localtime') 
      WHERE table_num = ? AND statut NOT IN ('encaisse', 'annule')
    `);
    update.run(mode_paiement || 'CB', remise_montant || 0, total_paye || 0, serveur_nom || null, table_num);

    io.emit('table_status_change');
    io.emit('statut_mis_a_jour');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur encaissement' });
  }
});

// 8. Statut commande
app.put('/api/commandes/:id/statut', (req, res) => {
  try {
    const { id } = req.params;
    const { statut } = req.body;

    if (statut === 'servi') {
      const update = db.prepare(`UPDATE commandes SET statut = ?, date_fin = datetime('now', 'localtime') WHERE id = ?`);
      update.run(statut, id);
    } else {
      const update = db.prepare(`UPDATE commandes SET statut = ? WHERE id = ?`);
      update.run(statut, id);
    }

    io.emit('statut_mis_a_jour', { id, statut });
    io.emit('table_status_change');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur statut' });
  }
});

// 9. Admin historique
app.get('/api/admin/commandes', (req, res) => {
  try {
    const commandes = db.prepare(`SELECT * FROM commandes ORDER BY id DESC`).all();
    const getItems = db.prepare(`SELECT * FROM commande_items WHERE commande_id = ?`);
    const result = commandes.map(cmd => ({
      ...cmd,
      items: getItems.all(cmd.id)
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Erreur base de données' });
  }
});

// --- SOCKET.IO ---
io.on('connection', (socket) => {
  socket.on('changer_statut', (data) => {
    io.emit('statut_mis_a_jour', data);
    io.emit('table_status_change');
  });
});

server.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});