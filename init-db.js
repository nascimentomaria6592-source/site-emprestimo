const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');

const dbPath = path.resolve(__dirname, './database/db.sqlite3');
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir);
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) return console.error('Erro ao abrir o banco de dados:', err.message);
  
  console.log('Banco de dados conectado para inicialização.');
  db.serialize(() => {
    // Tabela de Empréstimos (MODIFICADA)
    db.run(`
      CREATE TABLE IF NOT EXISTS loans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        cpf TEXT,
        phone TEXT,
        address_street TEXT,
        address_cep TEXT,
        address_bairro TEXT,
        address_city TEXT,
        amount REAL NOT NULL,
        amount_with_interest REAL NOT NULL,
        balance_due REAL NOT NULL, -- NOVO: Saldo devedor
        interest_paid REAL NOT NULL DEFAULT 0,
        principal_paid REAL NOT NULL DEFAULT 0,
        loan_date TEXT NOT NULL,
        return_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Pendente', -- Novos status: Pendente, Parcialmente Pago, Pago
        attachment_path TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
        if (err) console.error('Erro ao criar tabela loans:', err.message);
        else console.log('Tabela loans verificada/criada.');
    });

    // NOVA Tabela de Pagamentos
    db.run(`
      CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        loan_id INTEGER NOT NULL,
        amount_paid REAL NOT NULL,
        payment_date TEXT NOT NULL,
        description TEXT,
        attachment_path TEXT,
        FOREIGN KEY (loan_id) REFERENCES loans (id)
      )
    `, (err) => {
        if (err) console.error('Erro ao criar tabela payments:', err.message);
        else console.log('Tabela payments verificada/criada.');
    });

    // Tabela de Usuários (sem alteração)
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        must_change_password INTEGER DEFAULT 1
      )
    `, (err) => {
        if (err) console.error('Erro ao criar tabela users:', err.message);
        else console.log('Tabela users verificada/criada.');
    });
    
    // Inserir usuários iniciais
    db.get("SELECT COUNT(*) AS count FROM users", (err, row) => {
      if (row && row.count === 0) {
        console.log('Inserindo usuários iniciais...');
        const users = ['Gustavo', 'Julio', 'Kassandra'];
        const defaultPassword = '123456';
        
        bcrypt.hash(defaultPassword, 10, (err, hashedPassword) => {
          if (err) return console.error('Erro ao gerar hash da senha:', err);
          const stmt = db.prepare("INSERT INTO users (username, password, must_change_password) VALUES (?, ?, 1)");
          users.forEach(user => stmt.run(user, hashedPassword));
          stmt.finalize((err) => {
            if (err) console.error("Erro ao inserir usuários:", err.message);
            else console.log('Usuários iniciais criados com sucesso.');
            closeDb();
          });
        });
      } else {
        console.log('Tabela users já contém registros.');
        closeDb();
      }
    });
  });
});

function closeDb() {
  db.close((err) => {
    if (err) console.error('Erro ao fechar o banco de dados:', err.message);
    else console.log('Inicialização do DB finalizada. Banco de dados fechado.');
  });
}