const express = require('express');
const router = express.Router();
const moment = require('moment');
const upload = require('../multer-config');
moment.locale('pt-br');

const redisClient = require('../redis-client');

router.get('/dashboard', async (req, res) => {
    const db = req.db;
    const { search, sortBy, order, mes, ano, return_date } = req.query;
    const cacheKey = `dashboard:${JSON.stringify(req.query)}`;

    try {
        // Tenta obter os dados do cache primeiro
        if (redisClient.isOpen) {
            const cachedData = await redisClient.get(cacheKey);
            if (cachedData) {
                console.log('Servindo dados do cache para:', cacheKey);
                return res.json(JSON.parse(cachedData));
            }
        }

        // Se não estiver no cache, busca no banco de dados
        console.log('Buscando dados do banco para:', cacheKey);
        const today = moment().format('YYYY-MM-DD');
        const twoDaysFromNow = moment().add(2, 'days').format('YYYY-MM-DD');
        
        const whereConditions = [];
        const params = [];
        
        if (search && search.trim() !== '') { 
            whereConditions.push(`name LIKE ${params.length + 1}`); 
            params.push(`%${search.trim()}%`); 
        }
        if (mes && mes.trim() !== '') { 
            whereConditions.push(`EXTRACT(MONTH FROM loan_date) = ${params.length + 1}`); 
            params.push(mes.padStart(2, '0')); 
        }
        if (ano && ano.trim() !== '') { 
            whereConditions.push(`EXTRACT(YEAR FROM loan_date) = ${params.length + 1}`); 
            params.push(ano.trim()); 
        }
        if (return_date && return_date.trim() !== '') { 
            whereConditions.push(`DATE(return_date) = DATE(${params.length + 1})`); 
            params.push(return_date.trim()); 
        }
        
        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
        
        const validSortColumnsLoans = { name: 'name', date: 'return_date', loan_date: 'loan_date' };
        const sortColumnLoans = validSortColumnsLoans[sortBy] || 'id';
        const sortOrderLoans = order === 'asc' ? 'ASC' : 'DESC';
        const orderByClauseLoans = `ORDER BY ${sortColumnLoans} ${sortOrderLoans}`;
        
        const executeQuery = async (query, queryParams) => {
            try {
                const result = await db.query(query, queryParams);
                return result.rows;
            } catch (err) {
                console.error('Erro na query:', query, 'Params:', queryParams, 'Erro:', err);
                throw err;
            }
        };
        
        const totalEmprestadoAtivoQuery = `SELECT COALESCE(SUM(amount), 0) AS total FROM loans ${whereClause ? whereClause + ' AND' : 'WHERE'} status != 'Pago'`;
        const totalPagoPrincipalQuery = `SELECT COALESCE(SUM(principal_paid), 0) AS total FROM loans ${whereClause ? whereClause + ' AND' : 'WHERE'} status = 'Pago'`;
        const saldoDevedorAtivoQuery = `SELECT COALESCE(SUM(balance_due), 0) AS total FROM loans ${whereClause ? whereClause + ' AND' : 'WHERE'} status != 'Pago'`;
        const totalJurosRecebidosQuery = `SELECT COALESCE(SUM(interest_paid), 0) AS total FROM loans ${whereClause}`;
        const ativosQuery = `SELECT COUNT(*) AS total FROM loans ${whereClause ? whereClause + ' AND' : 'WHERE'} status != 'Pago'`;
        
        let atrasadosQuery, atrasadosParams;
        if (whereConditions.length > 0) {
            atrasadosQuery = `SELECT COUNT(*) AS total FROM loans ${whereClause} AND status != 'Pago' AND return_date < ${params.length + 1}`;
            atrasadosParams = [...params, today];
        } else {
            atrasadosQuery = `SELECT COUNT(*) AS total FROM loans WHERE status != 'Pago' AND return_date < $1`;
            atrasadosParams = [today];
        }
        
        let proximosQuery, proximosParams;
        if (whereConditions.length > 0) {
            proximosQuery = `SELECT COUNT(*) AS total FROM loans ${whereClause} AND status != 'Pago' AND return_date BETWEEN ${params.length + 1} AND ${params.length + 2}`;
            proximosParams = [...params, today, twoDaysFromNow];
        } else {
            proximosQuery = `SELECT COUNT(*) AS total FROM loans WHERE status != 'Pago' AND return_date BETWEEN $1 AND $2`;
            proximosParams = [today, twoDaysFromNow];
        }
        
        const top5Query = `SELECT name, SUM(amount) AS total_emprestado FROM loans ${whereClause} GROUP BY name ORDER BY total_emprestado DESC LIMIT 5`;
        const allLoansQuery = `SELECT * FROM loans ${whereClause} ${orderByClauseLoans}`;
        const listaAtrasadosQuery = `SELECT id, name, amount, balance_due, return_date, (CURRENT_DATE - return_date) as dias_atraso FROM loans WHERE status != 'Pago' AND return_date < CURRENT_DATE ORDER BY dias_atraso DESC, return_date ASC LIMIT 5`;

        const [totalEmprestadoAtivo, totalPagoPrincipal, saldoDevedorAtivo, totalJurosRecebidos, ativos, atrasados, proximosAVencer, top5, allLoans, listaAtrasados] = await Promise.all([
            executeQuery(totalEmprestadoAtivoQuery, params),
            executeQuery(totalPagoPrincipalQuery, params),
            executeQuery(saldoDevedorAtivoQuery, params),
            executeQuery(totalJurosRecebidosQuery, params),
            executeQuery(ativosQuery, params),
            executeQuery(atrasadosQuery, atrasadosParams),
            executeQuery(proximosQuery, proximosParams),
            executeQuery(top5Query, params),
            executeQuery(allLoansQuery, params),
            executeQuery(listaAtrasadosQuery, [])
        ]);

        const responseData = {
            total_emprestado_ativo: totalEmprestadoAtivo[0]?.total || 0,
            total_pago_principal: totalPagoPrincipal[0]?.total || 0,
            saldo_devedor_ativo: saldoDevedorAtivo[0]?.total || 0,
            total_juros_recebidos: totalJurosRecebidos[0]?.total || 0,
            emprestimos_ativos: ativos[0]?.total || 0,
            emprestimos_atrasados: atrasados[0]?.total || 0,
            proximos_a_vencer: proximosAVencer[0]?.total || 0,
            top_5_emprestimos: top5,
            all_loans: allLoans,
            lista_atrasados: listaAtrasados
        };

        // Salva os dados no cache por 1 hora
        if (redisClient.isOpen) {
            await redisClient.set(cacheKey, JSON.stringify(responseData), { EX: 3600 });
        }

        res.json(responseData);

    } catch (err) {
        console.error("Erro na rota /dashboard:", err);
        res.status(500).json({ error: "Erro interno do servidor ao processar os dados." });
    }
});

