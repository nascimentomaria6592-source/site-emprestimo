const jwt = require('jsonwebtoken');
const JWT_SECRET = 'seu_segredo_super_secreto_aqui'; // Use a mesma chave secreta

module.exports = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Acesso negado. Nenhum token fornecido.' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // Adiciona os dados do usuário (id, username) ao objeto req
        next();
    } catch (ex) {
        res.status(400).json({ error: 'Token inválido.' });
    }
};