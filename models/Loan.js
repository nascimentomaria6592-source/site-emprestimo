// Este arquivo é mais para organização lógica.
// As operações com o banco de dados estão sendo tratadas diretamente nas rotas por simplicidade.
// Em um sistema maior, você poderia ter métodos aqui para interagir com o DB.

class Loan {
  constructor(db) {
    this.db = db;
  }

  // Exemplo de como um método poderia ser definido aqui (não usado diretamente neste projeto)
  static calculateInterest(amount) {
    return amount * 1.2;
  }
}

module.exports = Loan;