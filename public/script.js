document.addEventListener('DOMContentLoaded', () => {
    // Verificar se estamos na página de login
    if (window.location.pathname.includes('login.html')) {
        // Não executar o resto do script na página de login
        return;
    }
    
    // --- SETUP INICIAL ---
    const token = localStorage.getItem('authToken');
    if (!token) { 
        window.location.href = '/login.html'; 
        return; 
    }
    const mustChangePassword = localStorage.getItem('mustChangePassword') === 'true';
    let allLoansData = [];
    
    // Estado dos filtros e ordenação para cada aba
    const viewState = {
        dashboard: { mes: '', ano: '' },
        entradas: { search: '', sortBy: 'date', order: 'desc', mes: '', ano: '' },
        saidas: { search: '', sortBy: 'date', order: 'desc', return_date: '' },
        relatorios: { start_date: '', end_date: '', status: '', debtor_name: '' }
    };
    
    // --- ELEMENTOS DO DOM ---
    const navButtons = document.querySelectorAll('.nav-button');
    const tabContents = document.querySelectorAll('.tab-content');
    const loanModal = document.getElementById('loan-modal');
    const newLoanForm = document.getElementById('new-loan-form');
    const paymentModal = document.getElementById('payment-modal');
    const newPaymentForm = document.getElementById('new-payment-form');
    const passwordModal = document.getElementById('password-change-modal');
    const passwordChangeForm = document.getElementById('password-change-form');
    const detailsModal = document.getElementById('details-modal');
    const editLoanModal = document.getElementById('edit-loan-modal');
    const editLoanForm = document.getElementById('edit-loan-form');
    const editPaymentModal = document.getElementById('edit-payment-modal');
    const editPaymentForm = document.getElementById('edit-payment-form');
    const saidasTableBody = document.querySelector('#saidas-table tbody');
    const entradasTableBody = document.querySelector('#entradas-table tbody');
    const entradasTable = document.getElementById('entradas-table');
    const saidasTable = document.getElementById('saidas-table');
    const searchEntradasInput = document.getElementById('search-entradas');
    const searchSaidasInput = document.getElementById('search-saidas');
    
    // Elementos do modal de atrasados
    const atrasadosModal = document.getElementById('atrasados-modal');
    const atrasadosLista = document.getElementById('atrasados-lista');
    
    // Verificar se os elementos críticos existem
    if (!passwordModal || !passwordChangeForm) {
        console.error('Elementos do modal de troca de senha não encontrados');
    }
    
    // --- FUNÇÕES DE LÓGICA E DADOS ---
    const fetchWithAuth = async (url, options = {}) => {
        // Sempre obter o token atualizado do localStorage
        const currentToken = localStorage.getItem('authToken');
        if (!currentToken) { 
            localStorage.clear(); 
            window.location.href = '/login.html'; 
            throw new Error('Sessão expirada.'); 
        }
        
        const headers = { ...options.headers, 'Authorization': `Bearer ${currentToken}` };
        if (!(options.body instanceof FormData)) { 
            headers['Content-Type'] = 'application/json'; 
        }
        
        const response = await fetch(url, { ...options, headers });
        
        if (response.status === 401 || response.status === 403) { 
            localStorage.clear(); 
            window.location.href = '/login.html'; 
            throw new Error('Sessão expirada.'); 
        }
        
        return response;
    };
    
    const createQueryString = (params) => {
        return new URLSearchParams(
            Object.fromEntries(
                Object.entries(params).filter(([_, v]) => v != null && v !== '')
            )
        ).toString();
    };
    
    const formatCurrency = (value) => {
        return (value === null || value === undefined ? 0 : Number(value))
            .toLocaleString('pt-BR', { 
                style: 'currency', 
                currency: 'BRL' 
            });
    };
    
    const formatDate = (dateString) => {
        return moment(dateString).format('DD/MM/YYYY');
    };
    
    // Modifique a função refreshAllData no script.js
    const refreshAllData = async () => {
        try {
            const activeTab = document.querySelector('.nav-button.active')?.dataset.tab || 'dashboard';
            
            // Obter os parâmetros de filtro do estado atual
            const dashboardParams = { ...viewState.dashboard };
            const entradasParams = { ...viewState.entradas };
            
            // Remover parâmetros vazios
            Object.keys(dashboardParams).forEach(key => {
                if (dashboardParams[key] === '' || dashboardParams[key] === null || dashboardParams[key] === undefined) {
                    delete dashboardParams[key];
                }
            });
            
            Object.keys(entradasParams).forEach(key => {
                if (entradasParams[key] === '' || entradasParams[key] === null || entradasParams[key] === undefined) {
                    delete entradasParams[key];
                }
            });
            
            // Construir query strings
            const dashboardQueryString = new URLSearchParams(dashboardParams).toString();
            const entradasQueryString = new URLSearchParams(entradasParams).toString();
            
            const dashboardPromise = fetchWithAuth(`/api/loans/dashboard${dashboardQueryString ? '?' + dashboardQueryString : ''}`);
            const paymentsPromise = fetchWithAuth(`/api/loans/payments${entradasQueryString ? '?' + entradasQueryString : ''}`);
            
            const [dashboardRes, paymentsRes] = await Promise.all([dashboardPromise, paymentsPromise]);
            
            if (!dashboardRes.ok) {
                const errorData = await dashboardRes.json();
                throw new Error(`Erro ao carregar dados do dashboard: ${errorData.error || dashboardRes.statusText}`);
            }
            
            if (!paymentsRes.ok) {
                const errorData = await paymentsRes.json();
                throw new Error(`Erro ao carregar pagamentos: ${errorData.error || paymentsRes.statusText}`);
            }
            
            const data = await dashboardRes.json();
            const payments = await paymentsRes.json();
            allLoansData = data.all_loans;
            
            updateDashboard(data);
            updateEntradas(payments);
            updateSaidas(data);
        } catch (error) {
            console.error('Falha ao recarregar todos os dados:', error);
            if(error.message.indexOf('Sessão expirada') === -1) {
                alert('Não foi possível recarregar os dados: ' + error.message);
            }
        }
    };
    
    const loadDashboardData = async () => {
        const params = viewState.dashboard;
        try {
            const response = await fetchWithAuth(`/api/loans/dashboard?${createQueryString(params)}`);
            if (!response.ok) throw new Error('Erro ao carregar dados do dashboard.');
            const data = await response.json();
            updateDashboard(data);
        } catch (error) { 
            console.error('Falha no Dashboard:', error); 
            if(error.message.indexOf('Sessão expirada') === -1) {
                alert('Não foi possível carregar dados do Dashboard.'); 
            }
        }
    };
    
    const loadEntradasData = async () => {
        const params = viewState.entradas;
        try {
            const response = await fetchWithAuth(`/api/loans/payments?${createQueryString(params)}`);
            const payments = await response.json();
            updateEntradas(payments);
            updateSortIndicator('entradas');
        } catch (error) { 
            console.error('Falha nas Entradas:', error);
            if(error.message.indexOf('Sessão expirada') === -1) {
                alert('Erro ao carregar dados de entradas: ' + error.message);
            }
        }
    };
    
    const loadSaidasData = async () => {
        const params = viewState.saidas;
        try {
            const response = await fetchWithAuth(`/api/loans/dashboard?${createQueryString(params)}`);
            const data = await response.json();
            allLoansData = data.all_loans;
            updateSaidas(data);
            updateSortIndicator('saidas');
        } catch (error) { 
            console.error('Falha nas Saídas:', error);
            if(error.message.indexOf('Sessão expirada') === -1) {
                alert('Erro ao carregar dados de saídas: ' + error.message);
            }
        }
    };
    
    const loadFilteredData = (tab) => {
        if (tab === 'dashboard') {
            loadDashboardData();
        } else if (tab === 'entradas') {
            loadEntradasData();
        } else if (tab === 'saidas') {
            loadSaidasData();
        }
    };
    
    const populatePendingLoansDatalist = async () => {
        try {
            const response = await fetchWithAuth('/api/loans/pending');
            const pendingLoans = await response.json();
            const datalist = document.getElementById('pending-loans-list');
            if(datalist) {
                datalist.innerHTML = '';
                pendingLoans.forEach(loan => {
                    const option = document.createElement('option');
                    option.value = `${loan.name} (Saldo Principal: ${formatCurrency(loan.balance_due)})`;
                    option.dataset.id = loan.id;
                    datalist.appendChild(option);
                });
            }
        } catch(error) { 
            console.error("Erro ao popular devedores:", error);
        }
    };
    
    // --- FUNÇÕES DE RENDERIZAÇÃO ---
    const updateDashboard = (data) => {
        document.getElementById('total-emprestado-ativo').textContent = formatCurrency(data.total_emprestado_ativo);
        document.getElementById('saldo-devedor-ativo').textContent = formatCurrency(data.saldo_devedor_ativo);
        document.getElementById('total-pago-principal').textContent = formatCurrency(data.total_pago_principal);
        document.getElementById('total-juros-recebidos').textContent = formatCurrency(data.total_juros_recebidos);
        document.getElementById('emprestimos-ativos').textContent = data.emprestimos_ativos;
        document.getElementById('emprestimos-atrasados').textContent = data.emprestimos_atrasados;
        document.getElementById('proximos-a-vencer').textContent = data.proximos_a_vencer;
        
        const top5Container = document.getElementById('top-5-emprestimos');
        top5Container.innerHTML = '';
        if (data.top_5_emprestimos && data.top_5_emprestimos.length > 0) {
            data.top_5_emprestimos.forEach((person, index) => {
                const card = document.createElement('div');
                card.className = 'top-person-card';
                
                card.innerHTML = `
                    <div class="rank">#${index + 1}</div>
                    <div class="name">${person.name}</div>
                    <div class="amount">${formatCurrency(person.total_emprestado)}</div>
                `;
                top5Container.appendChild(card);
            });
        } else {
            top5Container.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">Nenhum empréstimo registrado.</p>';
        }
    };
    
    const updateEntradas = (payments) => {
        if (!entradasTableBody) return;
        entradasTableBody.innerHTML = '';
        if (payments.length > 0) {
            payments.forEach(p => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${p.id}</td><td>${p.name}</td><td>${formatCurrency(p.amount_paid)}</td><td>${formatDate(p.payment_date)}</td>
                    <td>${p.description || 'N/A'}</td><td>${p.attachment_path ? `<a href="/${p.attachment_path.replace('public/', '')}" target="_blank">Ver Anexo</a>` : 'Não'}</td>
                    <td><button class="action-btn edit-btn" data-payment-id="${p.id}">Editar</button></td>`;
                entradasTableBody.appendChild(row);
            });
        } else {
            entradasTableBody.innerHTML = '<tr><td colspan="7">Nenhum pagamento encontrado para este período.</td></tr>';
        }
    };
    
    const updateSaidas = (data) => {
        if (!saidasTableBody) return;
        saidasTableBody.innerHTML = '';
        if(data.all_loans && data.all_loans.length > 0) {
            data.all_loans.forEach(loan => {
                const row = document.createElement('tr');
                const statusClass = loan.status.toLowerCase().replace(/\s/g, '-');
                const isPaid = loan.status === 'Pago';
                const quitButton = isPaid ? `<span>✓ Quitado</span>` : `<button class="action-btn quit-btn" data-loan-id="${loan.id}">Quitar</button>`;
                row.innerHTML = `
                    <td>${loan.id}</td>
                    <td>${loan.name}</td>
                    <td>${formatDate(loan.loan_date)}</td>
                    <td>${formatCurrency(loan.amount)}</td>
                    <td>${formatCurrency(loan.amount_with_interest)}</td>
                    <td>${formatCurrency(loan.balance_due)}</td>
                    <td>${formatCurrency(loan.interest_paid)}</td>
                    <td>${formatDate(loan.return_date)}</td>
                    <td><span class="status-badge status-${statusClass}">${loan.status}</span></td>
                    <td>${loan.attachment_path ? `<a href="/${loan.attachment_path.replace('public/', '')}" target="_blank">Ver Anexo</a>` : 'Não'}</td>
                    <td>
                        <div class="action-buttons-group">
                            <button class="action-btn details-btn" data-loan-id="${loan.id}">Detalhes</button>
                            <button class="action-btn edit-btn" data-loan-id="${loan.id}">Editar</button>
                            ${quitButton}
                        </div>
                    </td>`;
                saidasTableBody.appendChild(row);
            });
        } else {
            saidasTableBody.innerHTML = '<tr><td colspan="11">Nenhum empréstimo encontrado para este período.</td></tr>';
        }
    };
    
    const updateSortIndicator = (tab) => {
        const table = tab === 'entradas' ? entradasTable : saidasTable;
        if (!table) return;
        table.querySelectorAll('th.sortable').forEach(th => {
            th.classList.remove('asc', 'desc');
            if (th.dataset.sort === viewState[tab].sortBy) {
                th.classList.add(viewState[tab].order);
            }
        });
    };
    
    // --- FUNÇÕES AUXILIARES ---
    const showFilterAppliedFeedback = () => {
        const feedback = document.createElement('div');
        feedback.textContent = 'Filtro aplicado com sucesso!';
        feedback.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #28a745;
            color: white;
            padding: 10px 20px;
            border-radius: 5px;
            z-index: 1000;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            font-family: 'Poppins', sans-serif;
            font-weight: 500;
        `;
        document.body.appendChild(feedback);
        
        setTimeout(() => {
            feedback.style.opacity = '0';
            feedback.style.transition = 'opacity 0.5s';
            setTimeout(() => feedback.remove(), 500);
        }, 2000);
    };
    
    const debounce = (func, wait) => {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    };
    
    const abrirModalAtrasados = async () => {
        if (!atrasadosModal || !atrasadosLista) {
            console.error('Elementos do modal de atrasados não encontrados');
            alert('Erro: Elementos do modal não encontrados');
            return;
        }
        
        // Mostrar modal
        atrasadosModal.style.display = 'flex';
        
        // Limpar conteúdo anterior
        atrasadosLista.innerHTML = '<p>Carregando...</p>';
        
        try {
            // Buscar lista de atrasados
            const response = await fetchWithAuth('/api/loans/atrasados');
            if (!response.ok) throw new Error('Erro ao carregar lista de atrasados');
            
            const atrasados = await response.json();
            // Processar os dados para garantir dias inteiros
            const atrasadosProcessados = atrasados.map(loan => ({
                ...loan,
                dias_atraso: Math.abs(parseInt(loan.dias_atraso) || 0)
            }));
            
            // Renderizar lista
            renderizarListaAtrasados(atrasadosProcessados);
            
        } catch (error) {
            console.error('Erro ao carregar atrasados:', error);
            atrasadosLista.innerHTML = '<p class="sem-atrasados">Erro ao carregar lista de atrasados</p>';
        }
    };
    
    const renderizarListaAtrasados = (atrasados) => {
        if (!atrasadosLista) {
            console.error('Elemento atrasados-lista não encontrado');
            return;
        }
        
        if (atrasados && atrasados.length > 0) {
            atrasadosLista.innerHTML = '';
            
            atrasados.forEach(loan => {
                const atrasadoItem = document.createElement('div');
                atrasadoItem.className = 'atrasado-item';
                
                // Garantir que o valor seja positivo
                let diasAtraso = Math.abs(parseInt(loan.dias_atraso) || 0);
                const textoDias = diasAtraso === 1 ? 'dia' : 'dias';
                
                atrasadoItem.innerHTML = `
                    <div class="atrasado-info">
                        <div class="atrasado-nome">${loan.name}</div>
                        <div class="atrasado-detalhes">Vencido em ${formatDate(loan.return_date)}</div>
                    </div>
                    <div class="atrasado-valor">${formatCurrency(loan.balance_due)}</div>
                    <div class="atrasado-dias">${diasAtraso} ${textoDias}</div>
                `;
                
                // Adicionar evento de clique para ver detalhes
                atrasadoItem.addEventListener('click', () => {
                    // Fechar modal de atrasados
                    if (atrasadosModal) atrasadosModal.style.display = 'none';
                    // Abrir modal de detalhes
                    const loan = allLoansData.find(l => l.id == loan.id);
                    if (loan) {
                        document.getElementById('details-content').innerHTML = `
                            <div class="details-grid">
                                <div class="details-section">
                                    <h3>Dados Pessoais</h3>
                                    <p><strong>Nome:</strong> ${loan.name || 'N/A'}</p>
                                    <p><strong>CPF:</strong> ${loan.cpf || 'N/A'}</p>
                                    <p><strong>Telefone:</strong> ${loan.phone || 'N/A'}</p>
                                    <p><strong>Endereço:</strong> ${loan.address_street || 'N/A'}, ${loan.address_bairro || ''} - ${loan.address_city || ''} / CEP: ${loan.address_cep || 'N/A'}</p>
                                </div>
                                <div class="details-section">
                                    <h3>Dados do Empréstimo</h3>
                                    <p><strong>Data do Empréstimo:</strong> ${formatDate(loan.loan_date)}</p>
                                    <p><strong>Data de Vencimento:</strong> ${formatDate(loan.return_date)}</p>
                                    <p><strong>Valor Emprestado:</strong> ${formatCurrency(loan.amount)}</p>
                                    <p><strong>Valor Total com Juros:</strong> ${formatCurrency(loan.amount_with_interest)}</p>
                                    <p><strong>Saldo Devedor:</strong> ${formatCurrency(loan.balance_due)}</p>
                                    <p><strong>Status:</strong> ${loan.status}</p>
                                    <p><strong>Dias de Atraso:</strong> <span style="color: #dc3545; font-weight: bold;">${diasAtraso} ${textoDias}</span></p>
                                </div>
                            </div>
                        `;
                        detailsModal.style.display = 'flex';
                    }
                });
                
                atrasadosLista.appendChild(atrasadoItem);
            });
        } else {
            atrasadosLista.innerHTML = '<p class="sem-atrasados">Nenhum empréstimo atrasado</p>';
        }
    };
    
    // --- FUNÇÕES DA ABA DE RELATÓRIOS ---
    // Variáveis para armazenar os gráficos
    let financialChart, statusChart, cashflowChart, debtorsChart;
    
    // Função para carregar dados da aba de relatórios
    const loadReportsData = async () => {
        const startDate = document.getElementById('report-start-date').value;
        const endDate = document.getElementById('report-end-date').value;
        
        // Construir parâmetros de consulta
        const params = {};
        if (startDate) params.start_date = startDate;
        if (endDate) params.end_date = endDate;
        
        try {
            // Mostrar indicador de carregamento
            showLoadingIndicator();
            
            // Carregar KPIs
            const kpiResponse = await fetchWithAuth(`/api/reports/kpi?${createQueryString(params)}`);
            const kpiData = await kpiResponse.json();
            
            // Atualizar KPIs
            document.getElementById('report-total-loaned').textContent = formatCurrency(kpiData.total_loaned);
            document.getElementById('report-total-balance').textContent = formatCurrency(kpiData.total_balance_due);
            document.getElementById('report-total-interest').textContent = formatCurrency(kpiData.total_interest);
            document.getElementById('report-active-loans').textContent = kpiData.active_loans;
            document.getElementById('report-overdue-loans').textContent = kpiData.overdue_loans;
            document.getElementById('report-default-rate').textContent = `${kpiData.default_rate.toFixed(2)}%`;
            
            // Carregar dados para gráficos
            const [
                financialData,
                statusData,
                cashflowData,
                debtorsData,
                upcomingData,
                overdueData,
                paymentsData,
                interestData
            ] = await Promise.all([
                fetchWithAuth(`/api/reports/financial?${createQueryString(params)}`).then(res => res.json()),
                fetchWithAuth(`/api/reports/status-distribution?${createQueryString(params)}`).then(res => res.json()),
                fetchWithAuth(`/api/reports/cash-flow?${createQueryString(params)}`).then(res => res.json()),
                fetchWithAuth(`/api/reports/top-debtors?${createQueryString(params)}`).then(res => res.json()),
                fetchWithAuth(`/api/reports/upcoming-due?${createQueryString(params)}`).then(res => res.json()),
                fetchWithAuth(`/api/reports/overdue?${createQueryString(params)}`).then(res => res.json()),
                fetchWithAuth(`/api/reports/payment-history?${createQueryString(params)}`).then(res => res.json()),
                fetchWithAuth(`/api/reports/interest-summary?${createQueryString(params)}`).then(res => res.json())
            ]);
            
            // Atualizar gráficos
            updateFinancialChart(financialData);
            updateStatusChart(statusData);
            updateCashflowChart(cashflowData);
            updateDebtorsChart(debtorsData);
            
            // Atualizar tabelas
            updateUpcomingTable(upcomingData);
            updateOverdueTable(overdueData);
            updatePaymentsTable(paymentsData);
            updateInterestTable(interestData);
            
            // Ocultar indicador de carregamento
            hideLoadingIndicator();
            
        } catch (error) {
            console.error('Erro ao carregar dados de relatórios:', error);
            hideLoadingIndicator();
            alert('Não foi possível carregar os dados de relatórios: ' + error.message);
        }
    };
    
    // Função para atualizar o gráfico financeiro (Emprestado vs. Pago)
    const updateFinancialChart = (data) => {
        const ctx = document.getElementById('financial-chart').getContext('2d');
        
        // Se o gráfico já existe, destruí-lo antes de criar um novo
        if (financialChart) {
            financialChart.destroy();
        }
        
        financialChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.map(item => moment(item.month).format('MMM/YYYY')),
                datasets: [
                    {
                        label: 'Total Emprestado',
                        data: data.map(item => item.total_loaned),
                        backgroundColor: 'rgba(106, 90, 205, 0.7)',
                        borderColor: 'rgba(106, 90, 205, 1)',
                        borderWidth: 1
                    },
                    {
                        label: 'Total Pago',
                        data: data.map(item => item.total_paid),
                        backgroundColor: 'rgba(40, 167, 69, 0.7)',
                        borderColor: 'rgba(40, 167, 69, 1)',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return 'R$ ' + value.toLocaleString('pt-BR');
                            }
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return context.dataset.label + ': R$ ' + context.raw.toLocaleString('pt-BR');
                            }
                        }
                    }
                }
            }
        });
    };
    
    // Função para atualizar o gráfico de status
    const updateStatusChart = (data) => {
        const ctx = document.getElementById('status-chart').getContext('2d');
        
        // Se o gráfico já existe, destruí-lo antes de criar um novo
        if (statusChart) {
            statusChart.destroy();
        }
        
        // Mapear cores para cada status
        const statusColors = {
            'Pago': 'rgba(40, 167, 69, 0.7)',
            'Pendente': 'rgba(255, 193, 7, 0.7)',
            'Atrasado': 'rgba(220, 53, 69, 0.7)',
            'Parcialmente Pago': 'rgba(23, 162, 184, 0.7)'
        };
        
        statusChart = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: data.map(item => item.status),
                datasets: [{
                    data: data.map(item => item.count),
                    backgroundColor: data.map(item => statusColors[item.status] || 'rgba(106, 90, 205, 0.7)'),
                    borderColor: data.map(item => statusColors[item.status] ? statusColors[item.status].replace('0.7', '1') : 'rgba(106, 90, 205, 1)'),
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = context.raw || 0;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = Math.round((value / total) * 100);
                                return `${label}: ${value} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    };
    
    // Função para atualizar o gráfico de fluxo de caixa
    const updateCashflowChart = (data) => {
        const ctx = document.getElementById('cashflow-chart').getContext('2d');
        
        // Se o gráfico já existe, destruí-lo antes de criar um novo
        if (cashflowChart) {
            cashflowChart.destroy();
        }
        
        cashflowChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.map(item => moment(item.month).format('MMM/YYYY')),
                datasets: [
                    {
                        label: 'Entradas (Pagamentos)',
                        data: data.map(item => item.total_inflow),
                        backgroundColor: 'rgba(40, 167, 69, 0.2)',
                        borderColor: 'rgba(40, 167, 69, 1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4
                    },
                    {
                        label: 'Saídas (Empréstimos)',
                        data: data.map(item => item.total_outflow),
                        backgroundColor: 'rgba(220, 53, 69, 0.2)',
                        borderColor: 'rgba(220, 53, 69, 1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return 'R$ ' + value.toLocaleString('pt-BR');
                            }
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return context.dataset.label + ': R$ ' + context.raw.toLocaleString('pt-BR');
                            }
                        }
                    }
                }
            }
        });
    };
    
    // Função para atualizar o gráfico de top devedores
    const updateDebtorsChart = (data) => {
        const ctx = document.getElementById('debtors-chart').getContext('2d');
        
        // Se o gráfico já existe, destruí-lo antes de criar um novo
        if (debtorsChart) {
            debtorsChart.destroy();
        }
        
        debtorsChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.map(item => item.name),
                datasets: [{
                    label: 'Saldo Devedor',
                    data: data.map(item => item.total_balance),
                    backgroundColor: 'rgba(220, 53, 69, 0.7)',
                    borderColor: 'rgba(220, 53, 69, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return 'R$ ' + value.toLocaleString('pt-BR');
                            }
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return 'Saldo Devedor: R$ ' + context.raw.toLocaleString('pt-BR');
                            }
                        }
                    }
                }
            }
        });
    };
    
    // Função para atualizar a tabela de empréstimos com vencimento em até 30 dias
    const updateUpcomingTable = (data) => {
        const tbody = document.querySelector('#upcoming-table tbody');
        tbody.innerHTML = '';
        
        if (data.length > 0) {
            data.forEach(loan => {
                const row = document.createElement('tr');
                const statusClass = loan.status.toLowerCase().replace(/\s/g, '-');
                
                row.innerHTML = `
                    <td>${loan.id}</td>
                    <td>${loan.name}</td>
                    <td>${formatCurrency(loan.amount)}</td>
                    <td>${formatCurrency(loan.balance_due)}</td>
                    <td>${formatDate(loan.return_date)}</td>
                    <td><span class="status-badge status-${statusClass}">${loan.status}</span></td>
                `;
                
                tbody.appendChild(row);
            });
        } else {
            tbody.innerHTML = '<tr><td colspan="6">Nenhum empréstimo com vencimento próximo encontrado.</td></tr>';
        }
    };
    
    // Função para atualizar a tabela de empréstimos atrasados
    const updateOverdueTable = (data) => {
        const tbody = document.querySelector('#overdue-table tbody');
        tbody.innerHTML = '';
        
        if (data.length > 0) {
            data.forEach(loan => {
                const row = document.createElement('tr');
                
                row.innerHTML = `
                    <td>${loan.id}</td>
                    <td>${loan.name}</td>
                    <td>${formatCurrency(loan.amount)}</td>
                    <td>${formatCurrency(loan.balance_due)}</td>
                    <td>${formatDate(loan.return_date)}</td>
                    <td>${Math.abs(loan.days_overdue)} dias</td>
                `;
                
                tbody.appendChild(row);
            });
        } else {
            tbody.innerHTML = '<tr><td colspan="6">Nenhum empréstimo atrasado encontrado.</td></tr>';
        }
    };
    
    // Função para atualizar a tabela de histórico de pagamentos
    const updatePaymentsTable = (data) => {
        const tbody = document.querySelector('#payments-table tbody');
        tbody.innerHTML = '';
        
        if (data.length > 0) {
            data.forEach(payment => {
                const row = document.createElement('tr');
                
                row.innerHTML = `
                    <td>${payment.id}</td>
                    <td>${payment.debtor_name}</td>
                    <td>${formatCurrency(payment.amount_paid)}</td>
                    <td>${formatDate(payment.payment_date)}</td>
                    <td>${payment.description || 'N/A'}</td>
                `;
                
                tbody.appendChild(row);
            });
        } else {
            tbody.innerHTML = '<tr><td colspan="5">Nenhum pagamento encontrado para este período.</td></tr>';
        }
    };
    
    // Função para atualizar a tabela de resumo de juros
    const updateInterestTable = (data) => {
        const tbody = document.querySelector('#interest-table tbody');
        tbody.innerHTML = '';
        
        if (data.length > 0) {
            data.forEach(item => {
                const row = document.createElement('tr');
                
                row.innerHTML = `
                    <td>${moment(item.month).format('MMMM/YYYY')}</td>
                    <td>${formatCurrency(item.total_paid)}</td>
                    <td>${formatCurrency(item.total_interest)}</td>
                `;
                
                tbody.appendChild(row);
            });
        } else {
            tbody.innerHTML = '<tr><td colspan="3">Nenhum dado de juros encontrado para este período.</td></tr>';
        }
    };
    
    // Função para mostrar indicador de carregamento
    const showLoadingIndicator = () => {
        const chartsContainer = document.querySelector('.charts-container');
        const tablesContainer = document.querySelector('.tables-container');
        
        if (chartsContainer) {
            chartsContainer.style.opacity = '0.5';
            chartsContainer.style.position = 'relative';
            
            // Adicionar indicador de carregamento se não existir
            if (!chartsContainer.querySelector('.loading-indicator')) {
                const loadingDiv = document.createElement('div');
                loadingDiv.className = 'loading-indicator';
                loadingDiv.innerHTML = '<i class="fas fa-spinner"></i> Carregando dados...';
                loadingDiv.style.position = 'absolute';
                loadingDiv.style.top = '50%';
                loadingDiv.style.left = '50%';
                loadingDiv.style.transform = 'translate(-50%, -50%)';
                loadingDiv.style.zIndex = '10';
                chartsContainer.appendChild(loadingDiv);
            }
        }
        
        if (tablesContainer) {
            tablesContainer.style.opacity = '0.5';
        }
    };
    
    // Função para ocultar indicador de carregamento
    const hideLoadingIndicator = () => {
        const chartsContainer = document.querySelector('.charts-container');
        const tablesContainer = document.querySelector('.tables-container');
        
        if (chartsContainer) {
            chartsContainer.style.opacity = '1';
            
            // Remover indicador de carregamento se existir
            const loadingIndicator = chartsContainer.querySelector('.loading-indicator');
            if (loadingIndicator) {
                loadingIndicator.remove();
            }
        }
        
        if (tablesContainer) {
            tablesContainer.style.opacity = '1';
        }
    };
    
    // --- NOVAS FUNÇÕES DE EXPORTAÇÃO XLSX ---
    // Exportar tabela como XLSX
    const exportTableAsXLSX = (tableId, fileName, sheetName = 'Dados') => {
        const table = document.getElementById(tableId);
        if (!table) return;
        const rows = [];
        // Cabeçalho
        const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.innerText.trim());
        rows.push(headers);
        // Dados
        table.querySelectorAll('tbody tr').forEach(tr => {
            const rowData = Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim());
            rows.push(rowData);
        });
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
        XLSX.writeFile(wb, fileName);
    };
    
    // Exportar relatório completo (todas as tabelas em abas)
    const exportAllReportsAsXLSX = () => {
        const today = new Date().toISOString().split('T')[0];
        const fileName = `relatorio-completo-${today}.xlsx`;
        const wb = XLSX.utils.book_new();
        // 1. Aba: Empréstimos com Vencimento Próximo
        const upcomingTable = document.getElementById('upcoming-table');
        if (upcomingTable) {
            const upcomingRows = [];
            const upcomingHeaders = Array.from(upcomingTable.querySelectorAll('thead th')).map(th => th.innerText.trim());
            upcomingRows.push(upcomingHeaders);
            upcomingTable.querySelectorAll('tbody tr').forEach(tr => {
                upcomingRows.push(Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim()));
            });
            const upcomingWs = XLSX.utils.aoa_to_sheet(upcomingRows);
            XLSX.utils.book_append_sheet(wb, upcomingWs, 'Vencimento Próximo');
        }
        // 2. Aba: Empréstimos Atrasados
        const overdueTable = document.getElementById('overdue-table');
        if (overdueTable) {
            const overdueRows = [];
            const overdueHeaders = Array.from(overdueTable.querySelectorAll('thead th')).map(th => th.innerText.trim());
            overdueRows.push(overdueHeaders);
            overdueTable.querySelectorAll('tbody tr').forEach(tr => {
                overdueRows.push(Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim()));
            });
            const overdueWs = XLSX.utils.aoa_to_sheet(overdueRows);
            XLSX.utils.book_append_sheet(wb, overdueWs, 'Empréstimos Atrasados');
        }
        // 3. Aba: Histórico de Pagamentos
        const paymentsTable = document.getElementById('payments-table');
        if (paymentsTable) {
            const paymentsRows = [];
            const paymentsHeaders = Array.from(paymentsTable.querySelectorAll('thead th')).map(th => th.innerText.trim());
            paymentsRows.push(paymentsHeaders);
            paymentsTable.querySelectorAll('tbody tr').forEach(tr => {
                paymentsRows.push(Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim()));
            });
            const paymentsWs = XLSX.utils.aoa_to_sheet(paymentsRows);
            XLSX.utils.book_append_sheet(wb, paymentsWs, 'Histórico de Pagamentos');
        }
        // 4. Aba: Resumo de Juros
        const interestTable = document.getElementById('interest-table');
        if (interestTable) {
            const interestRows = [];
            const interestHeaders = Array.from(interestTable.querySelectorAll('thead th')).map(th => th.innerText.trim());
            interestRows.push(interestHeaders);
            interestTable.querySelectorAll('tbody tr').forEach(tr => {
                interestRows.push(Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim()));
            });
            const interestWs = XLSX.utils.aoa_to_sheet(interestRows);
            XLSX.utils.book_append_sheet(wb, interestWs, 'Resumo de Juros');
        }
        // 5. Aba: Informações do Relatório
        const infoData = [
            ['Informações do Relatório'],
            ['Data de Geração', new Date().toLocaleDateString('pt-BR')],
            ['Período', `${document.getElementById('report-start-date').value || 'Início'} a ${document.getElementById('report-end-date').value || 'Fim'}`],
            ['Sistema', 'Sistema de Controle de Empréstimos']
        ];
        const infoWs = XLSX.utils.aoa_to_sheet(infoData);
        XLSX.utils.book_append_sheet(wb, infoWs, 'Informações');
        // Gerar arquivo e disparar download
        XLSX.writeFile(wb, fileName);
        alert(`Relatório completo exportado com sucesso como ${fileName}`);
    };
    
    // --- EVENT LISTENERS ---
    document.getElementById('logout-button')?.addEventListener('click', () => { 
        localStorage.clear(); 
        window.location.href = '/login.html'; 
    });
    
    document.getElementById('password-change-form')?.addEventListener('submit', async (e) => { 
        e.preventDefault(); 
        
        // Verificar se o elemento existe antes de acessá-lo
        const newPasswordInput = document.getElementById('new-password');
        if (!newPasswordInput) {
            console.error('Elemento "new-password" não encontrado');
            alert('Erro no formulário. Por favor, recarregue a página.');
            return;
        }
        
        const newPassword = newPasswordInput.value;
        
        // Validação básica
        if (!newPassword) {
            alert('Por favor, digite uma nova senha.');
            return;
        }
        
        if (newPassword.length < 6) {
            alert('A nova senha deve ter pelo menos 6 caracteres.');
            return;
        }
        
        try { 
            const response = await fetchWithAuth('/api/auth/change-password', { 
                method: 'POST', 
                body: JSON.stringify({ newPassword }) 
            }); 
            
            if (!response.ok) { 
                const errData = await response.json(); 
                throw new Error(errData.error || 'Erro ao alterar senha.'); 
            } 
            
            const data = await response.json();
            alert(data.message || 'Senha atualizada com sucesso!');
            
            // Atualizar o flag de troca de senha
            localStorage.setItem('mustChangePassword', 'false');
            
            // Fechar o modal
            if (passwordModal) {
                passwordModal.style.display = 'none';
            }
            
            // Recarregar os dados para garantir que tudo está atualizado
            refreshAllData();
        } catch (error) { 
            console.error('Erro ao alterar senha:', error);
            alert(`Erro: ${error.message}`); 
        } 
    });
    
    // Event listener para fechar todos os modais
    document.querySelectorAll('.modal .close-button').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.target.closest('.modal').style.display = 'none';
        });
    });
    
    // Event listener para abrir modal de atrasados
    const cardAtrasados = document.querySelector('.card-atrasado');
    if (cardAtrasados) {
        cardAtrasados.addEventListener('click', () => {
            abrirModalAtrasados();
        });
    }
    
    // Formulário de novo empréstimo com tratamento de erro de upload
    newLoanForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(newLoanForm);
        try {
            const response = await fetchWithAuth('/api/loans', { 
                method: 'POST', 
                body: formData 
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                if (errorData.error) {
                    alert('Erro: ' + errorData.error);
                } else {
                    throw new Error('Falha ao criar empréstimo');
                }
                return;
            }
            
            loanModal.style.display = 'none';
            newLoanForm.reset();
            refreshAllData();
        } catch (error) {
            alert('Não foi possível salvar: ' + error.message);
        }
    });
    
    // Formulário de novo pagamento com tratamento de erro de upload
    newPaymentForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const loanId = document.getElementById('payment-loan-id').value;
        if (!loanId) { 
            alert('Selecione um devedor válido da lista.'); 
            return; 
        }
        const formData = new FormData(newPaymentForm);
        try {
            const response = await fetchWithAuth(`/api/loans/${loanId}/payments`, { 
                method: 'POST', 
                body: formData 
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                if (errorData.error) {
                    alert('Erro: ' + errorData.error);
                } else {
                    throw new Error('Falha ao registrar pagamento');
                }
                return;
            }
            
            paymentModal.style.display = 'none';
            refreshAllData();
        } catch (error) {
            alert('Não foi possível registrar o pagamento: ' + error.message);
        }
    });
    
    navButtons.forEach(button => button.addEventListener('click', (e) => {
        const activeTab = e.currentTarget.dataset.tab;
        navButtons.forEach(btn => btn.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        e.currentTarget.classList.add('active');
        document.getElementById(activeTab + "-content").classList.add('active');
        
        const currentTabContent = document.getElementById(activeTab + "-content");
        if (currentTabContent) {
            if (activeTab === 'saidas') {
                const dateInput = currentTabContent.querySelector('.filter-date');
                if (dateInput) dateInput.value = '';
                viewState[activeTab].return_date = '';
            } else {
                const monthSelect = currentTabContent.querySelector('.filter-month');
                const yearSelect = currentTabContent.querySelector('.filter-year');
                if (monthSelect) monthSelect.value = '';
                if (yearSelect) yearSelect.value = new Date().getFullYear();
                viewState[activeTab].mes = monthSelect ? monthSelect.value : '';
                viewState[activeTab].ano = yearSelect ? yearSelect.value : new Date().getFullYear().toString();
            }
        }
        
        loadFilteredData(activeTab);
    }));
    
    document.querySelectorAll('.apply-filter-button').forEach(button => {
        button.addEventListener('click', () => {
            const activeTabContent = document.querySelector('.tab-content.active');
            const activeTab = activeTabContent.id.replace('-content', '');
            
            if (activeTab === 'saidas') {
                const return_date = activeTabContent.querySelector('.filter-date').value;
                viewState[activeTab].return_date = return_date;
            } else {
                const mes = activeTabContent.querySelector('.filter-month').value;
                const ano = activeTabContent.querySelector('.filter-year').value;
                viewState[activeTab].mes = mes;
                viewState[activeTab].ano = ano;
            }
            
            loadFilteredData(activeTab);
            showFilterAppliedFeedback();
        });
    });
    
    // Event listeners para busca em tempo real com debounce
    if(searchEntradasInput) {
        // Criar versão com debounce da função loadEntradasData
        const debouncedLoadEntradasData = debounce(() => {
            loadEntradasData();
        }, 300); // 300ms de espera
        
        // Adicionar listener para input (busca em tempo real)
        searchEntradasInput.addEventListener('input', (e) => {
            viewState.entradas.search = e.target.value;
            debouncedLoadEntradasData();
        });
        
        // Adicionar listener para detectar quando o campo é limpo
        searchEntradasInput.addEventListener('search', (e) => {
            // Este evento é acionado quando o "x" é clicado no campo de busca
            viewState.entradas.search = '';
            loadEntradasData(); // Sem debounce para resposta imediata
        });
    }
    
    if(searchSaidasInput) {
        // Criar versão com debounce da função loadSaidasData
        const debouncedLoadSaidasData = debounce(() => {
            loadSaidasData();
        }, 300); // 300ms de espera
        
        // Adicionar listener para input (busca em tempo real)
        searchSaidasInput.addEventListener('input', (e) => {
            viewState.saidas.search = e.target.value;
            debouncedLoadSaidasData();
        });
        
        // Adicionar listener para detectar quando o campo é limpo
        searchSaidasInput.addEventListener('search', (e) => {
            // Este evento é acionado quando o "x" é clicado no campo de busca
            viewState.saidas.search = '';
            loadSaidasData(); // Sem debounce para resposta imediata
        });
    }
    
    if(entradasTable) entradasTable.querySelector('thead').addEventListener('click', (e) => {
        const th = e.target.closest('th.sortable'); 
        if (!th) return;
        const sortKey = th.dataset.sort;
        if (viewState.entradas.sortBy === sortKey) { 
            viewState.entradas.order = viewState.entradas.order === 'asc' ? 'desc' : 'asc'; 
        } else { 
            viewState.entradas.sortBy = sortKey; 
            viewState.entradas.order = 'desc'; 
        }
        loadEntradasData();
        showFilterAppliedFeedback();
    });
    
    if(saidasTable) saidasTable.querySelector('thead').addEventListener('click', (e) => {
        const th = e.target.closest('th.sortable'); 
        if (!th) return;
        const sortKey = th.dataset.sort;
        if (viewState.saidas.sortBy === sortKey) { 
            viewState.saidas.order = viewState.saidas.order === 'asc' ? 'desc' : 'asc'; 
        } else { 
            viewState.saidas.sortBy = sortKey; 
            viewState.saidas.order = 'desc'; 
        }
        loadSaidasData();
        showFilterAppliedFeedback();
    });
    
    document.getElementById('add-novo-emprestimo')?.addEventListener('click', () => { 
        newLoanForm.reset(); 
        loanModal.style.display = 'flex'; 
    });
    
    document.getElementById('add-nova-entrada')?.addEventListener('click', async () => { 
        newPaymentForm.reset(); 
        await populatePendingLoansDatalist(); 
        paymentModal.style.display = 'flex'; 
    });
    
    if(saidasTableBody) saidasTableBody.addEventListener('click', async (e) => {
        const button = e.target.closest('.action-btn'); 
        if (!button) return;
        const loanId = button.dataset.loanId; 
        if (!loanId) return;
        
        if (button.classList.contains('quit-btn')) { 
            if (confirm(`Tem certeza que deseja quitar o saldo principal deste empréstimo?`)) { 
                try { 
                    await fetchWithAuth(`/api/loans/${loanId}/mark-as-paid`, { method: 'PUT' }); 
                    refreshAllData(); 
                } catch (error) { 
                    alert('Não foi possível quitar o empréstimo.'); 
                } 
            } 
        }
        else if (button.classList.contains('details-btn')) {
            const loan = allLoansData.find(l => l.id == loanId);
            if (loan) { 
                document.getElementById('details-content').innerHTML = `
                    <div class="details-grid">
                        <div class="details-section">
                            <h3>Dados Pessoais</h3>
                            <p><strong>Nome:</strong> ${loan.name || 'N/A'}</p>
                            <p><strong>CPF:</strong> ${loan.cpf || 'N/A'}</p>
                            <p><strong>Telefone:</strong> ${loan.phone || 'N/A'}</p>
                            <p><strong>Endereço:</strong> ${loan.address_street || 'N/A'}, ${loan.address_bairro || ''} - ${loan.address_city || ''} / CEP: ${loan.address_cep || 'N/A'}</p>
                        </div>
                        <div class="details-section">
                            <h3>Dados do Empréstimo</h3>
                            <p><strong>Data do Empréstimo:</strong> ${formatDate(loan.loan_date)}</p>
                            <p><strong>Data de Vencimento:</strong> ${formatDate(loan.return_date)}</p>
                            <p><strong>Valor Emprestado:</strong> ${formatCurrency(loan.amount)}</p>
                            <p><strong>Valor Total com Juros:</strong> ${formatCurrency(loan.amount_with_interest)}</p>
                            <p><strong>Saldo Devedor:</strong> ${formatCurrency(loan.balance_due)}</p>
                            <p><strong>Status:</strong> ${loan.status}</p>
                        </div>
                    </div>
                `; 
                detailsModal.style.display = 'flex'; 
            }
        } else if (button.classList.contains('edit-btn')) {
            const response = await fetchWithAuth(`/api/loans/${loanId}`); 
            const loan = await response.json();
            for (const key in loan) { 
                const input = editLoanForm.querySelector(`[name="${key}"]`); 
                if (input && input.type === 'date') {
                    input.value = moment(loan[key]).format('YYYY-MM-DD'); 
                } else if (input) {
                    input.value = loan[key]; 
                }
            }
            editLoanForm.querySelector('#edit-loan-id').value = loan.id; 
            const undoContainer = document.getElementById('undo-quit-container'); 
            undoContainer.style.display = loan.status === 'Pago' ? 'block' : 'none'; 
            if (undoContainer.querySelector('input')) {
                undoContainer.querySelector('input').checked = false; 
            }
            editLoanModal.style.display = 'flex';
        }
    });
    
    if(entradasTableBody) entradasTableBody.addEventListener('click', async (e) => {
        const button = e.target.closest('.action-btn'); 
        if (!button) return;
        const paymentId = button.dataset.paymentId; 
        if (!paymentId) return;
        
        if (button.classList.contains('edit-btn')) {
            try {
                const response = await fetchWithAuth(`/api/loans/payments/${paymentId}`);
                if (!response.ok) throw new Error('Pagamento não encontrado');
                const payment = await response.json();
                const loan = allLoansData.find(l => l.id === payment.loan_id);
                
                document.getElementById('edit-payment-id').value = payment.id;
                document.getElementById('edit-payment-loan-id').value = payment.loan_id;
                document.getElementById('edit-payment-name').textContent = loan ? loan.name : 'Desconhecido';
                document.getElementById('edit-payment-amount').value = payment.amount_paid;
                document.getElementById('edit-payment-date').value = moment(payment.payment_date).format('YYYY-MM-DD');
                document.getElementById('edit-payment-description').value = payment.description;
                
                editPaymentModal.style.display = 'flex';
            } catch(error) { 
                alert('Não foi possível carregar os dados do pagamento para edição.'); 
            }
        }
    });
    
    // Formulário de edição de empréstimo com tratamento de erro de upload
    if(editLoanForm) editLoanForm.addEventListener('submit', async (e) => { 
        e.preventDefault(); 
        const loanId = document.getElementById('edit-loan-id').value; 
        const formData = new FormData(editLoanForm); 
        try { 
            const response = await fetchWithAuth(`/api/loans/${loanId}`, { 
                method: 'PUT', 
                body: formData 
            }); 
            
            if (!response.ok) {
                const errorData = await response.json();
                if (errorData.error) {
                    alert('Erro: ' + errorData.error);
                } else {
                    throw new Error('Falha ao atualizar empréstimo');
                }
                return;
            }
            
            editLoanModal.style.display = 'none'; 
            refreshAllData(); 
        } catch(error) { 
            alert('Falha ao salvar as alterações: ' + error.message); 
        } 
    });
    
    // Formulário de edição de pagamento com tratamento de erro de upload
    if(editPaymentForm) editPaymentForm.addEventListener('submit', async (e) => { 
        e.preventDefault(); 
        const paymentId = document.getElementById('edit-payment-id').value; 
        const formData = new FormData(editPaymentForm); 
        try { 
            const response = await fetchWithAuth(`/api/loans/payments/${paymentId}`, { 
                method: 'PUT', 
                body: formData 
            }); 
            
            if (!response.ok) {
                const errorData = await response.json();
                if (errorData.error) {
                    alert('Erro: ' + errorData.error);
                } else {
                    throw new Error('Falha ao atualizar pagamento');
                }
                return;
            }
            
            editPaymentModal.style.display = 'none'; 
            refreshAllData(); 
        } catch(error) { 
            alert('Falha ao salvar as alterações do pagamento: ' + error.message); 
        } 
    });
    
    window.addEventListener('click', (e) => { 
        if (e.target.classList.contains('modal')) {
            e.target.style.display = 'none'; 
        }
    });
    
    const paymentLoanInput = document.getElementById('payment-loan-input');
    if(paymentLoanInput) {
        paymentLoanInput.addEventListener('input', (e) => { 
            const option = Array.from(document.querySelectorAll('#pending-loans-list option')).find(opt => opt.value === e.target.value); 
            document.getElementById('payment-loan-id').value = option ? option.dataset.id : ''; 
        });
    }
    
    // --- EVENT LISTENERS DA ABA DE RELATÓRIOS ---
    // Verificar se estamos na aba de relatórios
    const relatoriosTab = document.getElementById('relatorios-content');
    if (relatoriosTab) {
        // Botões de aplicação de filtros
        const applyFiltersBtn = document.getElementById('apply-report-filters');
        const resetFiltersBtn = document.getElementById('reset-report-filters');
        
        // Adicionar event listeners
        if (applyFiltersBtn) {
            applyFiltersBtn.addEventListener('click', loadReportsData);
        }
        
        if (resetFiltersBtn) {
            resetFiltersBtn.addEventListener('click', () => {
                document.getElementById('report-start-date').value = '';
                document.getElementById('report-end-date').value = '';
                document.getElementById('report-status').value = '';
                document.getElementById('report-debtor').value = '';
                loadReportsData();
            });
        }
        
        // Event listeners para exportação de gráficos (PNG)
        document.querySelectorAll('.chart-export-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const chartType = e.target.dataset.chart;
                const today = new Date().toISOString().split('T')[0];
                
                switch (chartType) {
                    case 'financial':
                        exportChartAsImage('financial-chart', `grafico-financeiro-${today}.png`);
                        break;
                    case 'status':
                        exportChartAsImage('status-chart', `grafico-status-${today}.png`);
                        break;
                    case 'cashflow':
                        exportChartAsImage('cashflow-chart', `grafico-fluxo-caixa-${today}.png`);
                        break;
                    case 'debtors':
                        exportChartAsImage('debtors-chart', `grafico-top-devedores-${today}.png`);
                        break;
                }
            });
        });
        
        // Event listeners para exportação de tabelas (XLSX)
        document.querySelectorAll('.table-export-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tableType = e.target.dataset.table;
                const today = new Date().toISOString().split('T')[0];
                
                switch (tableType) {
                    case 'upcoming':
                        exportTableAsXLSX('upcoming-table', `emprestimos-vencimento-proximo-${today}.xlsx`, 'Vencimento Próximo');
                        break;
                    case 'overdue':
                        exportTableAsXLSX('overdue-table', `emprestimos-atrasados-${today}.xlsx`, 'Empréstimos Atrasados');
                        break;
                    case 'payments':
                        exportTableAsXLSX('payments-table', `historico-pagamentos-${today}.xlsx`, 'Histórico de Pagamentos');
                        break;
                    case 'interest':
                        exportTableAsXLSX('interest-table', `resumo-juros-${today}.xlsx`, 'Resumo de Juros');
                        break;
                }
            });
        });
        
        // Event listener para exportação geral (XLSX)
        const exportAllBtn = document.getElementById('export-all-reports');
        if (exportAllBtn) {
            exportAllBtn.addEventListener('click', () => {
                exportAllReportsAsXLSX();
            });
        }
        
        // Carregar dados iniciais quando a aba de relatórios for ativada
        const relatoriosNavButton = document.querySelector('[data-tab="relatorios"]');
        if (relatoriosNavButton) {
            relatoriosNavButton.addEventListener('click', () => {
                // Pequeno atraso para garantir que a aba esteja visível
                setTimeout(loadReportsData, 100);
            });
        }
    }
    
    // --- INICIALIZAÇÃO ---
    document.querySelectorAll('.filter-year').forEach(select => {
        const currentYear = new Date().getFullYear();
        for (let year = currentYear + 2; year >= 2020; year--) { 
            const option = new Option(year, year); 
            if (year === currentYear) {
                option.selected = true; 
            }
            select.appendChild(option.cloneNode(true));
        }
    });
    
    // Verificação inicial do modal de troca de senha
    if (mustChangePassword && passwordModal) { 
        passwordModal.style.display = 'flex'; 
    } else { 
        refreshAllData(); 
    }
});

function controlarVisibilidadeTop5() {
    const top5Element = document.getElementById('top-5-emprestimos');
    if (!top5Element) return;
    
    const activeTab = document.querySelector('.tab-content.active');
    const isDashboard = activeTab && activeTab.id === 'dashboard-content';
    
    if (isDashboard) {
        top5Element.style.display = 'block';
        top5Element.closest('.content-box').style.display = 'block';
    } else {
        top5Element.style.display = 'none';
        top5Element.closest('.content-box').style.display = 'none';
    }
}

// Chame a função quando as abas mudarem
document.querySelectorAll('.nav-button').forEach(button => {
    button.addEventListener('click', () => {
        setTimeout(controlarVisibilidadeTop5, 100); // Pequeno delay para garantir que a aba foi ativada
    });
});

// Chame também ao carregar a página
document.addEventListener('DOMContentLoaded', controlarVisibilidadeTop5);