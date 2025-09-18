require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');

const loanRoutes = require('./routes/loans');
const authRoutes = require('./routes/auth');
const authMiddleware = require('./middleware/auth');
const reportsRoutes = require('./routes/reports');

const app = express();
const port = process.env.PORT || 3000;

// Configuração do Pool de Conexão PostgreSQL com opções de reconexão
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT),
    ssl: { rejectUnauthorized: false },
    max: 10, // máximo de conexões no pool
    idleTimeoutMillis: 30000, // tempo máximo que uma conexão pode ficar ociosa
    connectionTimeoutMillis: 2000, // tempo máximo para estabelecer uma conexão
});

// Aumentar o limite de listeners para evitar o aviso
pool.setMaxListeners(20);

// Testar conexão inicial
pool.connect((err) => {
    if (err) {
        console.error('Erro detalhado ao conectar ao banco de dados:', err);
    } else {
        console.log('Conectado ao banco de dados PostgreSQL.');
    }
});

// Middleware para lidar com erros de conexão
app.use((req, res, next) => {
    // Adicionar o pool ao objeto req
    req.db = pool;
    
    // Listener para erros de conexão
    pool.on('error', (err) => {
        console.error('Erro inesperado no pool de conexões:', err);
        // Tentar reconectar após um erro
        if (err.code === 'CONNECTION_ERROR') {
            console.log('Tentando reconectar ao banco de dados...');
            setTimeout(() => {
                pool.connect((err) => {
                    if (err) {
                        console.error('Falha ao reconectar:', err.message);
                    } else {
                        console.log('Reconectado com sucesso!');
                    }
                });
            }, 5000);
        }
    });
    
    next();
});

// Middleware para verificar se a conexão está ativa antes de processar requisições
app.use('/api', (req, res, next) => {
    // Verificar se o pool está saudável
    pool.query('SELECT NOW()', (err) => {
        if (err) {
            console.error('Erro ao verificar conexão com o banco:', err);
            return res.status(503).json({ error: 'Serviço de banco de dados indisponível' });
        }
        next();
    });
});

// Configuração do Helmet com CSP personalizado
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:"],
            fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
            connectSrc: ["'self'", "ws:", "wss:"],
        },
    },
    originAgentCluster: false,
    crossOriginOpenerPolicy: false,
}));

app.use(cors());
app.use(express.json());

// Middleware para logar requisições
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
    next();
});

// Servir arquivos estáticos com proteção básica
app.use(express.static('public'));
app.use('/public/uploads', express.static(path.join(__dirname, 'public/uploads'), {
    setHeaders: (res, path) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        if (path.endsWith('.pdf')) {
            res.setHeader('Content-Disposition', 'attachment');
        }
    }
}));

// Rotas
app.use('/api/auth', authRoutes);

// Rota pública para empréstimos atrasados
app.get('/api/loans/atrasados', (req, res) => {
    const query = `
        SELECT *, 
               (CURRENT_DATE - return_date) AS dias_atraso
        FROM loans 
        WHERE return_date < CURRENT_DATE AND status != 'Pago'
        ORDER BY return_date ASC
    `;
    
    pool.query(query, (err, result) => {
        if (err) {
            console.error('Erro ao buscar empréstimos atrasados:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json(result.rows);
    });
});

// Rotas protegidas
app.use('/api/loans', authMiddleware, loanRoutes);
app.use('/api/reports', authMiddleware, reportsRoutes);

// Rotas de página
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Rota catch-all
app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
        return res.status(404).send('API endpoint not found');
    }
    res.redirect('/');
});

// Middleware para tratar erros de upload
app.use((err, req, res, next) => {
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Arquivo muito grande. Tamanho máximo: 5MB' });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({ error: 'Formato de requisição inválido' });
    }
    if (err.message === 'Tipo de arquivo não permitido. Apenas JPG, PNG e PDF são aceitos.') {
        return res.status(400).json({ error: err.message });
    }
    console.error('Erro não tratado:', err);
    return res.status(500).json({ error: 'Erro interno do servidor' });
});

// Middleware para tratamento global de erros
app.use((err, req, res, next) => {
    console.error('Erro não tratado:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
});

// Iniciar o servidor
app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
});

// Lidar com encerramento gracioso do aplicativo
process.on('SIGINT', () => {
    console.log('Recebido SIGINT. Encerrando aplicação...');
    pool.end(() => {
        console.log('Pool de conexões encerrado.');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('Recebido SIGTERM. Encerrando aplicação...');
    pool.end(() => {
        console.log('Pool de conexões encerrado.');
        process.exit(0);
    });
});