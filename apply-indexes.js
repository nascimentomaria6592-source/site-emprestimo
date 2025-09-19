const { Pool } = require('pg');
require('dotenv').config();

// Ensure the DATABASE_URL is loaded from .env for local execution
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const applyIndexes = async () => {
  const client = await pool.connect();
  console.log('Conectado ao banco de dados para aplicar índices...');

  const indexes = {
    'idx_loans_status': 'ON loans(status)',
    'idx_loans_return_date': 'ON loans(return_date)',
    'idx_loans_loan_date': 'ON loans(loan_date)',
    'idx_loans_name': 'ON loans(name)' // For LIKE searches, a btree index is still helpful
  };

  try {
    for (const [indexName, tableDef] of Object.entries(indexes)) {
      const query = `CREATE INDEX IF NOT EXISTS ${indexName} ${tableDef};`;
      console.log(`Executando: ${query}`);
      await client.query(query);
    }
    console.log('Índices aplicados com sucesso!');
  } catch (error) {
    console.error('Ocorreu um erro ao aplicar os índices:', error);
  } finally {
    console.log('Desconectando do banco de dados.');
    await client.release();
    await pool.end();
  }
};

applyIndexes();
