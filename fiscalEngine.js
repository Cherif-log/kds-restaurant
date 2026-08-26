const crypto = require('crypto');

// En mémoire (à brancher sur ta base de données par la suite)
// Structure isolée par identifiant de restaurant (ex: "hoteldespins")
const restaurantStores = {};

/**
 * Initialise ou récupère l'état fiscal d'un restaurant
 */
function getOrCreateStore(restaurantId) {
    if (!restaurantStores[restaurantId]) {
        restaurantStores[restaurantId] = {
            lastHash: `GENESIS_HASH_${restaurantId.toUpperCase()}`,
            grandTotalPerpetuel: 0,
            zCounter: 1,
            currentDayTickets: []
        };
    }
    return restaurantStores[restaurantId];
}

/**
 * Scelle et signe un ticket de caisse selon la norme art. 286 CGI
 */
function signAndRecordTicket(restaurantId, { ticketId, items, totals, paymentMethod, cashierId }) {
    const store = getOrCreateStore(restaurantId);
    const timestamp = new Date().toISOString();

    // 1. Structure normalisée du ticket
    const ticketPayload = {
        restaurantId,
        ticketId,
        timestamp,
        cashierId: cashierId || 'SERV-01',
        items: items.map(item => ({
            name: item.name,
            qty: item.qty,
            priceTTC: item.priceTTC,
            vatRate: item.vatRate || 10 // Taux par défaut restauration (10%)
        })),
        totals: {
            ht: Number(totals.ht.toFixed(2)),
            ttc: Number(totals.ttc.toFixed(2)),
            tva: {
                rate_5_5: Number((totals.tva_5_5 || 0).toFixed(2)),
                rate_10: Number((totals.tva_10 || 0).toFixed(2)),
                rate_20: Number((totals.tva_20 || 0).toFixed(2))
            }
        },
        paymentMethod: paymentMethod || 'cb',
        previousHash: store.lastHash
    };

    // 2. Chaînage cryptographique SHA-256 (Inaltérabilité)
    const rawData = JSON.stringify(ticketPayload);
    const currentHash = crypto.createHash('sha256').update(rawData).digest('hex');

    // 3. Mise à jour des compteurs perpétuels de ce restaurant
    store.lastHash = currentHash;
    store.grandTotalPerpetuel += ticketPayload.totals.ttc;

    const certifiedTicket = {
        ...ticketPayload,
        signature: currentHash,
        grandTotalSnapshot: Number(store.grandTotalPerpetuel.toFixed(2))
    };

    store.currentDayTickets.push(certifiedTicket);
    return certifiedTicket;
}

/**
 * Génère le Ticket Z (Clôture journalière scellée)
 */
function generateClosingZ(restaurantId) {
    const store = getOrCreateStore(restaurantId);
    const tickets = store.currentDayTickets;
    const closingDate = new Date().toISOString();

    let totalHT = 0;
    let totalTTC = 0;
    let tvaBreakdown = { '5.5': 0, '10': 0, '20': 0 };
    let paymentBreakdown = { cb: 0, especes: 0, titres_resto: 0 };

    tickets.forEach(ticket => {
        totalHT += ticket.totals.ht;
        totalTTC += ticket.totals.ttc;

        tvaBreakdown['5.5'] += ticket.totals.tva.rate_5_5;
        tvaBreakdown['10'] += ticket.totals.tva.rate_10;
        tvaBreakdown['20'] += ticket.totals.tva.rate_20;

        const method = ticket.paymentMethod;
        paymentBreakdown[method] = (paymentBreakdown[method] || 0) + ticket.totals.ttc;
    });

    const zReportData = {
        restaurantId,
        zNumber: store.zCounter++,
        closingDate,
        totalTickets: tickets.length,
        totalHT: Number(totalHT.toFixed(2)),
        totalTTC: Number(totalTTC.toFixed(2)),
        tva: {
            '5.5': Number(tvaBreakdown['5.5'].toFixed(2)),
            '10': Number(tvaBreakdown['10'].toFixed(2)),
            '20': Number(tvaBreakdown['20'].toFixed(2))
        },
        payments: paymentBreakdown,
        grandTotalPerpetuel: Number(store.grandTotalPerpetuel.toFixed(2)),
        lastTicketSignature: store.lastHash
    };

    // Scellement du Z
    const zHash = crypto.createHash('sha256').update(JSON.stringify(zReportData)).digest('hex');

    // Réinitialisation des tickets du jour actif
    store.currentDayTickets = [];

    return {
        ...zReportData,
        zSignature: zHash
    };
}

module.exports = {
    signAndRecordTicket,
    generateClosingZ,
    getOrCreateStore
};