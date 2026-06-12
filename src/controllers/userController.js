const axios = require('axios')
const db = require('../config/db');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library')
const { createNotification } = require('../helper/notification');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: process.env.MAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.MAIL_PORT) || 465,
    secure: true,
    auth: {
        user: process.env.MAIL_USERNAME,
        pass: process.env.MAIL_PASSWORD
    }
});

const imageUrlToBase64 = async (url) => {
    const response = await axios.get(url, {
        responseType: 'arraybuffer'
    })

    const contentType = response.headers['content-type']
    const base64 = Buffer.from(response.data, 'binary').toString('base64')
    return `data:${contentType};base64,${base64}`
}

const client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID
)

exports.googleAuth = async (req, res) => {
    try {
        const { credential } = req.body

        if (!credential) {
            return res.status(400).json({
                success: false,
                message: 'Credential tidak ditemukan'
            })
        }

        const ticket = await client.verifyIdToken({
            idToken: credential,
            audience: process.env.GOOGLE_CLIENT_ID
        })

        const payload = ticket.getPayload()

        const email = payload.email
        const name = payload.name
        let avatar = null

        if (payload.picture) {
            avatar = await imageUrlToBase64(payload.picture)
        }

        let username =
            email.split('@')[0]
                .toLowerCase()
                .replace(/[^a-z0-9_]/g, '')

        const existingUser = await db.query(
            'SELECT * FROM users WHERE email = $1',
            [email]
        )

        let user

        if (existingUser.rows.length > 0) {
            user = existingUser.rows[0]
        } else {

            let finalUsername = username
            let counter = 1

            while (true) {
                const check = await db.query(
                    'SELECT id FROM users WHERE username = $1',
                    [finalUsername]
                )

                if (check.rows.length === 0) {
                    break
                }

                finalUsername = `${username}${counter}`
                counter++
            }

            const insert = await db.query(
                `
                INSERT INTO users
                (
                    name,
                    username,
                    email,
                    avatar,
                    password,
                    is_google_account
                )
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING
                    id,
                    name,
                    username,
                    email,
                    avatar,
                    is_google_account
                `,
                [
                    name,
                    finalUsername,
                    email,
                    avatar,
                    null,
                    true
                ]
            )

            user = insert.rows[0]
        }

        const token = jwt.sign(
            {
                id: user.id,
                email: user.email
            },
            process.env.JWT_SECRET,
            {
                expiresIn: '7d'
            }
        )

        await createNotification(
            user.id,
            'Login Berhasil',
            `Kamu baru saja Login lewat Google.`,
            'security'
        );

        res.status(200).json({
            success: true,
            token,
            user
        })

    } catch (err) {
        console.error(err)

        res.status(500).json({
            success: false,
            message: "Error: " + err.message
        })
    }
}

exports.loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;
        const JWT_SECRET = process.env.JWT_SECRET;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email dan password wajib diisi'
            });
        }

        const result = await db.query(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Email atau password salah'
            });
        }

        const user = result.rows[0];

        const isMatch = await bcrypt.compare(
            password,
            user.password
        );

        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Email atau password salah'
            });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email },
            JWT_SECRET,
            { expiresIn: '1d' }
        );

        await createNotification(
            user.id,
            'Login Berhasil',
            `Kamu baru saja Login.`,
            'security'
        );

        res.json({
            success: true,
            message: 'Login berhasil',
            token,
            user: {
                id: user.id,
                name: user.name,
                username: user.username,
                email: user.email,
                avatar: user.avatar
            }
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: "Email atau Password salah"
        });
    }
};

exports.getUsers = async (req, res) => {
    try {
        const [users] = await db.query(
            'SELECT id, name, username, email, avatar, is_google_account, created_at FROM users'
        );

        res.json({
            success: true,
            data: users
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: "Error: " + err.message
        });
    }
};

