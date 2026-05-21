// =============================================================================
// storage.js — Estado global da aplicação e persistência no localStorage
// =============================================================================
// Depende de: utils.js
// =============================================================================

// ---------- Versão ----------
const APP_VERSION = "8.5";
const STORAGE_KEY = 'fin_data_v8';

// ---------- Estado global ----------

/** @type {Array} Lançamentos avulsos (receitas e despesas à vista) */
let lancamentos = [];

/** @type {Array} Compras parceladas no cartão */
let compras = [];

/** @type {Array} Regras de recorrência (mensais, semanais, quinzenais) */
let recorrencias = [];

/** @type {Array} Cartões de crédito cadastrados */
let cartoes = [];

/** @type {Array} Metas de reserva de emergência */
let reservaMetas = [];

/** @type {Array} Categorias criadas pelo usuário */
let categoriasPersonalizadas = [];

/** @type {Array} Orçamentos por categoria */
let orcamentos = [];

// ---------- Estado de UI (não persistido) ----------
let chart = null;
let evolutionChart = null;
let chartType = 'despesa';
let currentFilterMes = null;
let currentFilterAno = null;
let pendingPagamentoInfo = null;
let currentFaturaMes = null;
let currentFaturaAno = null;
let currentCartaoId = null;
let categoriaSearchTerm = '';

// ---------- Cache para otimização de performance ----------
let _cacheTodosLancamentos = null;
let _cacheTimestamp = null;

// ---------- Categorias padrão ----------
let categoriasReceitaPadrao = ['Salário', 'Investimentos', 'Freelance', 'Presentes', 'Outros'];
let categoriasDespesaPadrao = ['Alimentação', 'Transporte', 'Lazer', 'Moradia', 'Saúde', 'Educação', 'Contas'];

/** Nomes dos meses em português. */
const mesesNomes = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

// ---------- Persistência ----------

/**
 * Serializa todo o estado da aplicação e salva no localStorage.
 */
function salvarTudo() {
  const dados = {
    version: APP_VERSION,
    lancamentos,
    compras,
    recorrencias,
    cartoes,
    reservaMetas,
    categoriasPersonalizadas,
    orcamentos,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(dados));
  console.log('[FinanÇezas] Dados salvos com sucesso');
}

/**
 * Carrega os dados do localStorage para o estado global.
 * Garante compatibilidade com dados da versão 8.x.
 * Caso não existam dados, inicializa arrays vazios.
 */
function carregarDados() {
  const stored = localStorage.getItem(STORAGE_KEY);

  if (stored) {
    try {
      const d = JSON.parse(stored);

      if (d.version && d.version.startsWith('8')) {
        lancamentos = d.lancamentos || [];
        compras = d.compras || [];
        recorrencias = d.recorrencias || [];
        cartoes = d.cartoes || [];
        reservaMetas = d.reservaMetas || [];
        categoriasPersonalizadas = d.categoriasPersonalizadas || [];
        orcamentos = d.orcamentos || [];
        
        console.log('[FinanÇezas] Dados carregados do localStorage');
        return;
      }
    } catch (e) {
      console.error('[FinanÇezas] Erro ao carregar dados:', e);
    }
  }

  // Estado inicial vazio
  lancamentos = [];
  compras = [];
  recorrencias = [];
  cartoes = [];
  reservaMetas = [];
  categoriasPersonalizadas = [];
  orcamentos = [];

  salvarTudo();
  console.log('[FinanÇezas] Estado inicial criado');
}

// ---------- Helpers de consulta ----------

/**
 * Retorna a lista combinada de categorias de receita (padrão + personalizadas).
 * @returns {string[]}
 */
function getCategoriasReceita() {
  return [
    ...categoriasReceitaPadrao,
    ...categoriasPersonalizadas.filter(c => c.tipo === 'receita').map(c => c.nome),
  ];
}

/**
 * Retorna a lista combinada de categorias de despesa (padrão + personalizadas).
 * @returns {string[]}
 */
function getCategoriasDespesa() {
  return [
    ...categoriasDespesaPadrao,
    ...categoriasPersonalizadas.filter(c => c.tipo === 'despesa').map(c => c.nome),
  ];
}

/**
 * Calcula o saldo real disponível na conta corrente.
 * Considera receitas, despesas à vista e pagamentos de fatura;
 * NÃO inclui compras parceladas (gerenciadas pelo limite do cartão).
 * @returns {number}
 */
function calcularSaldoReal() {
  const receitas = lancamentos.filter(l => l.valor > 0 && l.tipo !== 'pagamento_fatura').reduce((s, l) => s + l.valor, 0);
  const despesas = lancamentos.filter(l => l.valor < 0 && l.tipo === 'despesa_avista').reduce((s, l) => s + Math.abs(l.valor), 0);
  const pagamentos = lancamentos.filter(l => l.tipo === 'pagamento_fatura').reduce((s, l) => s + Math.abs(l.valor), 0);
  return receitas - despesas - pagamentos;
}

/**
 * Calcula o total do limite de crédito utilizado em um cartão
 * somando as parcelas ainda não pagas.
 * @param {string} cartaoId
 * @returns {number}
 */
function getTotalUtilizadoCartao(cartaoId) {
  return compras
    .filter(c => c.cartaoId === cartaoId)
    .reduce((total, c) => total + (c.parcelas - c.parcelasPagas) * c.valorParcela, 0);
}

