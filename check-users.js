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

async function checkUsers() {
    try {
        console.log('=== VERIFICANDO USUÁRIOS ===\n');
        
        const result = await pool.query('SELECT * FROM users ORDER BY id');
        const users = result.rows;
        
        if (users.length === 0) {
            console.log('❌ Nenhum usuário encontrado no banco de dados.');
            return;
        }
        
        console.log(`📋 Encontrados ${users.length} usuário(s):`);
        console.log('─'.repeat(60));
        
        for (const user of users) {
            console.log(`\n👤 Usuário #${user.id}:`);
            console.log(`   Nome: ${user.username}`);
            console.log(`   Deve trocar senha: ${user.must_change_password ? 'Sim' : 'Não'}`);
            console.log(`   Senha (hash): ${user.password.substring(0, 20)}...`);
            
            // Testar senha padrão
            const isDefaultPassword = await bcrypt.compare('123456', user.password);
            console.log(`   Senha "123456" é válida: ${isDefaultPassword ? 'Sim' : 'Não'}`);
        }
        
        console.log('\n─'.repeat(60));
        console.log('✅ Verificação concluída.\n');
        
    } catch (err) {
        console.error('❌ Erro ao verificar usuários:', err);
    } finally {
        await pool.end();
    }
}

checkUsers();