exports.getBlockedList = async (req, res) => {
    try {
        const currentUserId = req.user.id;

        const result = await db.query(
            `
            SELECT 
                u.id,
                u.name,
                u.username,
                u.avatar
            FROM users u
            INNER JOIN blocks b
                ON u.id = b.blocked_id
            WHERE b.blocker_id = $1
            `,
            [currentUserId]
        );

        res.status(200).json({
            success: true,
            data: result.rows
        });

    } catch (error) {
        console.error("Error fetch blocked list:", error);

        res.status(500).json({
            success: false,
            message: "Gagal memuat daftar blokir"
        });
    }
};

exports.getUserById = async (req, res) => {
    try {
        const userId = req.params.id || 0;
        const currentUserId = req.user?.id || 0;
        const result = await db.query(
            `
        SELECT
            users.id,
            users.name,
            users.username,
            users.email,
            users.avatar,
            users.bio,
            users.followers_count,
            users.following_count,
            users.is_private,
            users.created_at,

            EXISTS(
                SELECT 1
                FROM follows
                WHERE follower_id = $2
                AND following_id = users.id
                AND status = 'ACCEPTED'
            ) AS is_following,

            EXISTS(
                SELECT 1
                FROM follows
                WHERE follower_id = $2
                AND following_id = users.id
                AND status = 'PENDING'
            ) AS is_requested,

            EXISTS(
                SELECT 1
                FROM blocks
                WHERE blocker_id = $2
                AND blocked_id = users.id
            ) AS is_blocked

        FROM users
        WHERE users.id = $1
        LIMIT 1
        `,
            [userId, currentUserId]
        );

        const blockCheck = await db.query(
            `
            SELECT
                EXISTS (
                    SELECT 1
                    FROM blocks
                    WHERE blocker_id = $1
                    AND blocked_id = $2
                ) AS is_blocked,

                EXISTS (
                    SELECT 1
                    FROM blocks
                    WHERE blocker_id = $2
                    AND blocked_id = $1
                ) AS blocked_by
            `,
            [currentUserId, userId]
        );

        const relation = blockCheck.rows[0];

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User tidak ditemukan'
            });
        }

        res.status(200).json({
            success: true,
            user: result.rows[0],
            is_blocked: relation.is_blocked,
            blocked_by: relation.blocked_by
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: "Error: " + err.message
        });
    }
};

