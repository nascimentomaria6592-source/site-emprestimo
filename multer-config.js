const multer = require('multer');
const path = require('path');

// Alterado de diskStorage para memoryStorage.
// Isso fará com que o arquivo seja armazenado em req.file.buffer na memória.
const storage = multer.memoryStorage();

// O filtro de tipo de arquivo continua o mesmo, o que é ótimo.
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'image/jpeg',
    'image/png',
    'application/pdf'
  ];
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.pdf'];
  const extname = path.extname(file.originalname).toLowerCase();
  
  if (allowedMimeTypes.includes(file.mimetype) && allowedExtensions.includes(extname)) {
    return cb(null, true);
  } else {
    cb(new Error('Tipo de arquivo não permitido. Apenas JPG, PNG e PDF são aceitos.'));
  }
};

// A configuração do middleware agora usa o novo storage em memória.
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 1
  }
});

module.exports = upload;
