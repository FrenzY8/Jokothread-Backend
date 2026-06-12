const db = require('../config/db');

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