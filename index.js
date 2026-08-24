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
  CREATE TABLE IF NOT EXISTS commandes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_num INTEGER NOT NULL,
    statut TEXT DEFAULT 'en_attente',
    mode_paiement TEXT,
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
`);

// Migration automatique des colonnes si besoin
try { db.exec(`ALTER TABLE commandes ADD COLUMN date_fin DATETIME`); } catch (e) {}
try { db.exec(`ALTER TABLE commandes ADD COLUMN mode_paiement TEXT`); } catch (e) {}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname)));

// --- ROUTES API ---

// 1. Statut en direct de toutes les tables (1 à 15)
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
        statuts[ord.table_num] = 'servi'; // Prête à encaisser
      } else if (statuts[ord.table_num] !== 'servi') {
        statuts[ord.table_num] = 'occupee'; // En cours en cuisine
      }
    });

    res.json(statuts);
  } catch (err) {
    res.status(500).json({ error: 'Erreur statuts tables' });
  }
});

// 2. Commandes actives (pour la cuisine)
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

// 3. Récupérer l'addition détaillée d'une table
app.get('/api/tables/:table_num/addition', (req, res) => {
  try {
    const { table_num } = req.params;
    const commandes = db.prepare(`
      SELECT id FROM commandes 
      WHERE table_num = ? AND statut NOT IN ('encaisse', 'annule')
    `).all(table_num);

    if (commandes.length === 0) {
      return res.json({ table_num, items: [], total: 0 });
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
      total: parseFloat(total.toFixed(2)),
      total_ht: parseFloat((total / 1.10).toFixed(2)),
      tva: parseFloat((total - (total / 1.10)).toFixed(2))
    });
  } catch (err) {
    res.status(500).json({ error: 'Erreur calcul addition' });
  }
});

// 4. Créer une nouvelle commande
app.post('/api/commandes', (req, res) => {
  try {
    const { table_num, items, remarques } = req.body;

    const insertCmd = db.prepare(`
      INSERT INTO commandes (table_num, statut, remarques, date_creation) 
      VALUES (?, 'en_attente', ?, datetime('now', 'localtime'))
    `);
    const info = insertCmd.run(table_num || 1, remarques || '');
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

// 5. Encaisser et libérer une table
app.post('/api/tables/:table_num/encaisser', (req, res) => {
  try {
    const { table_num } = req.params;
    const { mode_paiement } = req.body;

    const update = db.prepare(`
      UPDATE commandes 
      SET statut = 'encaisse', mode_paiement = ?, date_fin = datetime('now', 'localtime') 
      WHERE table_num = ? AND statut NOT IN ('encaisse', 'annule')
    `);
    update.run(mode_paiement || 'CB', table_num);

    io.emit('table_status_change');
    io.emit('statut_mis_a_jour');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur encaissement' });
  }
});

// 6. Mise à jour statut commande individuelle
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
    res.status(500).json({ error: 'Erreur mise à jour statut' });
  }
});

// 7. TOUTES les commandes (pour Admin)
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