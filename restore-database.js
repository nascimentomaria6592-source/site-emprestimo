require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT),
    ssl: { rejectUnauthorized: false }
});

async function restoreDatabase() {
    try {
        console.log('=== RESTAURAÇÃO DO BANCO DE DADOS ===\n');
        
        const backupDir = path.join(__dirname, 'backups');
        
        if (!fs.existsSync(backupDir)) {
            console.log('❌ Diretório de backups não encontrado.');
            return;
        }
        
        // Listar backups disponíveis
        const files = fs.readdirSync(backupDir);
        const backupFiles = files.filter(file => file.endsWith('.json'));
        
        if (backupFiles.length === 0) {
            console.log('❌ Nenhum arquivo de backup encontrado.');
            return;
        }
        
        console.log('📁 Backups disponíveis:');
        backupFiles.forEach((file, index) => {
            console.log(`   ${index + 1}. ${file}`);
        });
        
        // Perguntar qual backup restaurar
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        const fileIndex = await new Promise(resolve => {
            rl.question('\n📝 Digite o número do backup que deseja restaurar: ', resolve);
        });
        
        rl.close();
        
        const selectedIndex = parseInt(fileIndex) - 1;
        if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= backupFiles.length) {
            console.log('❌ Opção inválida.');
            return;
        }
        
        const selectedFile = backupFiles[selectedIndex];
        const filePath = path.join(backupDir, selectedFile);
        
        console.log(`\n🔄 Restaurando backup: ${selectedFile}`);
        
        // Carregar backup
        const backupData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        // Perguntar confirmação
        const rl2 = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        const confirm = await new Promise(resolve => {
            rl2.question('⚠️  ATENÇÃO: Isso irá substituir todos os dados atuais. Continuar? (s/N): ', resolve);
        });
        
        rl2.close();
        
        if (confirm.toLowerCase() !== 's') {
            console.log('❌ Operação cancelada pelo usuário.\n');
            return;
        }
        
        // Limpar tabelas
        console.log('🔄 Limpando tabelas...');
        await pool.query('DELETE FROM payments');
        await pool.query('DELETE FROM loans');
        await pool.query('DELETE FROM users');
        
        // Restaurar dados
        switch (backupData.table) {
            case 'users':
                console.log('\n📝 Restaurando usuários...');
                for (const user of backupData.data) {
                    await pool.query(
                        'INSERT INTO users (id, username, password, must_change_password) VALUES ($1, $2, $3, $4)',
                        [user.id, user.username, user.password, user.must_change_password]
                    );
                }
                console.log(`   ✅ ${backupData.data.length} usuários restaurados`);
                break;
                
            case 'loans':
                console.log('\n📝 Restaurando empréstimos...');
                for (const loan of backupData.data) {
                    await pool.query(
                        `INSERT INTO loans (
                            id, name, cpf, phone, address_street, address_cep, address_bairro, address_city,
                            amount, amount_with_interest, balance_due, interest_paid, principal_paid,
                            loan_date, return_date, status, attachment_path, created_at
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
                        [
                            loan.id, loan.name, loan.cpf, loan.phone, loan.address_street, loan.address_cep,
                            loan.address_bairro, loan.address_city, loan.amount, loan.amount_with_interest,
                            loan.balance_due, loan.interest_paid, loan.principal_paid, loan.loan_date,
                            loan.return_date, loan.status, loan.attachment_path, loan.created_at
                        ]
                    );
                }
                console.log(`   ✅ ${backupData.data.length} empréstimos restaurados`);
                break;
                
            case 'payments':
                console.log('\n📝 Restaurando pagamentos...');
                for (const payment of backupData.data) {
                    await pool.query(
                        'INSERT INTO payments (id, loan_id, amount_paid, payment_date, description, attachment_path) VALUES ($1, $2, $3, $4, $5, $6)',
                        [payment.id, payment.loan_id, payment.amount_paid, payment.payment_date, payment.description, payment.attachment_path]
                    );
                }
                console.log(`   ✅ ${backupData.data.length} pagamentos restaurados`);
                break;
        }
        
        console.log('\n🎉 Restauração concluída com sucesso!\n');
        
    } catch (err) {
        console.error('❌ Erro ao restaurar banco de dados:', err);
    } finally {
        await pool.end();
    }
}

restoreDatabase();