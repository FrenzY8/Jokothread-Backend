const db = require('../config/db');

exports.getContacts = async (req, res) => {
    try {
        const currentUserId = req.user.id;

        const queryText = `
            SELECT DISTINCT ON (users.id)
                users.id, 
                users.name, 
                users.username, 
                users.avatar
            FROM users
            WHERE users.id IN (
                SELECT following_id FROM follows 
                WHERE follower_id = $1 AND status = 'ACCEPTED'
                
                UNION
                
                SELECT receiver_id FROM messages WHERE sender_id = $1
                
                UNION
                
                SELECT sender_id FROM messages WHERE receiver_id = $1
            )
            AND users.id != $1
            ORDER BY users.id, users.name ASC
        `;

        const { rows } = await db.query(queryText, [currentUserId]);

        res.status(200).json({
            success: true,
            data: rows
        });
    } catch (err) {
        console.error('getContacts error:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.readChatHistory = async (req, res) => {
    try {
        const receiverId = req.user.id;
        const senderId = req.params.id;

        if (!senderId) {
            return res.status(400).json({ success: false, message: 'ID Pengirim tidak valid' });
        }

        const result = await db.query(
            `UPDATE messages 
             SET is_read = true 
             WHERE receiver_id = $1 AND sender_id = $2 AND is_read = false`,
            [receiverId, senderId]
        );

        res.status(200).json({
            success: true,
            message: 'Pesan telah dibaca',
            updatedCount: result.rowCount
        });
    } catch (err) {
        console.error('readChatHistory error:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.getChatHistory = async (req, res) => {
    try {
        const currentUserId = req.user.id;
        const contactId = parseInt(req.params.id);

        const queryText = `
            SELECT * FROM messages 
            WHERE (sender_id = $1 AND receiver_id = $2)
               OR (sender_id = $2 AND receiver_id = $1)
            ORDER BY created_at ASC
        `;

        const { rows } = await db.query(queryText, [currentUserId, contactId]);

        res.status(200).json({
            success: true,
            data: rows
        });
    } catch (err) {
        console.error('getChatHistory error:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.sendMessage = async (req, res) => {
    try {
        const senderId = req.user.id;
        const receiverId = parseInt(req.params.id);
        const { message, attachment } = req.body;

        const eligibilityCheck = await db.query(
            `
            SELECT id FROM follows WHERE follower_id = $1 AND following_id = $2 AND status = 'ACCEPTED'
            UNION
            SELECT id FROM messages WHERE sender_id = $2 AND receiver_id = $1
            LIMIT 1
            `,
            [senderId, receiverId]
        );

        if (eligibilityCheck.rows.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'Kamu tidak bisa mengirim pesan ke user ini karena tidak mengikuti dan tidak memiliki riwayat obrolan.'
            });
        }

        if (attachment && !attachment.startsWith('data:image/')) {
            return res.status(400).json({
                success: false,
                message: 'Format file tidak didukung. Lampiran harus berupa gambar.'
            });
        }

        const queryText = `
            INSERT INTO messages (sender_id, receiver_id, message, attachment)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `;
        const values = [senderId, receiverId, message || null, attachment || null];

        const { rows } = await db.query(queryText, values);

        res.status(201).json({
            success: true,
            message: 'Pesan berhasil dikirim',
            data: rows[0]
        });
    } catch (err) {
        console.error('sendMessage error:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
};