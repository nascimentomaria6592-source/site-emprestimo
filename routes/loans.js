const express = require('express');
const router = express.Router();
const moment = require('moment');
const upload = require('../multer-config');
moment.locale('pt-br');

// GET /api/loans/dashboard -> ROTA DE ESTATÍSTICAS COM FILTROS, BUSCA E ORDENAÇÃO
router.get('/dashboard', async (req, res) => {
    const db = req.db;
    const { search, sortBy, order, mes, ano, return_date } = req.query;
    const today = moment().format('YYYY-MM-DD');
    const twoDaysFromNow = moment().add(2, 'days').format('YYYY-MM-DD');
    
    // Constrói a cláusula WHERE para os filtros comuns
    let whereConditions = [];
    let params = [];
    
    if (search) { 
        whereConditions.push('name LIKE ?'); 
        params.push(`%${search}%`); 
    }
    if (mes) { 
        whereConditions.push('strftime("%m", loan_date) = ?'); 
        params.push(mes.padStart(2, '0')); 
    }
    if (ano) { 
        whereConditions.push('strftime("%Y", loan_date) = ?'); 
        params.push(ano); 
    }
    if (return_date) { 
        whereConditions.push('DATE(return_date) = DATE(?)'); 
        params.push(return_date); 
    }
    
    // Constrói a cláusula WHERE completa
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
    // Ordenação para a lista de empréstimos
    const validSortColumnsLoans = { name: 'name', date: 'return_date', loan_date: 'loan_date' };
    const sortColumnLoans = validSortColumnsLoans[sortBy] || 'id';
    const sortOrderLoans = order === 'asc' ? 'ASC' : 'DESC';
    const orderByClauseLoans = `ORDER BY ${sortColumnLoans} ${sortOrderLoans}`;
    
    const dbGet = (sql, queryParams = []) => new Promise((resolve, reject) => db.get(sql, queryParams, (err, row) => err ? reject(err) : resolve(row)));
    const dbAll = (sql, queryParams = []) => new Promise((resolve, reject) => db.all(sql, queryParams, (err, rows) => err ? reject(err) : resolve(rows || [])));

    try {
        // Consultas SQL com condições WHERE corretas
        const [
            totalEmprestadoAtivoRow, totalPagoPrincipalRow,
            saldoDevedorAtivoRow, totalJurosRecebidosRow,
            ativosRow, atrasadosRow, proximosAVencerRow,
            top5, allLoans, listaAtrasados  // NOVO: lista de atrasados
        ] = await Promise.all([
            dbGet(`SELECT COALESCE(SUM(amount), 0) AS total FROM loans ${whereClause ? whereClause + ' AND' : 'WHERE'} status != 'Pago'`, params),
            dbGet(`SELECT COALESCE(SUM(principal_paid), 0) AS total FROM loans ${whereClause ? whereClause + ' AND' : 'WHERE'} status = 'Pago'`, params),
            dbGet(`SELECT COALESCE(SUM(balance_due), 0) AS total FROM loans ${whereClause ? whereClause + ' AND' : 'WHERE'} status != 'Pago'`, params),
            dbGet(`SELECT COALESCE(SUM(interest_paid), 0) AS total FROM loans ${whereClause}`, params),
            dbGet(`SELECT COUNT(*) AS total FROM loans ${whereClause ? whereClause + ' AND' : 'WHERE'} status != 'Pago'`, params),
            dbGet(`SELECT COUNT(*) AS total FROM loans ${whereClause ? whereClause + ' AND' : 'WHERE'} status != 'Pago' AND return_date < ?`, [...params, today]),
            dbGet(`SELECT COUNT(*) AS total FROM loans ${whereClause ? whereClause + ' AND' : 'WHERE'} status != 'Pago' AND return_date BETWEEN ? AND ?`, [...params, today, twoDaysFromNow]),
            dbAll(`SELECT name, SUM(amount) AS total_emprestado FROM loans ${whereClause} GROUP BY name ORDER BY total_emprestado DESC LIMIT 5`, params),
            dbAll(`SELECT * FROM loans ${whereClause} ${orderByClauseLoans}`, params),
            // NOVA: Consulta para lista de atrasados
            dbAll(`
                SELECT id, name, amount, balance_due, return_date,
                CAST(JULIANDAY('${today}') - JULIANDAY(return_date) AS INTEGER) as dias_atraso 
                FROM loans 
                WHERE status != 'Pago' AND return_date < '${today}' 
                ORDER BY dias_atraso DESC, return_date ASC 
                LIMIT 5
            `)
        ]);
        
        res.json({
            total_emprestado_ativo: totalEmprestadoAtivoRow.total,
            total_pago_principal: totalPagoPrincipalRow.total,
            saldo_devedor_ativo: saldoDevedorAtivoRow.total,
            total_juros_recebidos: totalJurosRecebidosRow.total,
            emprestimos_ativos: ativosRow.total,
            emprestimos_atrasados: atrasadosRow.total,
            proximos_a_vencer: proximosAVencerRow.total,
            top_5_emprestimos: top5,
            all_loans: allLoans,
            lista_atrasados: listaAtrasados  // NOVO: adicionar na resposta
        });
    } catch (err) {
        console.error("Erro na rota /dashboard:", err);
        res.status(500).json({ error: "Erro interno do servidor ao processar os dados." });
    }
});
// GET /api/loans/pending
router.get('/pending', (req, res) => {
    req.db.all("SELECT id, name, balance_due FROM loans WHERE status != 'Pago' ORDER BY name", [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Erro ao buscar empréstimos pendentes.' });
        res.json(rows || []);
    });
});

