require('dotenv').config();

const express = require('express');
const cors = require('cors');
const db = require('./src/config/db');

const userRoutes = require('./src/routes/userRoute.js');
const postRoutes = require('./src/routes/postRoute.js');
const exploreRoutes = require('./src/routes/exploreRoutes.js');
const notificationRoute = require('./src/routes/notificationRoutes.js');
const messageRoute = require('./src/routes/messageRoutes.js');

const app = express();

const allowedOrigins = [
  'http://localhost:5173', // Local development URL
  'https://jokothread-frontend.vercel.app' // Production URL
];

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));

app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'API Running'
  });
});

app.use('/users', userRoutes);
app.use('/posts', postRoutes);
app.use('/explore', exploreRoutes);
app.use('/notifications', notificationRoute);
app.use('/messages', messageRoute);
app.get('/test', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT *
      FROM users
      ORDER BY created_at DESC
    `);

    res.status(200).json({
      success: true,
      message: 'Users table fetched successfully',
      total: result.rowCount,
      data: result.rows
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: 'Failed to fetch users table',
      error: err.message
    });
  }
});

app.listen(5000, () => {
  console.log("Ready to run on port 5000");
});