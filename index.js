const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { 
  recupererCommandes, 
  recupererHistorique, 
  recupererStatistiques, 
  ajouterCommande, 
  changerStatutCommande, 
  supprimerCommande 
} = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(express.static('public'));

// 1. Récupérer les commandes en cours (pour la cuisine et la salle)
app.get('/api/commandes', (req, res) => {
  res.json(recupererCommandes());
});

// 2. Récupérer l'historique complet (pour admin.html)
app.get('/api/historique', (req, res) => {
  res.json(recupererHistorique());
});

// 3. Récupérer les métriques statistiques (pour admin.html)
app.get('/api/statistiques', (req, res) => {
  res.json(recupererStatistiques());
});

// 4. Créer une nouvelle commande
app.post('/api/commandes', (req, res) => {
  const { table, details } = req.body;
  if (!table || !details) {
    return res.status(400).json({ error: 'Informations manquantes' });
  }

  const maintenant = Date.now();
  const nouvelleCommande = {
    id: maintenant.toString(),
    table: table.trim(),
    details: details.trim(),
    statut: 'En attente',
    heure: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    timestamp_creation: maintenant
  };

  ajouterCommande(nouvelleCommande);
  io.emit('miseAJourCommandes', recupererCommandes());
  io.emit('miseAJourStats');
  res.json({ success: true, commande: nouvelleCommande });
});

// 5. Modifier le statut d'une commande
app.patch('/api/commandes/:id/statut', (req, res) => {
  const { id } = req.params;
  const { statut } = req.body;

  changerStatutCommande(id, statut);

  io.emit('miseAJourCommandes', recupererCommandes());
  io.emit('miseAJourStats');
  res.json({ success: true });
});

// 6. Supprimer définitivement une commande
app.delete('/api/commandes/:id', (req, res) => {
  supprimerCommande(req.params.id);
  io.emit('miseAJourCommandes', recupererCommandes());
  io.emit('miseAJourStats');
  res.json({ success: true });
});

// Lancement du serveur
server.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
});