// GET /api/loans/payments -> COM BUSCA E ORDENAÇÃO
router.get('/payments', (req, res) => {
    const { search, sortBy, order, mes, ano } = req.query;
    let sql = `
        SELECT p.id, p.loan_id, l.name, p.amount_paid, p.payment_date, p.description, p.attachment_path 
        FROM payments p 
        JOIN loans l ON p.loan_id = l.id
    `;
    const params = [];
    const conditions = [];

    if (search) { conditions.push('l.name LIKE ?'); params.push(`%${search}%`); }
    if (mes) { conditions.push('strftime("%m", p.payment_date) = ?'); params.push(mes.padStart(2, '0')); }
    if (ano) { conditions.push('strftime("%Y", p.payment_date) = ?'); params.push(ano); }

    if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
    }

    const validSortColumns = { name: 'l.name', date: 'p.payment_date' };
    const sortColumn = validSortColumns[sortBy] || 'p.payment_date';
    const sortOrder = order === 'asc' ? 'ASC' : 'DESC';
    sql += ` ORDER BY ${sortColumn} ${sortOrder}, p.id DESC`;

    req.db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: 'Erro ao buscar pagamentos.' });
        res.json(rows || []);
    });
});

// GET /api/loans/payments/:id
router.get('/payments/:id', (req, res) => {
    const paymentId = req.params.id;
    req.db.get("SELECT * FROM payments WHERE id = ?", [paymentId], (err, row) => {
        if (err) return res.status(500).json({ error: 'Erro de servidor.' });
        if (!row) return res.status(404).json({ error: 'Pagamento não encontrado.' });
        res.json(row);
    });
});

// PUT /api/loans/payments/:id
router.put('/payments/:id', upload.single('attachment'), (req, res) => {
    const paymentId = req.params.id;
    const { amount_paid, payment_date, description, loan_id } = req.body;

    req.db.get("SELECT * FROM payments WHERE id = ?", [paymentId], (err, originalPayment) => {
        if (err || !originalPayment) return res.status(404).json({ error: "Pagamento não encontrado." });

        const difference = parseFloat(amount_paid) - originalPayment.amount_paid;

        const updatePaymentSql = `UPDATE payments SET amount_paid = ?, payment_date = ?, description = ? WHERE id = ?`;
        const updateLoanSql = `UPDATE loans SET interest_paid = interest_paid + ? WHERE id = ?`;

        req.db.serialize(() => {
            req.db.run(updatePaymentSql, [amount_paid, payment_date, description, paymentId]);
            req.db.run(updateLoanSql, [difference, loan_id], (err) => {
                if (err) return res.status(500).json({ error: "Erro ao atualizar o empréstimo." });
                res.status(200).json({ message: "Pagamento atualizado com sucesso." });
            });
        });
    });
});

