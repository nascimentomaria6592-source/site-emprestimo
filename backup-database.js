require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT),
    ssl: { rejectUnauthorized: false }
});

async function backupDatabase() {
    try {
        console.log('=== BACKUP DO BANCO DE DADOS ===\n');
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupDir = path.join(__dirname, 'backups');
        
        // Criar diretório de backups se não existir
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir);
        }
        
        console.log('📁 Diretório de backups:', backupDir);
        
        // Backup de usuários
        console.log('\n💾 Fazendo backup de usuários...');
        const usersResult = await pool.query('SELECT * FROM users ORDER BY id');
        const usersBackup = {
            timestamp: new Date().toISOString(),
            table: 'users',
            data: usersResult.rows
        };
        
        const usersFile = path.join(backupDir, `users-backup-${timestamp}.json`);
        fs.writeFileSync(usersFile, JSON.stringify(usersBackup, null, 2));
        console.log(`   ✅ Usuários salvos em: ${usersFile}`);
        
        // Backup de empréstimos
        console.log('\n💾 Fazendo backup de empréstimos...');
        const loansResult = await pool.query('SELECT * FROM loans ORDER BY id');
        const loansBackup = {
            timestamp: new Date().toISOString(),
            table: 'loans',
            data: loansResult.rows
        };
        
        const loansFile = path.join(backupDir, `loans-backup-${timestamp}.json`);
        fs.writeFileSync(loansFile, JSON.stringify(loansBackup, null, 2));
        console.log(`   ✅ Empréstimos salvos em: ${loansFile}`);
        
        // Backup de pagamentos
        console.log('\n💾 Fazendo backup de pagamentos...');
        const paymentsResult = await pool.query('SELECT * FROM payments ORDER BY id');
        const paymentsBackup = {
            timestamp: new Date().toISOString(),
            table: 'payments',
            data: paymentsResult.rows
        };
        
        const paymentsFile = path.join(backupDir, `payments-backup-${timestamp}.json`);
        fs.writeFileSync(paymentsFile, JSON.stringify(paymentsBackup, null, 2));
        console.log(`   ✅ Pagamentos salvos em: ${paymentsFile}`);
        
        console.log('\n🎉 Backup concluído com sucesso!');
        console.log('\n📋 Arquivos criados:');
        console.log(`   • ${usersFile}`);
        console.log(`   • ${loansFile}`);
        console.log(`   • ${paymentsFile}`);
        console.log('\n💡 Para restaurar, use os scripts de restore correspondentes.\n');
        
    } catch (err) {
        console.error('❌ Erro ao fazer backup:', err);
    } finally {
        await pool.end();
    }
}

backupDatabase();