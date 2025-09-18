require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT),
    ssl: { rejectUnauthorized: false }
});

async function resetDatabase() {
    try {
        console.log('=== RESET COMPLETO DO BANCO DE DADOS ===\n');
        
        // Perguntar confirmação
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        const answer = await new Promise(resolve => {
            rl.question('⚠️  ATENÇÃO: Isso irá APAGAR TODOS OS DADOS (empréstimos, pagamentos, usuários). Continuar? (s/N): ', resolve);
        });
        
        rl.close();
        
        if (answer.toLowerCase() !== 's') {
            console.log('❌ Operação cancelada pelo usuário.\n');
            return;
        }
        
        console.log('🔄 Apagando tabelas existentes...');
        
        // Apagar tabelas em ordem reversa para respeitar chaves estrangeiras
        await pool.query('DROP TABLE IF EXISTS payments');
        await pool.query('DROP TABLE IF EXISTS loans');
        await pool.query('DROP TABLE IF EXISTS users');
        
        console.log('📝 Recriando tabelas...');
        
        // Tabela de Usuários
        await pool.query(`
            CREATE TABLE users (
                id SERIAL PRIMARY KEY,
                username TEXT NOT NULL UNIQUE,
                password TEXT NOT NULL,
                must_change_password BOOLEAN DEFAULT true
            )
        `);
        console.log('   ✅ Tabela "users" criada');
        
        // Tabela de Empréstimos
        await pool.query(`
            CREATE TABLE loans (
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
        console.log('   ✅ Tabela "loans" criada');
        
        // Tabela de Pagamentos
        await pool.query(`
            CREATE TABLE payments (
                id SERIAL PRIMARY KEY,
                loan_id INTEGER NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
                amount_paid DECIMAL(10,2) NOT NULL,
                payment_date DATE NOT NULL,
                description TEXT,
                attachment_path TEXT
            )
        `);
        console.log('   ✅ Tabela "payments" criada');
        
        // Criar índices para melhor performance
        await pool.query('CREATE INDEX idx_loans_status ON loans(status)');
        await pool.query('CREATE INDEX idx_loans_return_date ON loans(return_date)');
        await pool.query('CREATE INDEX idx_payments_loan_id ON payments(loan_id)');
        console.log('   ✅ Índices criados');
        
        console.log('\n📝 Criando usuários padrão...');
        const users = ['Gustavo', 'Julio', 'Kassandra'];
        const defaultPassword = '123456';
        const hashedPassword = await bcrypt.hash(defaultPassword, 10);
        
        for (const username of users) {
            await pool.query(
                'INSERT INTO users (username, password, must_change_password) VALUES ($1, $2, true)',
                [username, hashedPassword]
            );
            console.log(`   ✅ Usuário "${username}" criado`);
        }
        
        console.log('\n🎉 Banco de dados resetado com sucesso!');
        console.log('\n📋 Resumo:');
        console.log('   • Todas as tabelas foram recriadas vazias');
        console.log('   • Usuários padrão foram criados');
        console.log('   • Índices foram criados para melhor performance');
        console.log('\n📋 Credenciais de acesso iniciais:');
        users.forEach((user, index) => {
            console.log(`   ${index + 1}. Usuário: ${user} | Senha: 123456`);
        });
        console.log('\n💡 Todos os usuários precisarão trocar a senha no primeiro login.\n');
        
    } catch (err) {
        console.error('❌ Erro ao resetar banco de dados:', err);
    } finally {
        await pool.end();
    }
}

resetDatabase();