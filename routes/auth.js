const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const authMiddleware = require('../middleware/auth');

const JWT_SECRET = '24dfef47c933ad661b55df51e469af62'; 

// Rota de login (já existente)
router.post('/login', (req, res) => {
    const { username, password } = req.body;
    const db = req.db;
    
    db.query('SELECT * FROM users WHERE username = $1', [username], (err, result) => {
        if (err || result.rows.length === 0) {
            return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
        }

        const user = result.rows[0];
        
        bcrypt.compare(password, user.password, (err, isMatch) => {
            if (err || !isMatch) {
                return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
            }

            const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '8h' });

            res.json({
                token,
                mustChangePassword: user.must_change_password
            });
        });
    });
});

// Rota de troca de senha (corrigida)
router.post('/change-password', authMiddleware, (req, res) => {
    const { newPassword } = req.body;
    const userId = req.user.id;
    const db = req.db;
    
    console.log('Requisição de troca de senha para usuário ID:', userId);
    console.log('Nova senha recebida:', newPassword ? 'SIM' : 'NÃO');
    
    if (!newPassword) {
        return res.status(400).json({ error: 'A nova senha é obrigatória.' });
    }
    
    if (newPassword.length < 6) {
        return res.status(400).json({ error: 'A nova senha deve ter pelo menos 6 caracteres.' });
    }

    bcrypt.hash(newPassword, 10, (err, hashedPassword) => {
        if (err) {
            console.error('Erro ao hashear senha:', err);
            return res.status(500).json({ error: 'Erro ao processar a senha.' });
        }

        db.query('UPDATE users SET password = $1, must_change_password = false WHERE id = $2', [hashedPassword, userId], (err, result) => {
            if (err) {
                console.error('Erro ao atualizar senha:', err);
                return res.status(500).json({ error: 'Não foi possível atualizar a senha.' });
            }
            
            if (result.rowCount === 0) {
                return res.status(404).json({ error: 'Usuário não encontrado.' });
            }
            
            console.log('Senha atualizada com sucesso para usuário ID:', userId);
            res.json({ message: 'Senha atualizada com sucesso!' });
        });
    });
});

module.exports = router;