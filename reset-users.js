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

async function resetUsers() {
    try {
        console.log('=== RESETANDO USUÁRIOS ===\n');
        
        // Perguntar confirmação
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        const answer = await new Promise(resolve => {
            rl.question('⚠️  ATENÇÃO: Isso irá apagar TODOS os usuários e recriá-los. Continuar? (s/N): ', resolve);
        });
        
        rl.close();
        
        if (answer.toLowerCase() !== 's') {
            console.log('❌ Operação cancelada pelo usuário.\n');
            return;
        }
        
        console.log('🔄 Apagando usuários existentes...');
        await pool.query('DELETE FROM users');
        
        console.log('📝 Criando usuários padrão...');
        const users = ['Gustavo', 'Julio', 'Kassandra'];
        const defaultPassword = '123456';
        const hashedPassword = await bcrypt.hash(defaultPassword, 10);
        
        for (const username of users) {
            await pool.query(
                'INSERT INTO users (username, password, must_change_password) VALUES ($1, $2, true)',
                [username, hashedPassword]
            );
            console.log(`   ✅ Usuário "${username}" criado com senha "123456"`);
        }
        
        console.log('\n🎉 Usuários resetados com sucesso!');
        console.log('\n📋 Credenciais de acesso:');
        users.forEach((user, index) => {
            console.log(`   ${index + 1}. Usuário: ${user} | Senha: 123456`);
        });
        console.log('\n💡 Todos os usuários precisarão trocar a senha no primeiro login.\n');
        
    } catch (err) {
        console.error('❌ Erro ao resetar usuários:', err);
    } finally {
        await pool.end();
    }
}

resetUsers();