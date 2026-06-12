const db = require('../config/db');

const createNotification = async (userId, title, message, icon, type = 'general', senderId = null) => {
    try {
        const queryText = `
            INSERT INTO notifications (user_id, title, message, icon, type, sender_id)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `;
        
        const { rows } = await db.query(queryText, [
            userId, 
            title, 
            message, 
            icon, 
            type, 
            senderId
        ]);
        
        return rows[0];
    } catch (err) {
        console.error("Gagal membuat notifikasi:", err.message);
        throw err;
    }
};

module.exports = { createNotification };