const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');

// Rota para KPIs
router.get('/kpi', authMiddleware, (req, res) => {
    const db = req.db;
    const { start_date, end_date } = req.query;
    
    let whereClause = '';
    const params = [];
    
    if (start_date && end_date) {
        whereClause = 'WHERE loan_date BETWEEN ? AND ?';
        params.push(start_date, end_date);
    }
    
    const queries = [
        // Total emprestado no período
        {
            sql: `SELECT SUM(amount) as value FROM loans ${whereClause}`,
            key: 'total_loaned'
        },
        // Saldo devedor total
        {
            sql: `SELECT SUM(balance_due) as value FROM loans WHERE status != 'Pago' ${whereClause ? 'AND ' + whereClause.replace('WHERE', '') : ''}`,
            key: 'total_balance_due'
        },
        // Juros recebidos
        {
            sql: `SELECT SUM(interest_paid) as value FROM loans ${whereClause}`,
            key: 'total_interest'
        },
        // Quantidade de empréstimos ativos
        {
            sql: `SELECT COUNT(*) as value FROM loans WHERE status != 'Pago' ${whereClause ? 'AND ' + whereClause.replace('WHERE', '') : ''}`,
            key: 'active_loans'
        },
        // Número de atrasos
        {
            sql: `SELECT COUNT(*) as value FROM loans WHERE status = 'Atrasado' ${whereClause ? 'AND ' + whereClause.replace('WHERE', '') : ''}`,
            key: 'overdue_loans'
        }
    ];
    
    // Taxa de inadimplência
    const inadimplenciaQuery = `
        SELECT 
            (COUNT(CASE WHEN status = 'Atrasado' THEN 1 END) * 100.0 / COUNT(*)) as value
        FROM loans 
        ${whereClause}
    `;
    
    const promises = queries.map(q => {
        return new Promise((resolve, reject) => {
            db.get(q.sql, params, (err, row) => {
                if (err) reject(err);
                else resolve({ key: q.key, value: row.value || 0 });
            });
        });
    });
    
    promises.push(new Promise((resolve, reject) => {
        db.get(inadimplenciaQuery, params, (err, row) => {
            if (err) reject(err);
            else resolve({ key: 'default_rate', value: row.value || 0 });
        });
    }));
    
    Promise.all(promises)
        .then(results => {
            const kpi = {};
            results.forEach(result => {
                kpi[result.key] = result.value;
            });
            res.json(kpi);
        })
        .catch(err => {
            res.status(500).json({ error: err.message });
        });
});

