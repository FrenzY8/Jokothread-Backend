const db = require('../config/db');

exports.createPost = async (req, res) => {
  try {
    const { content, media_url } = req.body;
    const userId = req.user.id;

    if (!content && !media_url) {
      return res.status(400).json({
        success: false,
        message: 'Konten postingan tidak boleh kosong'
      });
    }

    const result = await db.query(
      'INSERT INTO posts (user_id, content, media_url) VALUES ($1, $2, $3) RETURNING id',
      [userId, content, media_url || null]
    );

    res.status(201).json({
      success: true,
      message: 'Postingan berhasil dibuat',
      postId: result.rows[0].id
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

exports.getAllPosts = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    const currentUserId = req.user?.id || 0;
    const userIdFilter = req.query.user_id || null;

    let query = `
      SELECT 
        posts.*, 
        users.name, 
        users.username, 
        users.avatar,
       EXISTS(SELECT 1 FROM post_likes WHERE post_likes.post_id = posts.id AND post_likes.user_id = $1) AS is_liked
      FROM posts
      JOIN users
        ON posts.user_id = users.id
      WHERE ($4::int IS NULL OR posts.user_id = $4)
      ORDER BY 
        CASE 
          WHEN posts.user_id = $1 AND posts.created_at > NOW() - INTERVAL '1 hour' THEN 0 
          ELSE 1 
        END ASC,
        md5(posts.id::text || $1::text) DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await db.query(query, [
      currentUserId,
      limit,
      offset,
      userIdFilter
    ]);

    const posts = result.rows;

    const nextCursor = posts.length === limit ? offset + limit : null;

    res.status(200).json({
      success: true,
      data: posts,
      nextCursor: nextCursor
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.toggleLike = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const userId = req.user.id;

    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: 'ID Postingan tidak valid' });
    }

    // 1. Cek apakah post ada
    const postCheck = await db.query('SELECT id FROM posts WHERE id = $1', [id]);
    if (postCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Postingan tidak ditemukan' });
    }

    // 2. Cek status like
    const likeCheck = await db.query(
      'SELECT id FROM post_likes WHERE user_id = $1 AND post_id = $2',
      [userId, id]
    );

    if (likeCheck.rows.length > 0) {
      // JIKA SUDAH DI-LIKE -> UNLIKE
      await db.query('DELETE FROM post_likes WHERE user_id = $1 AND post_id = $2', [userId, id]);

      // UPDATE: Kurangi jumlah likes_count di tabel posts (Gunakan COALESCE untuk amankan nilai NULL)
      await db.query('UPDATE posts SET likes_count = COALESCE(likes_count, 0) - 1 WHERE id = $1', [id]);

      return res.status(200).json({ success: true, message: 'Batal menyukai', isLiked: false });
    } else {
      // JIKA BELUM DI-LIKE -> LIKE
      await db.query('INSERT INTO post_likes (user_id, post_id) VALUES ($1, $2)', [userId, id]);

      // UPDATE: Tambah jumlah likes_count di tabel posts
      await db.query('UPDATE posts SET likes_count = COALESCE(likes_count, 0) + 1 WHERE id = $1', [id]);

      return res.status(200).json({ success: true, message: 'Menyukai', isLiked: true });
    }

  } catch (err) {
    console.error("Error toggleLike:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getRepliesByPostId = async (req, res) => {
  try {
    const postId = req.params.id;

    const result = await db.query(
      `
            SELECT
                post_replies.*,
                users.id AS user_id,
                users.username,
                users.name,
                users.avatar
            FROM post_replies
            JOIN users
                ON users.id = post_replies.user_id
            WHERE post_replies.post_id = $1
            ORDER BY post_replies.created_at ASC
            `,
      [postId]
    );

    res.status(200).json({
      success: true,
      data: result.rows
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

exports.getRepliesCount = async (req, res) => {
  try {
    const postId = req.params.id;

    const result = await db.query(
      `
            SELECT COUNT(*)::int AS count
            FROM post_replies
            WHERE post_id = $1
            `,
      [postId]
    );

    res.json({
      success: true,
      count: result.rows[0].count
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

exports.createReply = async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user.id;

    const {
      content,
      media_url,
      parent_reply_id
    } = req.body;

    if (!content && !media_url) {
      return res.status(400).json({
        success: false,
        message: 'Komentar tidak boleh kosong'
      });
    }

    const postCheck = await db.query(
      'SELECT id FROM posts WHERE id = $1',
      [postId]
    );

    if (postCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Postingan tidak ditemukan'
      });
    }

    const result = await db.query(
      `
            INSERT INTO post_replies
            (
                post_id,
                user_id,
                content,
                media_url,
                parent_reply_id
            )
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id
            `,
      [
        postId,
        userId,
        content || null,
        media_url || null,
        parent_reply_id || null
      ]
    );

    await db.query(
      `
            UPDATE posts
            SET replies_count = COALESCE(replies_count, 0) + 1
            WHERE id = $1
            `,
      [postId]
    );

    res.status(201).json({
      success: true,
      message: 'Komentar berhasil dibuat',
      replyId: result.rows[0].id
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

exports.getPostById = async (req, res) => {
  try {
    const postId = req.params.id;
    const currentUserId = req.user?.id || 0;

    const result = await db.query(
      `
      SELECT
          posts.*,
          users.id AS user_id,
          users.username,
          users.name,
          users.avatar,
          -- Gunakan EXISTS langsung tanpa casting UUID karena ID kamu tipe data Integer
          EXISTS (
              SELECT 1 FROM post_likes 
              WHERE post_likes.post_id = posts.id AND post_likes.user_id = $2
          ) AS is_liked
      FROM posts
      JOIN users
          ON users.id = posts.user_id
      WHERE posts.id = $1
      LIMIT 1
      `,
      [postId, currentUserId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Postingan tidak ditemukan'
      });
    }

    res.status(200).json({
      success: true,
      data: result.rows[0]
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

exports.deletePost = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await db.query(
      'SELECT * FROM posts WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Postingan tidak ditemukan'
      });
    }

    const post = result.rows[0];

    if (post.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Anda tidak berhak menghapus postingan ini'
      });
    }

    await db.query(
      'DELETE FROM posts WHERE id = $1',
      [id]
    );

    res.status(200).json({
      success: true,
      message: 'Postingan berhasil dihapus'
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

exports.getExploreSuggestions = async (req, res) => {
  try {
    const usersResult = await db.query(`
      SELECT
        id,
        name,
        username,
        avatar,
        followers_count,
        following_count
      FROM users
      ORDER BY followers_count DESC, following_count DESC
      LIMIT 8
    `);

    const threadsResult = await db.query(`
      SELECT
        posts.*,
        users.name,
        users.username,
        users.avatar,
        (
          COALESCE(posts.likes_count, 0) * 3 +
          COALESCE(posts.replies_count, 0) * 2
        ) AS engagement_score
      FROM posts
      JOIN users
        ON users.id = posts.user_id
      ORDER BY engagement_score DESC, posts.created_at DESC
      LIMIT 8
    `);

    res.status(200).json({
      success: true,
      users: usersResult.rows,
      threads: threadsResult.rows
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

exports.searchAll = async (req, res) => {
  try {
    const q = req.query.q?.trim();
    const id = parseInt(req.params.id);

    if (!q) {
      return res.status(400).json({
        success: false,
        message: 'Query kosong'
      });
    }

    const currentUserId = req.user?.id || 0;

    const usersResult = await db.query(
      `
      SELECT 
        id, 
        name, 
        username, 
        avatar, 
        bio, 
        followers_count
      FROM users 
      WHERE 
        name ILIKE $1 
        OR username ILIKE $1
      ORDER BY followers_count DESC
      LIMIT 10
      `,
      [`%${q}%`]
    );

    const postsResult = await db.query(
      `
      SELECT 
        posts.*,
        users.name,
        users.username,
        users.avatar,
        EXISTS(
          SELECT 1 
          FROM post_likes 
          WHERE post_likes.post_id = posts.id 
          AND post_likes.user_id = $2
        ) AS "is_liked" 
      FROM posts
      JOIN users 
        ON users.id = posts.user_id
      WHERE 
        posts.content ILIKE $1
      ORDER BY posts.created_at DESC
      LIMIT 15
      `,
      [`%${q}%`, currentUserId]
    );

    res.status(200).json({
      success: true,
      users: usersResult.rows,
      threads: postsResult.rows
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};