exports.getMe = async (req, res) => {
    try {
        const currentUserId = req.user?.id; 

        if (!currentUserId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const result = await db.query(
            `SELECT id, name, username, email, avatar, bio FROM users WHERE id = $1 LIMIT 1`,
            [currentUserId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
        }

        res.status(200).json({
            success: true,
            user: result.rows[0]
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Error: " + err.message });
    }
};

exports.updateUser = async (req, res) => {
    try {
        const userId = req.params.id;

        let {
            name,
            username,
            email,
            avatar,
            bio
        } = req.body;

        if (username) {
            username = username
                .toLowerCase()
                .trim();

            const usernameRegex = /^[a-z0-9_]{3,10}$/;

            if (!usernameRegex.test(username)) {
                return res.status(400).json({
                    success: false,
                    message:
                        'Username hanya boleh huruf kecil, angka, underscore, tanpa spasi (3-10 karakter)'
                });
            }
        }

        if (email) {
            email = email.trim().toLowerCase();
        }

        const existingUser = await db.query(
            `
            SELECT id
            FROM users
            WHERE (username = $1 OR email = $2)
            AND id != $3
            `,
            [
                username || '',
                email || '',
                userId
            ]
        );

        if (existingUser.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Username atau email sudah digunakan'
            });
        }

        const allowedFields = [
            'name',
            'username',
            'email',
            'avatar',
            'bio'
        ];

        const updates = [];
        const values = [];

        const updateData = {
            name,
            username,
            email,
            avatar,
            bio
        };

        allowedFields.forEach((field) => {
            if (updateData[field] !== undefined) {
                values.push(updateData[field]);
                updates.push(`${field} = $${values.length}`);
            }
        });

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Tidak ada data yang diupdate'
            });
        }

        values.push(userId);

        const query = `
            UPDATE users
            SET ${updates.join(', ')}
            WHERE id = $${values.length}
            RETURNING
                id,
                name,
                username,
                email,
                avatar,
                bio,
                is_google_account
        `;

        const { rows } = await db.query(query, values);

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User tidak ditemukan'
            });
        }

        res.json({
            success: true,
            message: 'Profil berhasil diperbarui',
            user: rows[0]
        });

    } catch (err) {
        console.error(err);

        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

exports.updatePrivacy = async (req, res) => {
    try {
        const currentUserId = req.user.id;
        const { is_private } = req.body;

        const queryText = `
            UPDATE users 
            SET is_private = $1 
            WHERE id = $2 
            RETURNING id, name, username, email, avatar, bio, is_private, followers_count, following_count, is_google_account, created_at
        `;

        const { rows } = await db.query(queryText, [is_private, currentUserId]);

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: "User tidak ditemukan" });
        }

        res.status(200).json({
            success: true,
            message: "Privasi berhasil diperbarui",
            user: rows[0]
        });
    } catch (err) {
        console.error("updatePrivacy error:", err.message);
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.deleteUser = async (req, res) => {
    try {
        await db.query(
            'DELETE FROM users WHERE id = $1',
            [req.params.id]
        );

        res.json({
            success: true,
            message: 'User deleted'
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

exports.toggleBlock = async (req, res) => {
    try {
        const blockerId = req.user.id;
        const blockedId = parseInt(req.params.id);

        if (blockerId === blockedId) {
            return res.status(400).json({
                success: false,
                message: 'Tidak bisa memblokir diri sendiri'
            });
        }

        const blockCheck = await db.query(
            'SELECT id FROM blocks WHERE blocker_id = $1 AND blocked_id = $2',
            [blockerId, blockedId]
        );

        await db.query('BEGIN');

        if (blockCheck.rows.length > 0) {
            await db.query(
                'DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2',
                [blockerId, blockedId]
            );

            await db.query('COMMIT');

            return res.status(200).json({
                success: true,
                isBlocked: false,
                message: 'Berhasil membuka blokir user'
            });
        } else {
            await db.query(
                'INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                [blockerId, blockedId]
            );

            const relations = await db.query(
                `SELECT follower_id, following_id, status FROM follows 
                 WHERE (follower_id = $1 AND following_id = $2) 
                    OR (follower_id = $2 AND following_id = $3)`,
                [blockerId, blockedId, blockerId]
            );

            for (const rel of relations.rows) {
                if (rel.status === 'ACCEPTED') {
                    await db.query(
                        'UPDATE users SET followers_count = GREATEST(followers_count - 1, 0) WHERE id = $1',
                        [rel.following_id]
                    );
                    await db.query(
                        'UPDATE users SET following_count = GREATEST(following_count - 1, 0) WHERE id = $1',
                        [rel.follower_id]
                    );
                }
            }

            await db.query(
                'DELETE FROM follows WHERE (follower_id = $1 AND following_id = $2) OR (follower_id = $2 AND following_id = $3)',
                [blockerId, blockedId, blockerId]
            );

            await db.query(
                `DELETE FROM notifications 
                 WHERE (user_id = $1 AND sender_id = $2) 
                    OR (user_id = $2 AND sender_id = $3)`,
                [blockerId, blockedId, blockerId]
            );

            await db.query('COMMIT');

            return res.status(200).json({
                success: true,
                isBlocked: true,
                message: 'User berhasil diblokir'
            });
        }

    } catch (err) {
        await db.query('ROLLBACK');
        console.error('toggleBlock error:', err);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

exports.toggleFollow = async (req, res) => {
    try {
        const followerId = req.user.id;
        const currentUserId = req.user.id;
        const followingId = parseInt(req.params.id);

        if (followerId === followingId) {
            return res.status(400).json({
                success: false,
                message: 'Tidak bisa follow diri sendiri'
            });
        }

        const userCheck = await db.query(
            'SELECT id, is_private FROM users WHERE id = $1',
            [followingId]
        );

        if (userCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User tidak ditemukan'
            });
        }

        const targetUser = userCheck.rows[0];
        const followerQuery = await db.query('SELECT username FROM users WHERE id = $1', [followerId]);
        const senderUsername = followerQuery.rows[0]?.username || 'Seseorang';

        const followCheck = await db.query(
            'SELECT id, status FROM follows WHERE follower_id = $1 AND following_id = $2',
            [followerId, followingId]
        );

        if (followCheck.rows.length > 0) {
            const currentRelation = followCheck.rows[0];

            await db.query(
                'DELETE FROM follows WHERE follower_id = $1 AND following_id = $2',
                [followerId, followingId]
            );

            if (currentRelation.status === 'ACCEPTED') {
                await db.query(
                    'UPDATE users SET followers_count = GREATEST(followers_count - 1, 0) WHERE id = $1',
                    [followingId]
                );
                await db.query(
                    'UPDATE users SET following_count = GREATEST(following_count - 1, 0) WHERE id = $1',
                    [followerId]
                );
            }

            return res.status(200).json({
                success: true,
                isFollowing: false,
                is_requested: false,
                message: currentRelation.status === 'PENDING' ? 'Membatalkan permintaan ikuti' : 'Berhasil unfollow user'
            });

        } else {
            if (targetUser.is_private) {
                await createNotification(
                    followingId,
                    'Permintaan Mengikuti',
                    `@${senderUsername} ingin mengikuti kamu.`,
                    'person_add',
                    'follow_request',
                    currentUserId
                );

                await db.query(
                    "INSERT INTO follows (follower_id, following_id, status) VALUES ($1, $2, 'PENDING')",
                    [followerId, followingId]
                );

                return res.status(200).json({
                    success: true,
                    isFollowing: false,
                    is_requested: true,
                    message: 'Permintaan mengikuti dikirim'
                });
            } else {
                await db.query(
                    "INSERT INTO follows (follower_id, following_id, status) VALUES ($1, $2, 'ACCEPTED')",
                    [followerId, followingId]
                );

                await db.query(
                    'UPDATE users SET followers_count = followers_count + 1 WHERE id = $1',
                    [followingId]
                );

                await db.query(
                    'UPDATE users SET following_count = following_count + 1 WHERE id = $1',
                    [followerId]
                );

                await createNotification(
                    followingId,
                    'Pengikut Baru',
                    `@${senderUsername} mulai mengikuti kamu.`,
                    'person_add',
                    'follow',
                    currentUserId
                );

                return res.status(200).json({
                    success: true,
                    isFollowing: true,
                    is_requested: false,
                    message: 'Berhasil mem-follow user'
                });
            }
        }

    } catch (err) {
        console.error('toggleFollow error:', err);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

exports.handleFollowRequest = async (req, res) => {
    try {
        const currentUserId = req.user.id;
        const senderId = parseInt(req.params.senderId);
        const { action } = req.body;

        if (action !== 'ACCEPT' && action !== 'REJECT') {
            return res.status(400).json({ success: false, message: 'Aksi tidak valid' });
        }

        const checkRequest = await db.query(
            `SELECT id FROM follows WHERE follower_id = $1 AND following_id = $2 AND status = 'PENDING'`,
            [senderId, currentUserId]
        );

        if (checkRequest.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Permintaan follow tidak ditemukan atau sudah diproses' });
        }

        await db.query('BEGIN');

        if (action === 'ACCEPT') {
            await db.query(
                `UPDATE follows SET status = 'ACCEPTED' WHERE follower_id = $1 AND following_id = $2`,
                [senderId, currentUserId]
            );

            await db.query(
                `UPDATE users SET followers_count = followers_count + 1 WHERE id = $1`,
                [currentUserId]
            );

            await db.query(
                `UPDATE users SET following_count = following_count + 1 WHERE id = $1`,
                [senderId]
            );

            const myProfileQuery = await db.query('SELECT username FROM users WHERE id = $1', [currentUserId]);
            const myUsername = myProfileQuery.rows[0]?.username || 'Seseorang';

            await createNotification(
                senderId,
                'Permintaan Diterima',
                `@${myUsername} menerima permintaan mengikuti kamu.`,
                'person',
                'follow_accept',
                currentUserId
            );

        } else if (action === 'REJECT') {
            await db.query(
                `DELETE FROM follows WHERE follower_id = $1 AND following_id = $2 AND status = 'PENDING'`,
                [senderId, currentUserId]
            );
        }

        await db.query(
            `DELETE FROM notifications WHERE user_id = $1 AND sender_id = $2 AND type = 'follow_request'`,
            [currentUserId, senderId]
        );

        await db.query('COMMIT');

        res.status(200).json({
            success: true,
            message: action === 'ACCEPT' ? 'Permintaan follow diterima' : 'Permintaan follow ditolak'
        });

    } catch (err) {
        await db.query('ROLLBACK');
        console.error('handleFollowRequest error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.createUser = async (req, res) => {
    try {
        const { name, username, email, password, avatar } = req.body;

        if (!name || !username || !email || !password) {
            return res.status(400).json({ success: false, message: 'Semua field wajib diisi' });
        }

        const { rows: existing } = await db.query(
            'SELECT * FROM users WHERE username = $1 OR email = $2',
            [username, email]
        );

        if (existing.length > 0) {
            return res.status(400).json({ success: false, message: 'Username atau email sudah terdaftar' });
        }

        const otpCode = crypto.randomInt(100000, 999999).toString();
        const otpExpires = new Date(Date.now() + 5 * 60 * 1000);

        const hashedPassword = await bcrypt.hash(password, 10);

        await db.query('DELETE FROM otp_verifications WHERE email = $1', [email]);

        await db.query(
            `INSERT INTO otp_verifications (name, username, email, password, avatar, otp_code, expires_at) 
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [name, username.toLowerCase().replace(/\s+/g, ''), email, hashedPassword, avatar || null, otpCode, otpExpires]
        );

        const mailOptions = {
            from: `"${process.env.MAIL_FROM_NAME || 'App Name'}" <${process.env.MAIL_USERNAME}>`,
            to: email,
            subject: 'Kode Verifikasi OTP Registrasi Akun',
            html: `
            <div style="background-color: transparent; padding: 32px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                <div style="max-width: 480px; margin: 0 auto; background-color: #182136; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 16px; padding: 32px; text-align: center; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                    
                    <h2 style="color: #ffffff; margin-top: 0; margin-bottom: 8px; font-size: 24px; font-weight: 600; letter-spacing: -0.5px;">
                        Verifikasi Akun Anda
                    </h2>
                    
                    <p style="color: #94a3b8; font-size: 15px; margin-bottom: 24px;">
                        Halo ${name}, gunakan kode OTP di bawah ini untuk menyelesaikan pendaftaran:
                    </p>

                    <div style="margin: 24px 0;">
                        <span style="display: inline-block; font-family: monospace; font-size: 32px; font-weight: 700; color: #ffffff; letter-spacing: 6px; background-color: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); padding: 12px 24px; border-radius: 12px;">
                            ${otpCode}
                        </span>
                    </div>

                    <p style="color: #64748b; font-size: 13px; margin-bottom: 0; margin-top: 24px;">
                        Kode ini berlaku selama <strong style="color: #cbd5e1;">5 menit</strong>.<br>
                        Jangan bagikan kode ini kepada siapa pun.
                    </p>
                    
                </div>
            </div>
        `
        };

        await transporter.sendMail(mailOptions);

        res.status(200).json({
            success: true,
            message: 'Kode OTP telah dikirim ke email anda.',
            email: email
        });

    } catch (err) {
        console.error("Error pada createUser:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.verifyOTP = async (req, res) => {
    try {
        const { email, otpCode } = req.body;
        const JWT_SECRET = process.env.JWT_SECRET;

        if (!email || !otpCode) {
            return res.status(400).json({ success: false, message: 'Email dan kode OTP wajib diisi' });
        }

        const { rows: tempUser } = await db.query(
            'SELECT * FROM otp_verifications WHERE email = $1',
            [email]
        );

        if (tempUser.length === 0) {
            return res.status(400).json({ success: false, message: 'Data registrasi tidak ditemukan atau silakan daftar kembali' });
        }

        const data = tempUser[0];

        if (new Date() > new Date(data.expires_at)) {
            return res.status(400).json({ success: false, message: 'Kode OTP telah kedaluwarsa, silakan minta kode baru' });
        }

        if (data.otp_code !== otpCode) {
            return res.status(400).json({ success: false, message: 'Kode OTP yang Anda masukkan salah' });
        }

        const { rows: result } = await db.query(
            `
            INSERT INTO users
            (
                name,
                username,
                email,
                password,
                avatar,
                is_google_account
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING
                id,
                name,
                username,
                email,
                avatar,
                is_google_account
            `,
            [
                data.name,
                data.username,
                data.email,
                data.password,
                data.avatar || null,
                false
            ]
        );

        const newUserId = result[0].id;
        await db.query('DELETE FROM otp_verifications WHERE email = $1', [email]);

        const token = jwt.sign(
            { id: newUserId, email: data.email },
            JWT_SECRET,
            { expiresIn: '1d' }
        );

        res.status(201).json({
            success: true,
            message: 'Akun berhasil diverifikasi dan aktif!',
            token,
            user: {
                id: newUserId,
                name: data.name,
                username: data.username,
                email: data.email,
                avatar: data.avatar
            }
        });

    } catch (err) {
        console.error("Error pada verifyOTP:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.passwordOtpRequest = async (req, res) => {
    try {
        const userId = req.user.id;

        const userQuery = await db.query('SELECT name, username, email, avatar FROM users WHERE id = $1', [userId]);
        if (userQuery.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
        }

        const { name, username, email, avatar } = userQuery.rows[0];

        const otpCode = crypto.randomInt(100000, 999999).toString();
        const otpExpires = new Date(Date.now() + 5 * 60 * 1000);

        await db.query('DELETE FROM otp_verifications WHERE email = $1', [email]);

        await db.query(
            `INSERT INTO otp_verifications (name, username, email, password, avatar, otp_code, expires_at) 
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [name, username, email, 'PASSWORD_CHANGE_PLACEHOLDER', avatar || null, otpCode, otpExpires]
        );

        const mailOptions = {
            from: `"${process.env.MAIL_FROM_NAME || 'App Name'}" <${process.env.MAIL_USERNAME}>`,
            to: email,
            subject: 'Kode OTP Perubahan Password',
            html: `
            <div style="background-color: transparent; padding: 32px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                <div style="max-width: 480px; margin: 0 auto; background-color: #182136; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 16px; padding: 32px; text-align: center; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                    
                    <h2 style="color: #ffffff; margin-top: 0; margin-bottom: 8px; font-size: 24px; font-weight: 600; letter-spacing: -0.5px;">
                        Perubahan Password
                    </h2>
                    
                    <p style="color: #94a3b8; font-size: 15px; margin-bottom: 24px;">
                        Halo ${name}, Anda sedang melakukan permintaan perubahan password akun. Gunakan kode OTP di bawah ini:
                    </p>

                    <div style="margin: 24px 0;">
                        <span style="display: inline-block; font-family: monospace; font-size: 32px; font-weight: 700; color: #ffffff; letter-spacing: 6px; background-color: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); padding: 12px 24px; border-radius: 12px;">
                            ${otpCode}
                        </span>
                    </div>

                    <p style="color: #64748b; font-size: 13px; margin-bottom: 0; margin-top: 24px;">
                        Kode ini berlaku selama <strong style="color: #cbd5e1;">5 menit</strong>.<br>
                        Jika Anda tidak meminta ini, segera amankan akun Anda.
                    </p>
                    
                </div>
            </div>
        `
        };

        await transporter.sendMail(mailOptions);

        res.status(200).json({
            success: true,
            message: 'Kode OTP telah dikirim ke email Anda.'
        });

    } catch (err) {
        console.error("Error pada passwordOtpRequest:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.updatePasswordWithOtp = async (req, res) => {
    try {
        const userId = req.user.id;
        const { oldPassword, newPassword, otpCode } = req.body;

        if (!oldPassword || !newPassword || !otpCode) {
            return res.status(400).json({ success: false, message: 'Semua field wajib diisi' });
        }

        const userQuery = await db.query('SELECT email, password FROM users WHERE id = $1', [userId]);
        if (userQuery.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
        }

        const user = userQuery.rows[0];

        const isMatch = await bcrypt.compare(oldPassword, user.password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Password lama yang Anda masukkan salah' });
        }

        const { rows: tempOtp } = await db.query(
            'SELECT * FROM otp_verifications WHERE email = $1',
            [user.email]
        );

        if (tempOtp.length === 0) {
            return res.status(400).json({ success: false, message: 'OTP tidak ditemukan. Silakan minta OTP baru' });
        }

        const otpData = tempOtp[0];

        if (new Date() > new Date(otpData.expires_at)) {
            return res.status(400).json({ success: false, message: 'Kode OTP telah kedaluwarsa' });
        }

        if (otpData.otp_code !== otpCode) {
            return res.status(400).json({ success: false, message: 'Kode OTP salah' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await db.query('BEGIN');

        await db.query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, userId]);
        await db.query('DELETE FROM otp_verifications WHERE email = $1', [user.email]);

        await db.query('COMMIT');

        await createNotification(
            userId,
            'Keamanan Akun',
            `Password akun Anda telah berhasil diubah.`,
            'security'
        );

        res.status(200).json({
            success: true,
            message: 'Password berhasil diperbarui!'
        });

    } catch (err) {
        await db.query('ROLLBACK');
        console.error("Error pada updatePasswordWithOtp:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email wajib diisi'
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        const userQuery = await db.query(
            `
            SELECT
                id,
                name,
                email,
                is_google_account
            FROM users
            WHERE email = $1
            `,
            [normalizedEmail]
        );

        if (userQuery.rows.length === 0) {
            return res.status(200).json({
                success: true,
                message: 'Jika email terdaftar, OTP akan dikirim'
            });
        }

        const user = userQuery.rows[0];

        if (user.is_google_account) {
            return res.status(403).json({
                success: false,
                message: 'Akun ini terhubung dengan Google Login. Pastikan akun Google Anda aman.'
            });
        }

        const otpCode = crypto.randomInt(100000, 999999).toString();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

        await db.query(
            'DELETE FROM password_resets WHERE email = $1',
            [normalizedEmail]
        );

        await db.query(
            `
            INSERT INTO password_resets
            (
                email,
                otp_code,
                expires_at
            )
            VALUES ($1, $2, $3)
            `,
            [normalizedEmail, otpCode, expiresAt]
        );

        await transporter.sendMail({
            from: `"${process.env.MAIL_FROM_NAME}" <${process.env.MAIL_USERNAME}>`,
            to: normalizedEmail,
            subject: 'Reset Password OTP',
            html: `
            <div style="background-color: transparent; padding: 32px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                <div style="max-width: 480px; margin: 0 auto; background-color: #182136; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 16px; padding: 32px; text-align: center; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                    
                    <h2 style="color: #ffffff; margin-top: 0; margin-bottom: 8px; font-size: 24px; font-weight: 600; letter-spacing: -0.5px;">
                        Reset Password
                    </h2>
                    
                    <p style="color: #94a3b8; font-size: 15px; margin-bottom: 24px;">
                        Halo ${user.name}, gunakan kode OTP di bawah ini untuk melanjutkan:
                    </p>

                    <div style="margin: 24px 0;">
                        <span style="display: inline-block; font-family: monospace; font-size: 32px; font-weight: 700; color: #ffffff; letter-spacing: 6px; background-color: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); padding: 12px 24px; border-radius: 12px;">
                            ${otpCode}
                        </span>
                    </div>

                    <p style="color: #64748b; font-size: 13px; margin-bottom: 0; margin-top: 24px;">
                        Kode ini hanya berlaku selama <strong style="color: #cbd5e1;">5 menit</strong>.<br>
                        Jika lu tidak meminta reset password, abaikan email ini.
                    </p>
                    
                </div>
            </div>
        `
        });

        return res.status(200).json({
            success: true,
            message: 'Jika email terdaftar, OTP akan dikirim'
        });

    } catch (err) {
        console.error(err);

        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

exports.resetPassword = async (req, res) => {
    try {
        const {
            resetToken,
            newPassword
        } = req.body;

        if (!resetToken || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Data tidak lengkap'
            });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({
                success: false,
                message: 'Password minimal 8 karakter'
            });
        }

        let decoded;

        try {
            decoded = jwt.verify(
                resetToken,
                process.env.JWT_SECRET
            );
        } catch {
            return res.status(401).json({
                success: false,
                message: 'Reset token tidak valid'
            });
        }

        if (decoded.type !== 'password_reset') {
            return res.status(401).json({
                success: false,
                message: 'Token tidak valid'
            });
        }

        const resetQuery = await db.query(
            `
            SELECT *
            FROM password_resets
            WHERE email = $1
            `,
            [decoded.email]
        );

        if (resetQuery.rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Reset session tidak ditemukan'
            });
        }

        const resetData = resetQuery.rows[0];

        if (!resetData.verified) {
            return res.status(401).json({
                success: false,
                message: 'OTP belum diverifikasi'
            });
        }

        const hashedPassword = await bcrypt.hash(
            newPassword,
            10
        );

        await db.query('BEGIN');

        await db.query(
            `
            UPDATE users
            SET password = $1
            WHERE email = $2
            `,
            [
                hashedPassword,
                decoded.email
            ]
        );

        await db.query(
            `
            DELETE FROM password_resets
            WHERE email = $1
            `,
            [decoded.email]
        );

        await db.query('COMMIT');

        return res.status(200).json({
            success: true,
            message: 'Password berhasil direset'
        });

    } catch (err) {
        await db.query('ROLLBACK');

        console.error(err);

        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

exports.verifyResetOtp = async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({
                success: false,
                message: 'Email dan OTP wajib diisi'
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        const result = await db.query(
            `
            SELECT *
            FROM password_resets
            WHERE email = $1
            `,
            [normalizedEmail]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'OTP tidak valid'
            });
        }

        const data = result.rows[0];

        if (new Date() > new Date(data.expires_at)) {
            return res.status(400).json({
                success: false,
                message: 'OTP kedaluwarsa'
            });
        }

        if (data.otp_code !== otp) {
            return res.status(400).json({
                success: false,
                message: 'OTP salah'
            });
        }

        await db.query(
            `
            UPDATE password_resets
            SET verified = true
            WHERE email = $1
            `,
            [normalizedEmail]
        );

        const resetToken = jwt.sign(
            {
                email: normalizedEmail,
                type: 'password_reset'
            },
            process.env.JWT_SECRET,
            {
                expiresIn: '10m'
            }
        );

        return res.status(200).json({
            success: true,
            resetToken
        });

    } catch (err) {
        console.error(err);

        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};