// GET /api/loans/:id
router.get('/:id', (req, res) => {
    const loanId = req.params.id;
    req.db.get("SELECT * FROM loans WHERE id = ?", [loanId], (err, row) => {
        if (err) return res.status(500).json({ error: 'Erro de servidor.' });
        if (!row) return res.status(404).json({ error: 'Empréstimo não encontrado.' });
        res.json(row);
    });
});

// POST /api/loans
router.post('/', upload.single('attachment'), (req, res) => {
    const { name, cpf, phone, address_street, address_cep, address_bairro, address_city, amount, loan_date, return_date } = req.body;
    const attachment_path = req.file ? req.file.path.replace(/\\/g, "/") : null;
    if (!name || !amount || !loan_date || !return_date) return res.status(400).json({ error: 'Nome, valor e datas são obrigatórios.' });
    const principalAmount = parseFloat(amount);
    const amount_with_interest = principalAmount * 1.2;
    const sql = `
        INSERT INTO loans (
            name, cpf, phone, address_street, address_cep, address_bairro, address_city,
            amount, amount_with_interest, balance_due, loan_date, return_date, status, attachment_path
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pendente', ?)
    `;
    const params = [ name, cpf, phone, address_street, address_cep, address_bairro, address_city, principalAmount, amount_with_interest, principalAmount, loan_date, return_date, attachment_path ];
    req.db.run(sql, params, function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ id: this.lastID });
    });
});

// PUT /api/loans/:id
router.put('/:id', upload.single('attachment'), (req, res) => {
    const loanId = req.params.id;
    const { name, cpf, phone, address_street, address_cep, address_bairro, address_city, amount, loan_date, return_date, undo_quit } = req.body;
    const newPrincipalAmount = parseFloat(amount);

    req.db.get("SELECT * FROM loans WHERE id = ?", [loanId], (err, originalLoan) => {
        if (err || !originalLoan) return res.status(404).json({ error: "Empréstimo não encontrado." });

        let { status, principal_paid } = originalLoan;
        let balance_due = originalLoan.balance_due;
        let amount_with_interest = newPrincipalAmount * 1.2;

        if (undo_quit === 'on' && originalLoan.status === 'Pago') {
            status = 'Pendente';
            balance_due = newPrincipalAmount;
            principal_paid = 0;
            req.db.run("DELETE FROM payments WHERE loan_id = ? AND description LIKE 'Pagamento de quitação%'", [loanId]);
        } else if (status !== 'Pago') {
            balance_due = newPrincipalAmount - originalLoan.principal_paid;
        }

        const sql = `
            UPDATE loans SET
                name = ?, cpf = ?, phone = ?, address_street = ?, address_cep = ?, 
                address_bairro = ?, address_city = ?, amount = ?, amount_with_interest = ?, loan_date = ?, return_date = ?,
                balance_due = ?, principal_paid = ?, status = ?
            WHERE id = ?`;
        const params = [ name, cpf, phone, address_street, address_cep, address_bairro, address_city, newPrincipalAmount, amount_with_interest, loan_date, return_date, balance_due, principal_paid, status, loanId ];
        req.db.run(sql, params, function (err) {
            if (err) return res.status(500).json({ error: "Erro ao atualizar o empréstimo." });
            res.status(200).json({ message: "Empréstimo atualizado com sucesso." });
        });
    });
});

