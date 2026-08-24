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

// Création des tables si elles n'existent pas
db.exec(`
  CREATE TABLE IF NOT EXISTS commandes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_num INTEGER NOT NULL,
    statut TEXT DEFAULT 'en_attente',
    remarques TEXT,
    date_creation DATETIME DEFAULT CURRENT_TIMESTAMP
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

app.use(express.json());

// Distribution des fichiers statiques depuis public ET depuis la racine
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname)));

// --- ROUTES API ---

// 1. Récupérer les commandes actives
app.get('/api/commandes', (req, res) => {
  try {
    const commandes = db.prepare(`
      SELECT * FROM commandes 
      WHERE statut != 'servi' AND statut != 'annule' 
      ORDER BY id DESC
    `).all();

    const getItems = db.prepare(`SELECT * FROM commande_items WHERE commande_id = ?`);

    const result = commandes.map(cmd => {
      return {
        ...cmd,
        items: getItems.all(cmd.id)
      };
    });

    res.json(result);
  } catch (err) {
    console.error('Erreur GET /api/commandes :', err);
    res.status(500).json({ error: 'Erreur base de données' });
  }
});

// 2. Créer une nouvelle commande
app.post('/api/commandes', (req, res) => {
  try {
    const { table_num, items, remarques } = req.body;

    const insertCmd = db.prepare(`
      INSERT INTO commandes (table_num, statut, remarques) 
      VALUES (?, 'en_attente', ?)
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
    res.status(201).json(completeOrder);
  } catch (err) {
    console.error('Erreur POST /api/commandes :', err);
    res.status(500).json({ error: 'Erreur création commande' });
  }
});

// 3. Mise à jour statut
app.put('/api/commandes/:id/statut', (req, res) => {
  try {
    const { id } = req.params;
    const { statut } = req.body;

    const update = db.prepare(`UPDATE commandes SET statut = ? WHERE id = ?`);
    update.run(statut, id);

    io.emit('statut_mis_a_jour', { id, statut });
    res.json({ success: true });
  } catch (err) {
    console.error('Erreur PUT /api/commandes statut :', err);
    res.status(500).json({ error: 'Erreur mise à jour' });
  }
});

// --- SOCKET.IO ---
io.on('connection', (socket) => {
  socket.on('changer_statut', (data) => {
    io.emit('statut_mis_a_jour', data);
  });
});

server.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});