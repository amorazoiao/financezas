// =============================================================================
// financezas.test.js — Testes unitários das funções de negócio críticas
// Execute com: npx vitest run
// =============================================================================

import { describe, it, expect, beforeEach } from 'vitest';

// ──────────────────────────────────────────────────────────────────────────────
// Importação inline das funções puras (sem DOM)
// As funções são extraídas manualmente para evitar dependência de globals
// ──────────────────────────────────────────────────────────────────────────────

// --- utils.js ---
function hojeLocal() {
  const h = new Date();
  return `${h.getFullYear()}-${String(h.getMonth()+1).padStart(2,'0')}-${String(h.getDate()).padStart(2,'0')}`;
}

function formatarDataLocal(d) {
  if (!(d instanceof Date) || isNaN(d)) return '';
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function parseLocalDate(s) {
  if (!s) return new Date();
  const [ano, mes, dia] = s.split('-').map(Number);
  return new Date(ano, mes - 1, dia);
}

function getUltimoDiaMes(ano, mes) {
  return new Date(ano, mes + 1, 0).getDate();
}

function ajustarDiaParaUltimoDiaDoMes(ano, mes, diaDesejado) {
  return Math.min(diaDesejado, getUltimoDiaMes(ano, mes));
}

function formatBRL(v) {
  const digits = v.toString().replace(/\D/g, '');
  if (!digits) return '0,00';
  const num = parseInt(digits, 10);
  const reais = Math.floor(num / 100);
  const cents = num % 100;
  const reaisStr = reais.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return `${reaisStr},${String(cents).padStart(2, '0')}`;
}

function currencyToNumber(v) {
  if (!v) return 0;
  let cleaned = v.toString().trim();
  if (cleaned.includes(',')) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  }
  const number = parseFloat(cleaned);
  return isNaN(number) ? 0 : number;
}

function formatMoney(v) {
  const abs = Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `R$ ${abs}`;
}

function gerarId(prefixo = '') {
  const uuid = 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  return prefixo ? `${prefixo}_${uuid}` : uuid;
}

// --- storage.js (funções puras que não dependem de DOM) ---
function calcularSaldoReal(lancamentos) {
  const receitas  = lancamentos.filter(l => l.valor > 0 && l.tipo !== 'pagamento_fatura').reduce((s, l) => s + l.valor, 0);
  const despesas  = lancamentos.filter(l => l.valor < 0 && l.tipo === 'despesa_avista').reduce((s, l) => s + Math.abs(l.valor), 0);
  const pagamentos = lancamentos.filter(l => l.tipo === 'pagamento_fatura').reduce((s, l) => s + Math.abs(l.valor), 0);
  return receitas - despesas - pagamentos;
}

function getTotalUtilizadoCartao(compras, cartaoId) {
  return compras
    .filter(c => c.cartaoId === cartaoId)
    .reduce((total, c) => total + (c.parcelas - c.parcelasPagas) * c.valorParcela, 0);
}

function getDataVencimentoParcela(compra, cartao, indiceParcela) {
  const dataCompra = parseLocalDate(compra.dataCompra);
  const diaCompra = dataCompra.getDate();
  const offsetMes = diaCompra > cartao.fechamento ? 1 : 0;
  const mesVenc = dataCompra.getMonth() + offsetMes + indiceParcela;
  const ano = dataCompra.getFullYear();
  return new Date(ano, mesVenc, cartao.vencimento);
}

