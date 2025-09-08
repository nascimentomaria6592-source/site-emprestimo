document.addEventListener('DOMContentLoaded', () => {
    // Se já houver um token, tenta ir para o dashboard
    if (localStorage.getItem('authToken')) {
        window.location.href = '/index.html';
    }

    const loginForm = document.getElementById('login-form');
    const errorMessage = document.getElementById('error-message');

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorMessage.textContent = '';

        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Falha no login');
            }

            const data = await response.json();
            
            // Armazena o token e o status de troca de senha no localStorage
            localStorage.setItem('authToken', data.token);
            localStorage.setItem('mustChangePassword', data.mustChangePassword);

            // Redireciona para a página principal
            window.location.href = '/index.html';

        } catch (error) {
            errorMessage.textContent = error.message;
        }
    });
});