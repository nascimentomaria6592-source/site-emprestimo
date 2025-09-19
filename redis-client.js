const redis = require('redis');

// Create a Redis client
const redisClient = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => {
  console.error('Redis Client Error:', err);
});

redisClient.on('connect', () => {
  console.log('Conectado ao Redis com sucesso.');
});

// Connect the client
// Using an async IIFE to connect and handle potential errors on startup
(async () => {
  try {
    await redisClient.connect();
  } catch (err) {
    console.error('Falha ao conectar com o Redis:', err);
  }
})();

module.exports = redisClient;