function getFaturaPorMes(cartao, compras, lancamentos, mes, ano) {
  let valorTotal = 0;
  const parcelasDaFatura = [];

  for (const compra of compras) {
    if (compra.cartaoId !== cartao.id) continue;
    const dataCompra = parseLocalDate(compra.dataCompra);
    const diaCompra = dataCompra.getDate();
    const offsetMes = diaCompra > cartao.fechamento ? 1 : 0;

    for (let i = 0; i < compra.parcelas; i++) {
      const mesVenc = dataCompra.getMonth() + offsetMes + i;
      const dataVencimento = new Date(dataCompra.getFullYear(), mesVenc, cartao.vencimento);
      const noMes = dataVencimento.getMonth() === mes && dataVencimento.getFullYear() === ano;
      const naoPaga = i >= compra.parcelasPagas;

      if (noMes && naoPaga) {
        valorTotal += compra.valorParcela;
        parcelasDaFatura.push({
          id: compra.id, descricao: compra.descricao, valor: compra.valorParcela,
          parcelaNumero: i + 1, totalParcelas: compra.parcelas,
        });
      }
    }
  }

  const pagamentos = lancamentos
    .filter(l =>
      l.tipo === 'pagamento_fatura' &&
      l.cartaoId === cartao.id &&
      l.competenciaPaga?.mes === mes &&
      l.competenciaPaga?.ano === ano
    )
    .reduce((s, l) => s + Math.abs(l.valor), 0);

  return {
    competencia: { mes, ano },
    parcelas: parcelasDaFatura,
    valorTotal,
    valorPago: pagamentos,
    valorRestante: valorTotal - pagamentos,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// TESTES
// ──────────────────────────────────────────────────────────────────────────────

// ─── parseLocalDate ───────────────────────────────────────────────────────────
describe('parseLocalDate', () => {
  it('interpreta YYYY-MM-DD sem deslocamento UTC', () => {
    const d = parseLocalDate('2026-05-01');
    expect(d.getDate()).toBe(1);
    expect(d.getMonth()).toBe(4); // maio = 4
    expect(d.getFullYear()).toBe(2026);
  });

  it('dia 31 de janeiro fica correto', () => {
    const d = parseLocalDate('2026-01-31');
    expect(d.getDate()).toBe(31);
    expect(d.getMonth()).toBe(0);
  });
});

// ─── formatarDataLocal ────────────────────────────────────────────────────────
describe('formatarDataLocal', () => {
  it('formata Date para YYYY-MM-DD sem deslocamento', () => {
    const d = new Date(2026, 4, 1); // 1 de maio local
    expect(formatarDataLocal(d)).toBe('2026-05-01');
  });

  it('retorna string vazia para data inválida', () => {
    expect(formatarDataLocal(new Date('invalid'))).toBe('');
  });
});

// ─── ajustarDiaParaUltimoDiaDoMes ─────────────────────────────────────────────
describe('ajustarDiaParaUltimoDiaDoMes', () => {
  it('dia 31 em fevereiro vira 28 (ano não bissexto)', () => {
    expect(ajustarDiaParaUltimoDiaDoMes(2026, 1, 31)).toBe(28);
  });

  it('dia 31 em fevereiro bissexto vira 29', () => {
    expect(ajustarDiaParaUltimoDiaDoMes(2028, 1, 31)).toBe(29);
  });

  it('dia 31 em março permanece 31', () => {
    expect(ajustarDiaParaUltimoDiaDoMes(2026, 2, 31)).toBe(31);
  });

  it('dia 30 em abril vira 30', () => {
    expect(ajustarDiaParaUltimoDiaDoMes(2026, 3, 31)).toBe(30);
  });
});

// ─── formatBRL / currencyToNumber ─────────────────────────────────────────────
describe('formatBRL', () => {
  it('formata 0 como 0,00', () => {
    expect(formatBRL('0')).toBe('0,00');
  });

  it('formata centavos corretamente', () => {
    expect(formatBRL('5')).toBe('0,05');
    expect(formatBRL('50')).toBe('0,50');
    expect(formatBRL('150')).toBe('1,50');
  });

  it('formata milhares com ponto separador', () => {
    expect(formatBRL('123456')).toBe('1.234,56');
  });
});

describe('currencyToNumber', () => {
  it('converte formato BRL para number', () => {
    expect(currencyToNumber('1.234,56')).toBe(1234.56);
    expect(currencyToNumber('0,50')).toBe(0.50);
    expect(currencyToNumber('1.000,00')).toBe(1000);
  });

  it('retorna 0 para string vazia', () => {
    expect(currencyToNumber('')).toBe(0);
  });
});

// ─── calcularSaldoReal ────────────────────────────────────────────────────────
describe('calcularSaldoReal', () => {
  it('saldo zerado sem lançamentos', () => {
    expect(calcularSaldoReal([])).toBe(0);
  });

  it('soma receitas e subtrai despesas', () => {
    const lancamentos = [
      { valor: 3000, tipo: 'receita' },
      { valor: -500, tipo: 'despesa_avista' },
      { valor: -200, tipo: 'despesa_avista' },
    ];
    expect(calcularSaldoReal(lancamentos)).toBe(2300);
  });

  it('desconta pagamento de fatura do saldo', () => {
    const lancamentos = [
      { valor: 5000, tipo: 'receita' },
      { valor: -800, tipo: 'pagamento_fatura' },
    ];
    expect(calcularSaldoReal(lancamentos)).toBe(4200);
  });

  it('não inclui pagamento_fatura nas receitas', () => {
    // pagamento_fatura com valor positivo NÃO deve ser somado como receita
    const lancamentos = [
      { valor: -800, tipo: 'pagamento_fatura' },
    ];
    expect(calcularSaldoReal(lancamentos)).toBe(-800);
  });

  it('saldo pode ficar negativo', () => {
    const lancamentos = [
      { valor: 100, tipo: 'receita' },
      { valor: -500, tipo: 'despesa_avista' },
    ];
    expect(calcularSaldoReal(lancamentos)).toBe(-400);
  });
});

// ─── getTotalUtilizadoCartao ──────────────────────────────────────────────────
describe('getTotalUtilizadoCartao', () => {
  it('retorna 0 sem compras', () => {
    expect(getTotalUtilizadoCartao([], 'cartao_1')).toBe(0);
  });

  it('calcula parcelas restantes corretamente', () => {
    const compras = [{
      cartaoId: 'cartao_1',
      parcelas: 12,
      parcelasPagas: 3,
      valorParcela: 100,
    }];
    // 9 parcelas restantes × R$ 100 = R$ 900
    expect(getTotalUtilizadoCartao(compras, 'cartao_1')).toBe(900);
  });

  it('ignora compras de outro cartão', () => {
    const compras = [
      { cartaoId: 'cartao_1', parcelas: 6, parcelasPagas: 0, valorParcela: 200 },
      { cartaoId: 'cartao_2', parcelas: 6, parcelasPagas: 0, valorParcela: 500 },
    ];
    expect(getTotalUtilizadoCartao(compras, 'cartao_1')).toBe(1200);
    expect(getTotalUtilizadoCartao(compras, 'cartao_2')).toBe(3000);
  });

  it('compra totalmente paga não ocupa limite', () => {
    const compras = [{ cartaoId: 'c1', parcelas: 3, parcelasPagas: 3, valorParcela: 100 }];
    expect(getTotalUtilizadoCartao(compras, 'c1')).toBe(0);
  });
});

// ─── getDataVencimentoParcela ──────────────────────────────────────────────────
describe('getDataVencimentoParcela', () => {
  // Cartão: fecha dia 15, vence dia 10
  const cartao = { fechamento: 15, vencimento: 10 };

  it('compra no dia do fechamento (=15) vai para o mesmo ciclo', () => {
    // diaCompra (15) NÃO é > fechamento (15), então offsetMes = 0
    // parcela 0 vence em maio/10 (mesmo mês da compra)
    const compra = { dataCompra: '2026-05-15', parcelas: 1, parcelasPagas: 0 };
    const venc = getDataVencimentoParcela(compra, cartao, 0);
    expect(venc.getMonth()).toBe(4); // maio
    expect(venc.getDate()).toBe(10);
  });

  it('compra após o fechamento (>15) salta para o próximo ciclo', () => {
    // diaCompra (20) > fechamento (15), então offsetMes = 1
    // parcela 0 vence em junho/10
    const compra = { dataCompra: '2026-05-20', parcelas: 1, parcelasPagas: 0 };
    const venc = getDataVencimentoParcela(compra, cartao, 0);
    expect(venc.getMonth()).toBe(5); // junho
    expect(venc.getDate()).toBe(10);
  });

  it('segunda parcela é um mês depois da primeira', () => {
    const compra = { dataCompra: '2026-05-10', parcelas: 3, parcelasPagas: 0 };
    const venc0 = getDataVencimentoParcela(compra, cartao, 0);
    const venc1 = getDataVencimentoParcela(compra, cartao, 1);
    expect(venc1.getMonth()).toBe(venc0.getMonth() + 1);
  });
});

// ─── getFaturaPorMes ──────────────────────────────────────────────────────────
describe('getFaturaPorMes', () => {
  const cartao = { id: 'c1', fechamento: 15, vencimento: 10 };

  it('fatura vazia sem compras', () => {
    const fatura = getFaturaPorMes(cartao, [], [], 4, 2026);
    expect(fatura.valorTotal).toBe(0);
    expect(fatura.parcelas).toHaveLength(0);
  });

  it('inclui parcela do mês correto', () => {
    // Compra dia 10/maio. Dia 10 NÃO > fechamento (15), então offset = 0.
    // Parcela 0 vence em maio/10 (mês 4). Parcela 1 em junho (5), etc.
    const compras = [{
      id: 'comp1', cartaoId: 'c1',
      dataCompra: '2026-05-10', descricao: 'Notebook',
      parcelas: 6, parcelasPagas: 0, valorParcela: 500,
    }];
    const fatura = getFaturaPorMes(cartao, compras, [], 4, 2026); // maio
    expect(fatura.valorTotal).toBe(500);
    expect(fatura.parcelas).toHaveLength(1);
    expect(fatura.parcelas[0].parcelaNumero).toBe(1);
  });

  it('não inclui parcela de outro mês', () => {
    const compras = [{
      id: 'comp1', cartaoId: 'c1',
      dataCompra: '2026-05-10', descricao: 'Geladeira',
      parcelas: 3, parcelasPagas: 0, valorParcela: 400,
    }];
    // Pede fatura de setembro — a terceira parcela vence em agosto, não setembro
    const fatura = getFaturaPorMes(cartao, compras, [], 8, 2026);
    expect(fatura.valorTotal).toBe(0);
  });

  it('desconta pagamento já realizado', () => {
    // Compra dia 10/maio, offset=0 → parcela vence em maio (mês 4)
    const compras = [{
      id: 'comp1', cartaoId: 'c1',
      dataCompra: '2026-05-10', descricao: 'TV',
      parcelas: 1, parcelasPagas: 0, valorParcela: 1200,
    }];
    const pagLanc = [{
      tipo: 'pagamento_fatura', cartaoId: 'c1',
      valor: -800, competenciaPaga: { mes: 4, ano: 2026 },
    }];
    const fatura = getFaturaPorMes(cartao, compras, pagLanc, 4, 2026); // maio
    expect(fatura.valorPago).toBe(800);
    expect(fatura.valorRestante).toBe(400);
  });

  it('parcela paga não aparece na fatura', () => {
    const compras = [{
      id: 'comp1', cartaoId: 'c1',
      dataCompra: '2026-05-10', descricao: 'Fogão',
      parcelas: 3, parcelasPagas: 1, // primeira já paga
      valorParcela: 300,
    }];
    // Segunda parcela vence em julho (mês 6 → parcela índice 1)
    const fatura = getFaturaPorMes(cartao, compras, [], 6, 2026);
    expect(fatura.valorTotal).toBe(300);
  });
});

// ─── hojeLocal ────────────────────────────────────────────────────────────────
describe('hojeLocal', () => {
  it('retorna data no formato YYYY-MM-DD', () => {
    const hoje = hojeLocal();
    expect(hoje).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('é parseável por parseLocalDate sem deslocamento', () => {
    const hoje = hojeLocal();
    const d = parseLocalDate(hoje);
    const agora = new Date();
    expect(d.getDate()).toBe(agora.getDate());
    expect(d.getMonth()).toBe(agora.getMonth());
    expect(d.getFullYear()).toBe(agora.getFullYear());
  });
});
