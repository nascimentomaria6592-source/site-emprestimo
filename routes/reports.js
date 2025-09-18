const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');

router.get('/kpi', authMiddleware, (req, res) => {
    const db = req.db;
    const { start_date, end_date } = req.query;
    
    let whereClause = '';
    const params = [];
    
    if (start_date && end_date) {
        whereClause = 'WHERE loan_date BETWEEN $1 AND $2';
        params.push(start_date, end_date);
    }
    
    const queries = [
        // Total emprestado no período
        {
            sql: `SELECT COALESCE(CAST(SUM(amount) AS DECIMAL(10,2)), 0) AS total FROM loans ${whereClause}`,
            key: 'total_loaned'
        },
        // Saldo devedor total
        {
            sql: `SELECT COALESCE(CAST(SUM(balance_due) AS DECIMAL(10,2)), 0) AS total FROM loans WHERE status != 'Pago' ${whereClause ? 'AND ' + whereClause.replace('WHERE', '') : ''}`,
            key: 'total_balance_due'
        },
        // Juros recebidos
        {
            sql: `SELECT COALESCE(CAST(SUM(interest_paid) AS DECIMAL(10,2)), 0) AS total FROM loans ${whereClause}`,
            key: 'total_interest'
        },
        // Quantidade de empréstimos ativos
        {
            sql: `SELECT COALESCE(COUNT(*), 0) AS total FROM loans WHERE status != 'Pago' ${whereClause ? 'AND ' + whereClause.replace('WHERE', '') : ''}`,
            key: 'active_loans'
        },
        // Número de atrasos
        {
            sql: `SELECT COALESCE(COUNT(*), 0) AS total FROM loans WHERE status = 'Atrasado' ${whereClause ? 'AND ' + whereClause.replace('WHERE', '') : ''}`,
            key: 'overdue_loans'
        }
    ];
    
    // Taxa de inadimplência - corrigida para evitar divisão por zero
    const inadimplenciaQuery = `
        SELECT 
            CASE 
                WHEN COUNT(*) = 0 THEN 0 
                ELSE ROUND((COALESCE(COUNT(CASE WHEN status = 'Atrasado' THEN 1 END), 0) * 100.0 / COUNT(*)), 2)
            END as value
        FROM loans 
        ${whereClause}
    `;
    
    const promises = queries.map(q => {
        return new Promise((resolve, reject) => {
            db.query(q.sql, params, (err, row) => {
                if (err) {
                    console.error(`Erro na query ${q.key}:`, err);
                    reject(err);
                } else {
                    // Garantir que os valores numéricos sejam números
                    let value = row.rows[0]?.total || row.rows[0]?.value || 0;
                    if (q.key !== 'active_loans' && q.key !== 'overdue_loans') {
                        value = parseFloat(value) || 0;
                    } else {
                        value = parseInt(value) || 0;
                    }
                    resolve({ key: q.key, value: value });
                }
            });
        });
    });
    
    promises.push(new Promise((resolve, reject) => {
        db.query(inadimplenciaQuery, params, (err, row) => {
            if (err) {
                console.error('Erro na query de inadimplência:', err);
                reject(err);
            } else {
                // Garantir que a taxa seja um número
                let value = parseFloat(row.rows[0]?.value) || 0;
                resolve({ key: 'default_rate', value: value });
            }
        });
    }));
    
    Promise.all(promises)
        .then(results => {
            const kpi = {};
            results.forEach(result => {
                kpi[result.key] = result.value;
            });
            console.log('KPIs calculados:', kpi);
            res.json(kpi);
        })
        .catch(err => {
            console.error('Erro na rota /reports/kpi:', err);
            res.status(500).json({ error: err.message });
        });
});

// Rota para gráfico financeiro (Emprestado vs. Pago)
router.get('/financial', authMiddleware, (req, res) => {
    const db = req.db;
    const { start_date, end_date } = req.query;
    
    let query = `
        SELECT 
            TO_CHAR(loan_date, 'YYYY-MM') as month,
            COALESCE(CAST(SUM(amount) AS DECIMAL(10,2)), 0) as total_loaned,
            COALESCE(CAST(SUM(principal_paid) AS DECIMAL(10,2)), 0) as total_paid
        FROM loans
    `;
    
    const params = [];
    if (start_date && end_date) {
        query += ` WHERE loan_date BETWEEN $1 AND $2`;
        params.push(start_date, end_date);
    }
    
    query += ` GROUP BY TO_CHAR(loan_date, 'YYYY-MM') ORDER BY month`;
    
    db.query(query, params, (err, result) => {
        if (err) {
            console.error('Erro na rota /reports/financial:', err);
            return res.status(500).json({ error: err.message });
        }
        
        // Garantir que os valores sejam números
        const processedResult = result.rows.map(row => ({
            ...row,
            total_loaned: parseFloat(row.total_loaned) || 0,
            total_paid: parseFloat(row.total_paid) || 0
        }));
        
        res.json(processedResult);
    });
});