// Rota para gráfico financeiro (emprestado vs pago por mês)
router.get('/financial', authMiddleware, (req, res) => {
    const db = req.db;
    const { start_date, end_date } = req.query;
    
    let query = `
        SELECT 
            strftime('%Y-%m', loan_date) as month,
            SUM(amount) as total_loaned,
            SUM(principal_paid) as total_paid
        FROM loans
    `;
    
    const params = [];
    if (start_date && end_date) {
        query += ` WHERE loan_date BETWEEN ? AND ?`;
        params.push(start_date, end_date);
    }
    
    query += ` GROUP BY strftime('%Y-%m', loan_date) ORDER BY month`;
    
    db.all(query, params, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// Rota para distribuição de empréstimos por status
router.get('/status-distribution', authMiddleware, (req, res) => {
    const db = req.db;
    const { start_date, end_date } = req.query;
    
    let query = `
        SELECT 
            status,
            COUNT(*) as count,
            SUM(amount) as total_amount
        FROM loans
    `;
    
    const params = [];
    if (start_date && end_date) {
        query += ` WHERE loan_date BETWEEN ? AND ?`;
        params.push(start_date, end_date);
    }
    
    query += ` GROUP BY status`;
    
    db.all(query, params, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// Rota para fluxo de caixa mensal
router.get('/cash-flow', authMiddleware, (req, res) => {
    const db = req.db;
    const { start_date, end_date } = req.query;
    
    // Consulta para saídas (empréstimos concedidos)
    let outflowsQuery = `
        SELECT 
            strftime('%Y-%m', loan_date) as month,
            SUM(amount) as total_outflow
        FROM loans
    `;
    
    const params = [];
    if (start_date && end_date) {
        outflowsQuery += ` WHERE loan_date BETWEEN ? AND ?`;
        params.push(start_date, end_date);
    }
    
    outflowsQuery += ` GROUP BY strftime('%Y-%m', loan_date)`;
    
    // Consulta para entradas (pagamentos recebidos)
    let inflowsQuery = `
        SELECT 
            strftime('%Y-%m', payment_date) as month,
            SUM(amount_paid) as total_inflow
        FROM payments
    `;
    
    const inflowsParams = [];
    if (start_date && end_date) {
        inflowsQuery += ` WHERE payment_date BETWEEN ? AND ?`;
        inflowsParams.push(start_date, end_date);
    }
    
    inflowsQuery += ` GROUP BY strftime('%Y-%m', payment_date)`;
    
    // Executar ambas as consultas
    Promise.all([
        new Promise((resolve, reject) => {
            db.all(outflowsQuery, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        }),
        new Promise((resolve, reject) => {
            db.all(inflowsQuery, inflowsParams, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        })
    ]).then(([outflows, inflows]) => {
        // Combinar resultados
        const months = new Set();
        outflows.forEach(item => months.add(item.month));
        inflows.forEach(item => months.add(item.month));
        
        const result = Array.from(months).sort().map(month => {
            const outflow = outflows.find(item => item.month === month) || { total_outflow: 0 };
            const inflow = inflows.find(item => item.month === month) || { total_inflow: 0 };
            
            return {
                month,
                total_outflow: outflow.total_outflow || 0,
                total_inflow: inflow.total_inflow || 0
            };
        });
        
        res.json(result);
    }).catch(err => {
        res.status(500).json({ error: err.message });
    });
});

// Rota para top 10 devedores
router.get('/top-debtors', authMiddleware, (req, res) => {
    const db = req.db;
    const { start_date, end_date } = req.query;
    
    let query = `
        SELECT 
            name,
            SUM(balance_due) as total_balance
        FROM loans
        WHERE status != 'Pago'
    `;
    
    const params = [];
    if (start_date && end_date) {
        query += ` AND loan_date BETWEEN ? AND ?`;
        params.push(start_date, end_date);
    }
    
    query += ` GROUP BY name ORDER BY total_balance DESC LIMIT 10`;
    
    db.all(query, params, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// Rota para empréstimos com vencimento em até 30 dias
router.get('/upcoming-due', authMiddleware, (req, res) => {
    const db = req.db;
    const { start_date, end_date } = req.query;
    
    let query = `
        SELECT 
            id,
            name,
            amount,
            balance_due,
            return_date,
            status
        FROM loans
        WHERE return_date BETWEEN date('now') AND date('now', '+30 days')
        AND status != 'Pago'
    `;
    
    const params = [];
    if (start_date && end_date) {
        query += ` AND loan_date BETWEEN ? AND ?`;
        params.push(start_date, end_date);
    }
    
    query += ` ORDER BY return_date`;
    
    db.all(query, params, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// Rota para empréstimos atrasados
router.get('/overdue', authMiddleware, (req, res) => {
    const db = req.db;
    const { start_date, end_date } = req.query;
    
    let query = `
        SELECT 
            id,
            name,
            amount,
            balance_due,
            return_date,
            (julianday(return_date) - julianday('now')) as days_overdue
        FROM loans
        WHERE return_date < date('now') AND status != 'Pago'
    `;
    
    const params = [];
    if (start_date && end_date) {
        query += ` AND loan_date BETWEEN ? AND ?`;
        params.push(start_date, end_date);
    }
    
    query += ` ORDER BY return_date`;
    
    db.all(query, params, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// Rota para histórico de pagamentos
router.get('/payment-history', authMiddleware, (req, res) => {
    const db = req.db;
    const { debtor_name, start_date, end_date } = req.query;
    
    let query = `
        SELECT 
            p.id,
            p.amount_paid,
            p.payment_date,
            p.description,
            l.name as debtor_name
        FROM payments p
        JOIN loans l ON p.loan_id = l.id
    `;
    
    const params = [];
    if (debtor_name) {
        query += ` WHERE l.name LIKE ?`;
        params.push(`%${debtor_name}%`);
    }
    
    if (start_date && end_date) {
        if (debtor_name) {
            query += ` AND p.payment_date BETWEEN ? AND ?`;
        } else {
            query += ` WHERE p.payment_date BETWEEN ? AND ?`;
        }
        params.push(start_date, end_date);
    }
    
    query += ` ORDER BY p.payment_date DESC`;
    
    db.all(query, params, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// Rota para resumo de juros recebidos
router.get('/interest-summary', authMiddleware, (req, res) => {
    const db = req.db;
    const { start_date, end_date } = req.query;
    
    let query = `
        SELECT 
            strftime('%Y-%m', payment_date) as month,
            SUM(amount_paid) as total_paid,
            SUM(l.amount_with_interest - l.amount) as total_interest
        FROM payments p
        JOIN loans l ON p.loan_id = l.id
    `;
    
    const params = [];
    if (start_date && end_date) {
        query += ` WHERE p.payment_date BETWEEN ? AND ?`;
        params.push(start_date, end_date);
    }
    
    query += ` GROUP BY strftime('%Y-%m', payment_date) ORDER BY month`;
    
    db.all(query, params, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

module.exports = router;