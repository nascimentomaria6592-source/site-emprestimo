const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configuração do armazenamento
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Garantir que o diretório de uploads exista
    const uploadDir = 'public/uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Gerar nome de arquivo único com timestamp e extensão original
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

// Filtro de tipos de arquivo permitidos
const fileFilter = (req, file, cb) => {
  // Tipos de arquivo permitidos
  const allowedMimeTypes = [
    'image/jpeg',
    'image/png',
    'application/pdf'
  ];
  
  // Extensões permitidas
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.pdf'];
  
  const extname = path.extname(file.originalname).toLowerCase();
  const mimetype = file.mimetype;
  
  if (allowedMimeTypes.includes(mimetype) && allowedExtensions.includes(extname)) {
    return cb(null, true);
  } else {
    cb(new Error('Tipo de arquivo não permitido. Apenas JPG, PNG e PDF são aceitos.'));
  }
};

// Configuração do middleware
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 1 // Apenas um arquivo por requisição
  }
});

module.exports = upload;