// Rota para distribuição de empréstimos por status
router.get('/status-distribution', authMiddleware, (req, res) => {
    const db = req.db;
    const { start_date, end_date } = req.query;
    
    let query = `
        SELECT 
            status,
            COALESCE(COUNT(*), 0) as count,
            COALESCE(CAST(SUM(amount) AS DECIMAL(10,2)), 0) as total_amount
        FROM loans
    `;
    
    const params = [];
    if (start_date && end_date) {
        query += ` WHERE loan_date BETWEEN $1 AND $2`;
        params.push(start_date, end_date);
    }
    
    query += ` GROUP BY status`;
    
    db.query(query, params, (err, result) => {
        if (err) {
            console.error('Erro na rota /reports/status-distribution:', err);
            return res.status(500).json({ error: err.message });
        }
        
        // Garantir que os valores sejam números
        const processedResult = result.rows.map(row => ({
            ...row,
            count: parseInt(row.count) || 0,
            total_amount: parseFloat(row.total_amount) || 0
        }));
        
        res.json(processedResult);
    });
});

// Rota para fluxo de caixa mensal
router.get('/cash-flow', authMiddleware, (req, res) => {
    const db = req.db;
    const { start_date, end_date } = req.query;
    
    // Consulta para saídas (empréstimos concedidos)
    let outflowsQuery = `
        SELECT 
            TO_CHAR(loan_date, 'YYYY-MM') as month,
            COALESCE(CAST(SUM(amount) AS DECIMAL(10,2)), 0) as total_outflow
        FROM loans
    `;
    
    const params = [];
    if (start_date && end_date) {
        outflowsQuery += ` WHERE loan_date BETWEEN $1 AND $2`;
        params.push(start_date, end_date);
    }
    
    outflowsQuery += ` GROUP BY TO_CHAR(loan_date, 'YYYY-MM')`;
    
    // Consulta para entradas (pagamentos recebidos)
    let inflowsQuery = `
        SELECT 
            TO_CHAR(payment_date, 'YYYY-MM') as month,
            COALESCE(CAST(SUM(amount_paid) AS DECIMAL(10,2)), 0) as total_inflow
        FROM payments
    `;
    
    const inflowsParams = [];
    if (start_date && end_date) {
        inflowsQuery += ` WHERE payment_date BETWEEN $1 AND $2`;
        inflowsParams.push(start_date, end_date);
    }
    
    inflowsQuery += ` GROUP BY TO_CHAR(payment_date, 'YYYY-MM')`;
    
    Promise.all([
        new Promise((resolve, reject) => {
            db.query(outflowsQuery, params, (err, result) => {
                if (err) reject(err);
                else resolve(result.rows);
            });
        }),
        new Promise((resolve, reject) => {
            db.query(inflowsQuery, inflowsParams, (err, result) => {
                if (err) reject(err);
                else resolve(result.rows);
            });
        })
    ]).then(([outflows, inflows]) => {
        const months = new Set();
        outflows.forEach(item => months.add(item.month));
        inflows.forEach(item => months.add(item.month));
        
        const result = Array.from(months).sort().map(month => {
            const outflow = outflows.find(item => item.month === month) || { total_outflow: 0 };
            const inflow = inflows.find(item => item.month === month) || { total_inflow: 0 };
            
            return {
                month,
                total_outflow: parseFloat(outflow.total_outflow) || 0,
                total_inflow: parseFloat(inflow.total_inflow) || 0
            };
        });
        
        res.json(result);
    }).catch(err => {
        console.error('Erro na rota /reports/cash-flow:', err);
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
            COALESCE(CAST(SUM(balance_due) AS DECIMAL(10,2)), 0) as total_balance
        FROM loans
        WHERE status != 'Pago'
    `;
    
    const params = [];
    if (start_date && end_date) {
        query += ` AND loan_date BETWEEN $1 AND $2`;
        params.push(start_date, end_date);
    }
    
    query += ` GROUP BY name ORDER BY total_balance DESC LIMIT 10`;
    
    db.query(query, params, (err, result) => {
        if (err) {
            console.error('Erro na rota /reports/top-debtors:', err);
            return res.status(500).json({ error: err.message });
        }
        
        // Garantir que os valores sejam números
        const processedResult = result.rows.map(row => ({
            ...row,
            total_balance: parseFloat(row.total_balance) || 0
        }));
        
        res.json(processedResult);
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
            COALESCE(CAST(amount AS DECIMAL(10,2)), 0) as amount,
            COALESCE(CAST(balance_due AS DECIMAL(10,2)), 0) as balance_due,
            return_date,
            status
        FROM loans
        WHERE return_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '30 days')
        AND status != 'Pago'
    `;
    
    const params = [];
    if (start_date && end_date) {
        query += ` AND loan_date BETWEEN $1 AND $2`;
        params.push(start_date, end_date);
    }
    
    query += ` ORDER BY return_date`;
    
    db.query(query, params, (err, result) => {
        if (err) {
            console.error('Erro na rota /reports/upcoming-due:', err);
            return res.status(500).json({ error: err.message });
        }
        
        // Garantir que os valores sejam números
        const processedResult = result.rows.map(row => ({
            ...row,
            amount: parseFloat(row.amount) || 0,
            balance_due: parseFloat(row.balance_due) || 0
        }));
        
        res.json(processedResult);
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
            COALESCE(CAST(amount AS DECIMAL(10,2)), 0) as amount,
            COALESCE(CAST(balance_due AS DECIMAL(10,2)), 0) as balance_due,
            return_date,
            (CURRENT_DATE - return_date) as days_overdue
        FROM loans
        WHERE return_date < CURRENT_DATE AND status != 'Pago'
    `;
    
    const params = [];
    if (start_date && end_date) {
        query += ` AND loan_date BETWEEN $1 AND $2`;
        params.push(start_date, end_date);
    }
    
    query += ` ORDER BY return_date`;
    
    db.query(query, params, (err, result) => {
        if (err) {
            console.error('Erro na rota /reports/overdue:', err);
            return res.status(500).json({ error: err.message });
        }
        
        // Garantir que os valores sejam números
        const processedResult = result.rows.map(row => ({
            ...row,
            amount: parseFloat(row.amount) || 0,
            balance_due: parseFloat(row.balance_due) || 0
        }));
        
        res.json(processedResult);
    });
});

// Rota para histórico de pagamentos
router.get('/payment-history', authMiddleware, (req, res) => {
    const db = req.db;
    const { debtor_name, start_date, end_date } = req.query;
    
    let query = `
        SELECT 
            p.id,
            COALESCE(CAST(p.amount_paid AS DECIMAL(10,2)), 0) as amount_paid,
            p.payment_date,
            p.description,
            l.name as debtor_name
        FROM payments p
        JOIN loans l ON p.loan_id = l.id
    `;
    
    const params = [];
    if (debtor_name) {
        query += ` WHERE l.name LIKE $1`;
        params.push(`%${debtor_name}%`);
    }
    
    if (start_date && end_date) {
        if (debtor_name) {
            query += ` AND p.payment_date BETWEEN $2 AND $3`;
        } else {
            query += ` WHERE p.payment_date BETWEEN $1 AND $2`;
        }
        params.push(start_date, end_date);
    }
    
    query += ` ORDER BY p.payment_date DESC`;
    
    db.query(query, params, (err, result) => {
        if (err) {
            console.error('Erro na rota /reports/payment-history:', err);
            return res.status(500).json({ error: err.message });
        }
        
        // Garantir que os valores sejam números
        const processedResult = result.rows.map(row => ({
            ...row,
            amount_paid: parseFloat(row.amount_paid) || 0
        }));
        
        res.json(processedResult);
    });
});

// Rota para resumo de juros
router.get('/interest-summary', authMiddleware, (req, res) => {
    const db = req.db;
    const { start_date, end_date } = req.query;
    
    let query = `
        SELECT 
            TO_CHAR(payment_date, 'YYYY-MM') as month,
            COALESCE(CAST(SUM(amount_paid) AS DECIMAL(10,2)), 0) as total_paid,
            COALESCE(CAST(SUM(l.amount_with_interest - l.amount) AS DECIMAL(10,2)), 0) as total_interest
        FROM payments p
        JOIN loans l ON p.loan_id = l.id
    `;
    
    const params = [];
    if (start_date && end_date) {
        query += ` WHERE p.payment_date BETWEEN $1 AND $2`;
        params.push(start_date, end_date);
    }
    
    query += ` GROUP BY TO_CHAR(payment_date, 'YYYY-MM') ORDER BY month`;
    
    db.query(query, params, (err, result) => {
        if (err) {
            console.error('Erro na rota /reports/interest-summary:', err);
            return res.status(500).json({ error: err.message });
        }
        
        // Garantir que os valores sejam números
        const processedResult = result.rows.map(row => ({
            ...row,
            total_paid: parseFloat(row.total_paid) || 0,
            total_interest: parseFloat(row.total_interest) || 0
        }));
        
        res.json(processedResult);
    });
});

module.exports = router;