router.get('/pending', (req, res) => {
    req.db.query("SELECT id, name, balance_due FROM loans WHERE status != 'Pago' ORDER BY name", [], (err, result) => {
        if (err) return res.status(500).json({ error: 'Erro ao buscar empréstimos pendentes.' });
        res.json(result.rows || []);
    });
});

router.get('/payments', (req, res) => {
    const { search, sortBy, order, mes, ano } = req.query;
    let sql = `
        SELECT p.id, p.loan_id, l.name, p.amount_paid, p.payment_date, p.description, p.attachment_path 
        FROM payments p 
        JOIN loans l ON p.loan_id = l.id
    `;
    const params = [];
    const conditions = [];
    let paramIndex = 1;

    if (search) { 
        conditions.push(`l.name LIKE $${paramIndex++}`); 
        params.push(`%${search}%`); 
    }
    if (mes) { 
        conditions.push(`EXTRACT(MONTH FROM p.payment_date) = $${paramIndex++}`); 
        params.push(mes.padStart(2, '0')); 
    }
    if (ano) { 
        conditions.push(`EXTRACT(YEAR FROM p.payment_date) = $${paramIndex++}`); 
        params.push(ano); 
    }

    if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
    }

    const validSortColumns = { name: 'l.name', date: 'p.payment_date' };
    const sortColumn = validSortColumns[sortBy] || 'p.payment_date';
    const sortOrder = order === 'asc' ? 'ASC' : 'DESC';
    sql += ` ORDER BY ${sortColumn} ${sortOrder}, p.id DESC`;

    req.db.query(sql, params, (err, result) => {
        if (err) return res.status(500).json({ error: 'Erro ao buscar pagamentos.' });
        res.json(result.rows || []);
    });
});

