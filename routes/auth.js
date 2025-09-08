const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const authMiddleware = require('../middleware/auth'); // Vamos criar este arquivo a seguir

const JWT_SECRET = 'seu_segredo_super_secreto_aqui'; // Troque por uma string segura

// POST /api/auth/login
router.post('/login', (req, res) => {
    const { username, password } = req.body;
    const db = req.db;

    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
        if (err || !user) {
            return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
        }

        bcrypt.compare(password, user.password, (err, isMatch) => {
            if (err || !isMatch) {
                return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
            }

            const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '8h' });

            res.json({
                token,
                mustChangePassword: user.must_change_password === 1
            });
        });
    });
});

// POST /api/auth/change-password (Rota protegida)
router.post('/change-password', authMiddleware, (req, res) => {
    const { newPassword } = req.body;
    const userId = req.user.id; // ID do usuário vem do token verificado pelo middleware
    const db = req.db;
    
    if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: 'A nova senha deve ter pelo menos 6 caracteres.' });
    }

    bcrypt.hash(newPassword, 10, (err, hashedPassword) => {
        if (err) {
            return res.status(500).json({ error: 'Erro ao processar a senha.' });
        }

        db.run('UPDATE users SET password = ?, must_change_password = 0 WHERE id = ?', [hashedPassword, userId], function(err) {
            if (err) {
                return res.status(500).json({ error: 'Não foi possível atualizar a senha.' });
            }
            res.json({ message: 'Senha atualizada com sucesso!' });
        });
    });
});

module.exports = router;