require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

// Verificar se todas as variáveis necessárias existem
const requiredEnvVars = ['DB_USER', 'DB_HOST', 'DB_PORT', 'DB_DATABASE', 'DB_PASSWORD'];
for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        console.error(`ERRO: Variável ${envVar} não encontrada no arquivo .env`);
        process.exit(1);
    }
}

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT),
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

async function initializeDatabase() {
    let client;
    try {
        console.log('Conectando ao banco de dados...');
        console.log(`Host: ${process.env.DB_HOST}:${process.env.DB_PORT}`);
        console.log(`Usuário: ${process.env.DB_USER}`);
        console.log(`Banco: ${process.env.DB_DATABASE}`);
        
        client = await pool.connect();
        console.log('✅ Conexão estabelecida com sucesso!');
        
        console.log('\nIniciando criação das tabelas...');
        
        // Tabela de Empréstimos
        await client.query(`
            CREATE TABLE IF NOT EXISTS loans (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                cpf TEXT,
                phone TEXT,
                address_street TEXT,
                address_cep TEXT,
                address_bairro TEXT,
                address_city TEXT,
                amount DECIMAL(10,2) NOT NULL,
                amount_with_interest DECIMAL(10,2) NOT NULL,
                balance_due DECIMAL(10,2) NOT NULL,
                interest_paid DECIMAL(10,2) NOT NULL DEFAULT 0,
                principal_paid DECIMAL(10,2) NOT NULL DEFAULT 0,
                loan_date DATE NOT NULL,
                return_date DATE NOT NULL,
                status TEXT NOT NULL DEFAULT 'Pendente',
                attachment_path TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✓ Tabela loans criada com sucesso.');

        // Tabela de Pagamentos
        await client.query(`
            CREATE TABLE IF NOT EXISTS payments (
                id SERIAL PRIMARY KEY,
                loan_id INTEGER NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
                amount_paid DECIMAL(10,2) NOT NULL,
                payment_date DATE NOT NULL,
                description TEXT,
                attachment_path TEXT
            )
        `);
        console.log('✓ Tabela payments criada com sucesso.');

        // Tabela de Usuários
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT NOT NULL UNIQUE,
                password TEXT NOT NULL,
                must_change_password BOOLEAN DEFAULT true
            )
        `);
        console.log('✓ Tabela users criada com sucesso.');
        
        // Verificar se já existem usuários
        const userCount = await client.query('SELECT COUNT(*) FROM users');
        if (userCount.rows[0].count === 0) {
            console.log('Inserindo usuários iniciais...');
            const users = ['Gustavo', 'Julio', 'Kassandra'];
            const defaultPassword = '123456';
            
            const hashedPassword = await bcrypt.hash(defaultPassword, 10);
            
            for (const user of users) {
                await client.query(
                    'INSERT INTO users (username, password, must_change_password) VALUES ($1, $2, true)',
                    [user, hashedPassword]
                );
            }
            console.log('✓ Usuários iniciais criados com sucesso.');
        } else {
            console.log('Tabela users já contém registros.');
        }
        
        // Criar índices para melhor performance
        await client.query('CREATE INDEX IF NOT EXISTS idx_loans_status ON loans(status)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_loans_return_date ON loans(return_date)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_payments_loan_id ON payments(loan_id)');
        console.log('✓ Índices criados com sucesso.');
        
        console.log('\n🎉 Banco de dados inicializado com sucesso!');
        
    } catch (err) {
        console.error('❌ Erro ao inicializar banco de dados:', err);
    } finally {
        if (client) client.release();
        await pool.end();
        console.log('Conexão com o banco de dados encerrada.');
    }
}

initializeDatabase();