router.get('/payments/:id', (req, res) => {
    const paymentId = req.params.id;
    req.db.query("SELECT * FROM payments WHERE id = $1", [paymentId], (err, result) => {
        if (err) return res.status(500).json({ error: 'Erro de servidor.' });
        if (result.rows.length === 0) return res.status(404).json({ error: 'Pagamento não encontrado.' });
        res.json(result.rows[0]);
    });
});

router.put('/payments/:id', upload.single('attachment'), (req, res) => {
    const paymentId = req.params.id;
    const { amount_paid, payment_date, description, loan_id } = req.body;

    req.db.query("SELECT * FROM payments WHERE id = $1", [paymentId], (err, result) => {
        if (err || result.rows.length === 0) return res.status(404).json({ error: "Pagamento não encontrado." });

        const originalPayment = result.rows[0];
        const difference = parseFloat(amount_paid) - originalPayment.amount_paid;

        const updatePaymentSql = `UPDATE payments SET amount_paid = $1, payment_date = $2, description = $3 WHERE id = $4`;
        const updateLoanSql = `UPDATE loans SET interest_paid = interest_paid + $1 WHERE id = $2`;

        req.db.query(updatePaymentSql, [amount_paid, payment_date, description, paymentId], (err) => {
            if (err) return res.status(500).json({ error: "Erro ao atualizar pagamento." });
            
            req.db.query(updateLoanSql, [difference, loan_id], (err) => {
                if (err) return res.status(500).json({ error: "Erro ao atualizar o empréstimo." });
                res.status(200).json({ message: "Pagamento atualizado com sucesso." });
            });
        });
    });
});

router.get('/:id', (req, res) => {
    const loanId = req.params.id;
    req.db.query("SELECT * FROM loans WHERE id = $1", [loanId], (err, result) => {
        if (err) return res.status(500).json({ error: 'Erro de servidor.' });
        if (result.rows.length === 0) return res.status(404).json({ error: 'Empréstimo não encontrado.' });
        res.json(result.rows[0]);
    });
});

const supabase = require('../supabase-client');

router.post('/', upload.single('attachment'), async (req, res) => {
    let attachment_path = null;

    // Se um arquivo foi enviado, primeiro faz o upload para o Supabase
    if (req.file) {
        const file = req.file;
        // Garante um nome de arquivo único e seguro para a URL
        const fileName = `${Date.now()}-${file.originalname.replace(/\s/g, '_')}`;

        const { data, error } = await supabase.storage
            .from('anexos') // Nome do seu bucket
            .upload(fileName, file.buffer, {
                contentType: file.mimetype,
                cacheControl: '3600',
                upsert: false,
            });

        if (error) {
            console.error('Erro no upload para o Supabase:', error);
            return res.status(500).json({ error: 'Falha ao enviar o arquivo para o armazenamento.' });
        }

        // Pega a URL pública do arquivo para salvar no banco de dados
        const { data: urlData } = supabase.storage.from('anexos').getPublicUrl(data.path);
        attachment_path = urlData.publicUrl;
    }

    // Lógica original para salvar os dados do empréstimo no banco, agora com a URL do Supabase
    const { name, cpf, phone, address_street, address_cep, address_bairro, address_city, amount, loan_date, return_date } = req.body;
    
    if (!name || !amount || !loan_date || !return_date) {
        return res.status(400).json({ error: 'Nome, valor e datas são obrigatórios.' });
    }
    
    const principalAmount = parseFloat(amount);
    const amount_with_interest = principalAmount * 1.2;
    
    const sql = `
        INSERT INTO loans (
            name, cpf, phone, address_street, address_cep, address_bairro, address_city,
            amount, amount_with_interest, balance_due, loan_date, return_date, status, attachment_path
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'Pendente', $13)
        RETURNING id
    `;
    
    const params = [name, cpf, phone, address_street, address_cep, address_bairro, address_city, 
                   principalAmount, amount_with_interest, principalAmount, loan_date, return_date, attachment_path];
    
    req.db.query(sql, params, (err, result) => {
        if (err) {
            console.error("Erro ao inserir empréstimo no banco:", err);
            return res.status(500).json({ error: err.message });
        }
        res.status(201).json({ id: result.rows[0].id });
    });
});

