const db = require('../config/db');

exports.getNotifications = async (req, res) => {
    try {
        const userId = req.user.id;

        const result = await db.query(
            `
            SELECT id, title, message, icon, type, sender_id, is_read, created_at 
            FROM notifications 
            WHERE user_id = $1 
            ORDER BY created_at DESC 
            LIMIT 50
            `,
            [userId]
        );

        res.status(200).json({
            success: true,
            data: result.rows
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.markAsRead = async (req, res) => {
    try {
        const userId = req.user.id;
        const notifId = req.params.id;

        const result = await db.query(
            `
            UPDATE notifications 
            SET is_read = true 
            WHERE id = $1 AND user_id = $2 
            RETURNING id
            `,
            [notifId, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Notifikasi tidak ditemukan' });
        }

        res.status(200).json({ success: true, message: 'Notifikasi ditandai telah dibaca' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.getUnreadCounts = async (req, res) => {
    try {
        const currentUserId = req.user.id;
        const notificationQuery = await db.query(
            `SELECT COUNT(*)::int AS unread_count 
             FROM notifications 
             WHERE user_id = $1 AND is_read = false`,
            [currentUserId]
        );

        const messageQuery = await db.query(
            `SELECT COUNT(*)::int AS unread_count 
             FROM messages 
             WHERE receiver_id = $1 AND is_read = false`,
            [currentUserId]
        );

        res.status(200).json({
            success: true,
            unreadNotifications: notificationQuery.rows[0].unread_count || 0,
            unreadMessages: messageQuery.rows[0].unread_count || 0
        });

    } catch (err) {
        console.error("Error getUnreadCounts:", err);
        res.status(500).json({
            success: false,
            message: "Gagal memuat jumlah pesan dan notifikasi baru"
        });
    }
};