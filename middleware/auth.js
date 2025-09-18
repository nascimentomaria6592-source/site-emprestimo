const jwt = require('jsonwebtoken');
const JWT_SECRET = '24dfef47c933ad661b55df51e469af62'; 
module.exports = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Acesso negado. Nenhum token fornecido.' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (ex) {
        console.error('Erro ao verificar token:', ex);
        res.status(400).json({ error: 'Token inválido.' });
    }
};