router.put('/:id', upload.single('attachment'), async (req, res) => {
    const loanId = req.params.id;

    try {
        // Primeiro, buscar os dados originais do empréstimo
        const originalLoanResult = await req.db.query("SELECT * FROM loans WHERE id = $1", [loanId]);
        if (originalLoanResult.rows.length === 0) {
            return res.status(404).json({ error: "Empréstimo não encontrado." });
        }
        const originalLoan = originalLoanResult.rows[0];
        let attachment_path = originalLoan.attachment_path; // Manter o anexo original por padrão

        // Se um novo arquivo foi enviado, faça o upload e atualize o caminho
        if (req.file) {
            const file = req.file;
            const fileName = `${Date.now()}-${file.originalname.replace(/\s/g, '_')}`;

            const { data, error } = await supabase.storage
                .from('anexos')
                .upload(fileName, file.buffer, {
                    contentType: file.mimetype,
                    cacheControl: '3600',
                    upsert: false,
                });

            if (error) {
                console.error('Erro no upload para o Supabase:', error);
                return res.status(500).json({ error: 'Falha ao enviar o novo arquivo.' });
            }

            // Pega a URL pública do novo arquivo
            const { data: urlData } = supabase.storage.from('anexos').getPublicUrl(data.path);
            attachment_path = urlData.publicUrl;

            // Opcional, mas recomendado: Deletar o arquivo antigo do Supabase Storage
            if (originalLoan.attachment_path) {
                try {
                    const oldFileName = originalLoan.attachment_path.split('/').pop();
                    await supabase.storage.from('anexos').remove([oldFileName]);
                } catch (removeError) {
                    console.error("Erro ao deletar anexo antigo:", removeError.message);
                }
            }
        }

        // Lógica de atualização do empréstimo
        const { name, cpf, phone, address_street, address_cep, address_bairro, address_city, amount, loan_date, return_date, undo_quit } = req.body;
        const newPrincipalAmount = parseFloat(amount);

        let { status, principal_paid } = originalLoan;
        let balance_due = originalLoan.balance_due;
        let amount_with_interest = newPrincipalAmount * 1.2;

        if (undo_quit === 'on' && originalLoan.status === 'Pago') {
            status = 'Pendente';
            balance_due = newPrincipalAmount;
            principal_paid = 0;
            await req.db.query("DELETE FROM payments WHERE loan_id = $1 AND description LIKE 'Pagamento de quitação%'", [loanId]);
        } else if (status !== 'Pago') {
            balance_due = newPrincipalAmount - originalLoan.principal_paid;
        }

        const sql = `
            UPDATE loans SET
                name = $1, cpf = $2, phone = $3, address_street = $4, address_cep = $5, 
                address_bairro = $6, address_city = $7, amount = $8, amount_with_interest = $9, 
                loan_date = $10, return_date = $11, balance_due = $12, principal_paid = $13, status = $14,
                attachment_path = $16
            WHERE id = $15`;
            
        const params = [name, cpf, phone, address_street, address_cep, address_bairro, address_city, 
                       newPrincipalAmount, amount_with_interest, loan_date, return_date, balance_due, 
                       principal_paid, status, loanId, attachment_path];
        
        await req.db.query(sql, params);
        res.status(200).json({ message: "Empréstimo atualizado com sucesso." });

    } catch (err) {
        console.error("Erro ao atualizar empréstimo:", err);
        return res.status(500).json({ error: "Erro interno ao atualizar o empréstimo." });
    }
});

