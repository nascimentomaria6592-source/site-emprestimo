const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');

const loanRoutes = require('./routes/loans');
const authRoutes = require('./routes/auth');
const authMiddleware = require('./middleware/auth');
const reportsRoutes = require('./routes/reports');

const app = express();
const port = process.env.PORT || 3000;

const db = new sqlite3.Database('./database/db.sqlite3', (err) => {
  if (err) console.error('Erro ao conectar ao banco de dados:', err.message);
  else console.log('Conectado ao banco de dados SQLite.');
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
}));

app.use(cors());
app.use(express.json());

// Middleware para logar requisições (opcional)
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
  next();
});

// Servir arquivos estáticos com proteção básica
app.use(express.static('public'));
app.use('/public/uploads', express.static(path.join(__dirname, 'public/uploads'), {
  setHeaders: (res, path) => {
    // Prevenir que os arquivos sejam embutidos em iframes de outros sites
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Prevenir que os arquivos sejam abertos diretamente no navegador (para PDFs)
    if (path.endsWith('.pdf')) {
      res.setHeader('Content-Disposition', 'attachment');
    }
  }
}));

app.use((req, res, next) => {
  req.db = db;
  next();
});

// Rotas
app.use('/api/auth', authRoutes);

// Rota pública para empréstimos atrasados
app.get('/api/loans/atrasados', (req, res) => {
    const db = req.db;
    const query = `
        SELECT *, 
               (julianday(return_date) - julianday('now')) AS dias_atraso
        FROM loans 
        WHERE return_date < date('now') AND status != 'Pago'
        ORDER BY return_date ASC
    `;
    
    db.all(query, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
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
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Arquivo muito grande. Tamanho máximo: 5MB' });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ error: 'Formato de requisição inválido' });
    }
  } else if (err) {
    // Erro personalizado do fileFilter
    if (err.message === 'Tipo de arquivo não permitido. Apenas JPG, PNG e PDF são aceitos.') {
      return res.status(400).json({ error: err.message });
    }
    // Outros erros
    console.error('Erro não tratado:', err);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
  next();
});

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});

// Rotas de relatórios