// POST /api/loans/:id/payments -> ROTA MODIFICADA
router.post('/:id/payments', upload.single('attachment'), (req, res) => {
    const loanId = req.params.id;
    const { amount_paid, payment_date, description } = req.body;
    const attachment_path = req.file ? req.file.path.replace(/\\/g, "/") : null;

    if (!amount_paid || !payment_date) {
        return res.status(400).json({ error: "Valor e data do pagamento são obrigatórios." });
    }

    req.db.get("SELECT * FROM loans WHERE id = ?", [loanId], (err, loan) => {
        if (err || !loan) {
            return res.status(404).json({ error: "Empréstimo não encontrado." });
        }
        if (loan.status === 'Pago') {
            return res.status(400).json({ error: "Este empréstimo já está quitado." });
        }

        // --- LÓGICA PRINCIPAL DA NOVA FUNCIONALIDADE ---
        
        // 1. Calcular a nova data de vencimento
        const novaDataVencimento = moment(loan.return_date).add(1, 'months').format('YYYY-MM-DD');

        // 2. Preparar as atualizações
        const newInterestPaid = loan.interest_paid + parseFloat(amount_paid);
        
        const paymentSql = `INSERT INTO payments (loan_id, amount_paid, payment_date, description, attachment_path) VALUES (?, ?, ?, ?, ?)`;
        const paymentParams = [loanId, parseFloat(amount_paid), payment_date, description, attachment_path];
        
        // Atualiza tanto os juros pagos QUANTO a data de vencimento
        const loanUpdateSql = "UPDATE loans SET interest_paid = ?, return_date = ? WHERE id = ?";
        const loanUpdateParams = [newInterestPaid, novaDataVencimento, loanId];

        // 3. Executar as transações no banco de dados
        req.db.serialize(() => {
            // Insere o registro na tabela de pagamentos
            req.db.run(paymentSql, paymentParams);
            
            // Atualiza o empréstimo com a nova data e o valor pago
            req.db.run(loanUpdateSql, loanUpdateParams, (err) => {
                if (err) {
                    console.error("Erro ao atualizar empréstimo:", err);
                    return res.status(500).json({ error: "Erro ao atualizar a data de vencimento do empréstimo." });
                }
                res.status(201).json({ 
                    message: "Pagamento registrado e data de vencimento atualizada com sucesso.",
                    new_return_date: novaDataVencimento // Opcional: retornar a nova data
                });
            });
        });
    });
});

// PUT /api/loans/:id/mark-as-paid
router.put('/:id/mark-as-paid', (req, res) => {
    const loanId = req.params.id;
    req.db.get("SELECT * FROM loans WHERE id = ?", [loanId], (err, loan) => {
        if (err || !loan) return res.status(404).json({ error: "Empréstimo não encontrado."});
        if (loan.status === 'Pago') return res.status(400).json({ message: "Este empréstimo já está quitado."});
        const paymentSql = `INSERT INTO payments (loan_id, amount_paid, payment_date, description) VALUES (?, ?, ?, ?)`;
        const paymentParams = [loanId, loan.balance_due, moment().format('YYYY-MM-DD'), 'Pagamento de quitação do principal'];
        const loanUpdateSql = "UPDATE loans SET balance_due = 0, principal_paid = ?, status = 'Pago' WHERE id = ?";
        const loanUpdateParams = [loan.amount, loanId];
        req.db.serialize(() => {
            req.db.run(paymentSql, paymentParams);
            req.db.run(loanUpdateSql, loanUpdateParams, (err) => {
                if (err) return res.status(500).json({ error: "Erro ao quitar empréstimo." });
                res.status(200).json({ message: "Empréstimo quitado com sucesso." });
            });
        });
    });
});

// routes/loans.js
router.get('/atrasados', (req, res) => {
    const db = req.db;
    
    // Consulta simples sem cálculo
    const query = `
        SELECT *
        FROM loans 
        WHERE return_date < date('now') AND status != 'Pago'
        ORDER BY return_date ASC
    `;
    
    db.all(query, [], (err, rows) => {
        if (err) {
            console.error('Erro na consulta:', err);
            return res.status(500).json({ error: err.message });
        }
        
        // Calcular dias de atraso no JavaScript
        const processedRows = rows.map(row => {
            const hoje = new Date();
            const vencimento = new Date(row.return_date);
            
            // Zerar horas, minutos, segundos e milissegundos
            hoje.setHours(0, 0, 0, 0);
            vencimento.setHours(0, 0, 0, 0);
            
            // Calcular diferença em milissegundos
            const diffMs = hoje - vencimento;
            
            // Converter para dias e garantir valor positivo
            const diffDays = Math.abs(Math.floor(diffMs / (1000 * 60 * 60 * 24)));
            
            return {
                ...row,
                dias_atraso: diffDays
            };
        });
        
        res.json(processedRows);
    });
});

module.exports = router;