/**
 * Retorna o mês de vencimento (como Date) de uma parcela específica de uma compra,
 * respeitando a regra de fechamento do cartão:
 * se a compra foi feita após o fechamento, a primeira parcela vai para o mês seguinte.
 *
 * @param {Object} compra
 * @param {Object} cartao
 * @param {number} indiceParcela — 0 para a primeira parcela
 * @returns {Date}
 */
function getDataVencimentoParcela(compra, cartao, indiceParcela) {
  const dataCompra = parseLocalDate(compra.dataCompra);
  const diaCompra = dataCompra.getDate();
  const offsetMes = diaCompra > cartao.fechamento ? 1 : 0;
  const mesVenc = dataCompra.getMonth() + offsetMes + indiceParcela;
  const ano = dataCompra.getFullYear();
  return new Date(ano, mesVenc, cartao.vencimento);
}

/**
 * Monta a fatura de um cartão para um determinado mês/ano.
 * Inclui parcelas vencidas naquele período e pagamentos já realizados.
 * @param {Object} cartao
 * @param {number} mes (0 = Janeiro)
 * @param {number} ano
 * @returns {Object} { competencia, parcelas, valorTotal, valorPago, valorRestante, status }
 */
function getFaturaPorMes(cartao, mes, ano) {
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
          id: compra.id,
          descricao: compra.descricao,
          categoria: compra.categoria,
          valor: compra.valorParcela,
          data: formatarDataLocal(dataVencimento),
          parcelaNumero: i + 1,
          totalParcelas: compra.parcelas,
          paga: i < compra.parcelasPagas,
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

  const hoje = new Date();
  const faturaFechada =
    ano < hoje.getFullYear() ||
    (ano === hoje.getFullYear() && mes < hoje.getMonth()) ||
    (ano === hoje.getFullYear() && mes === hoje.getMonth() && hoje.getDate() > cartao.fechamento);

  const faturaVencida =
    ano < hoje.getFullYear() ||
    (ano === hoje.getFullYear() && mes < hoje.getMonth()) ||
    (ano === hoje.getFullYear() && mes === hoje.getMonth() && hoje.getDate() > cartao.vencimento);

  let status = 'aberta';
  if (pagamentos >= valorTotal && valorTotal > 0) status = 'paga';
  else if (faturaVencida) status = 'vencida';
  else if (faturaFechada) status = 'fechada';

  return {
    competencia: { mes, ano },
    parcelas: parcelasDaFatura,
    valorTotal,
    valorPago: pagamentos,
    valorRestante: valorTotal - pagamentos,
    status,
  };
}

/**
 * Retorna todos os lançamentos mesclados com compras parceladas,
 * para exibição na UI (extrato, histórico).
 * Com cache para otimização de performance (5 segundos).
 * 
 * @param {boolean} forceRefresh - Se true, ignora o cache e recria a lista
 * @returns {Array}
 */
function obterTodosLancamentosParaUI(forceRefresh = false) {
  const now = Date.now();
  
  // Verifica se pode usar o cache
  if (!forceRefresh && _cacheTodosLancamentos && (now - _cacheTimestamp < 5000)) {
    return _cacheTodosLancamentos;
  }
  
  // Constrói a lista completa
  const todos = [...lancamentos];
  
  for (const compra of compras) {
    const cartao = cartoes.find(c => c.id === compra.cartaoId);
    
    if (!cartao) {
      // Fallback: exibe como compra única na data da compra
      todos.push({
        id: compra.id,
        data: compra.dataCompra,
        descricao: compra.descricao,
        categoria: compra.categoria,
        valor: -compra.valorTotal,
        tipo: 'compra_parcelada',
        parcelas: compra.parcelas,
        parcelasPagas: compra.parcelasPagas,
        valorParcela: compra.valorParcela,
        cartaoId: compra.cartaoId,
        compraId: compra.id,
      });
      continue;
    }
    
    const dataCompra = parseLocalDate(compra.dataCompra);
    const diaCompra = dataCompra.getDate();
    const offsetPrimeiraParcela = diaCompra >= cartao.fechamento ? 1 : 0;
    
    // Para cada parcela NÃO PAGA, cria uma entrada na data de vencimento
    for (let i = compra.parcelasPagas; i < compra.parcelas; i++) {
      const mesVencimento = dataCompra.getMonth() + offsetPrimeiraParcela + (i - compra.parcelasPagas);
      const dataVencimento = new Date(dataCompra.getFullYear(), mesVencimento, cartao.vencimento);
      
      if (!isNaN(dataVencimento.getTime())) {
        todos.push({
          id: `${compra.id}_parcela_${i + 1}`,
          data: formatarDataLocal(dataVencimento),
          descricao: compra.descricao,
          categoria: compra.categoria,
          valor: -compra.valorParcela,
          tipo: 'compra_parcelada',
          parcelas: compra.parcelas,
          parcelasPagas: compra.parcelasPagas,
          valorParcela: compra.valorParcela,
          cartaoId: compra.cartaoId,
          compraId: compra.id,
          parcelaNumero: i + 1,
        });
      }
    }
  }
  
  // Atualiza o cache
  _cacheTodosLancamentos = todos;
  _cacheTimestamp = now;
  
  return todos;
}

/**
 * Invalida o cache de lançamentos.
 * Deve ser chamado após qualquer alteração nos dados.
 */
function invalidarCacheLancamentos() {
  _cacheTodosLancamentos = null;
  _cacheTimestamp = null;
  console.log('[FinanÇezas] Cache de lançamentos invalidado');
}