router.post('/:id/payments', upload.single('attachment'), async (req, res) => {
    const loanId = req.params.id;
    let attachment_path = null;

    // Se um arquivo foi enviado, faça o upload para o Supabase
    if (req.file) {
        const file = req.file;
        const fileName = `${Date.now()}-${file.originalname.replace(/\s/g, '_')}`;

        const { data, error } = await supabase.storage
            .from('anexos')
            .upload(fileName, file.buffer, {
                contentType: file.mimetype,
                cacheControl: '3600',
                upsert: false,
            });

        if (error) {
            console.error('Erro no upload do anexo do pagamento:', error);
            return res.status(500).json({ error: 'Falha ao enviar o arquivo de anexo.' });
        }

        const { data: urlData } = supabase.storage.from('anexos').getPublicUrl(data.path);
        attachment_path = urlData.publicUrl;
    }

    // Lógica para registrar o pagamento
    const { amount_paid, payment_date, description } = req.body;

    if (!amount_paid || !payment_date) {
        return res.status(400).json({ error: "Valor e data do pagamento são obrigatórios." });
    }

    try {
        const loanResult = await req.db.query("SELECT * FROM loans WHERE id = $1", [loanId]);
        if (loanResult.rows.length === 0) {
            return res.status(404).json({ error: "Empréstimo não encontrado." });
        }

        const loan = loanResult.rows[0];
        if (loan.status === 'Pago') {
            return res.status(400).json({ error: "Este empréstimo já está quitado." });
        }

        const novaDataVencimento = moment(loan.return_date).add(1, 'months').format('YYYY-MM-DD');
        const newInterestPaid = loan.interest_paid + parseFloat(amount_paid);

        const paymentSql = `INSERT INTO payments (loan_id, amount_paid, payment_date, description, attachment_path) VALUES ($1, $2, $3, $4, $5)`;
        const paymentParams = [loanId, parseFloat(amount_paid), payment_date, description, attachment_path];

        const loanUpdateSql = "UPDATE loans SET interest_paid = $1, return_date = $2 WHERE id = $3";
        const loanUpdateParams = [newInterestPaid, novaDataVencimento, loanId];

        // Executa as queries em sequência
        await req.db.query(paymentSql, paymentParams);
        await req.db.query(loanUpdateSql, loanUpdateParams);

        res.status(201).json({
            message: "Pagamento registrado e data de vencimento atualizada com sucesso.",
            new_return_date: novaDataVencimento
        });

    } catch (err) {
        console.error("Erro ao registrar pagamento:", err);
        return res.status(500).json({ error: "Erro interno ao registrar o pagamento." });
    }
});

router.put('/:id/mark-as-paid', (req, res) => {
    const loanId = req.params.id;
    req.db.query("SELECT * FROM loans WHERE id = $1", [loanId], (err, result) => {
        if (err || result.rows.length === 0) return res.status(404).json({ error: "Empréstimo não encontrado."});
        
        const loan = result.rows[0];
        if (loan.status === 'Pago') return res.status(400).json({ message: "Este empréstimo já está quitado."});
        
        const paymentSql = `INSERT INTO payments (loan_id, amount_paid, payment_date, description) VALUES ($1, $2, $3, $4)`;
        const paymentParams = [loanId, loan.balance_due, moment().format('YYYY-MM-DD'), 'Pagamento de quitação do principal'];
        
        const loanUpdateSql = "UPDATE loans SET balance_due = 0, principal_paid = $1, status = 'Pago' WHERE id = $2";
        const loanUpdateParams = [loan.amount, loanId];
        
        req.db.query(paymentSql, paymentParams, (err) => {
            if (err) return res.status(500).json({ error: "Erro ao registrar pagamento de quitação." });
            
            req.db.query(loanUpdateSql, loanUpdateParams, (err) => {
                if (err) return res.status(500).json({ error: "Erro ao quitar empréstimo." });
                res.status(200).json({ message: "Empréstimo quitado com sucesso." });
            });
        });
    });
});

router.get('/atrasados', (req, res) => {
    const query = `
        SELECT *
        FROM loans 
        WHERE return_date < CURRENT_DATE AND status != 'Pago'
        ORDER BY return_date ASC
    `;
    
    req.db.query(query, (err, result) => {
        if (err) {
            console.error('Erro na consulta:', err);
            return res.status(500).json({ error: err.message });
        }
        
        const processedRows = result.rows.map(row => {
            const hoje = new Date();
            const vencimento = new Date(row.return_date);
            
            hoje.setHours(0, 0, 0, 0);
            vencimento.setHours(0, 0, 0, 0);
            
            const diffMs = hoje - vencimento;
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