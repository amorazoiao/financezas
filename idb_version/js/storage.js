// =============================================================================
// storage.js — Estado global + persistência via IndexedDB (com fallback localStorage)
// =============================================================================
// API PÚBLICA (idêntica à versão anterior):
//   salvarTudo()          → Promise<void>   (era síncrona)
//   carregarDados()       → Promise<void>   (era síncrona)
//   invalidarCacheLancamentos()
//   obterTodosLancamentosParaUI(forceRefresh?)
//   calcularSaldoReal()
//   getTotalUtilizadoCartao(cartaoId)
//   getDataVencimentoParcela(compra, cartao, indiceParcela)
//   getFaturaPorMes(cartao, mes, ano)
//   getCategoriasReceita() / getCategoriasDespesa()
// =============================================================================

// ---------- Versão ----------
const APP_VERSION  = '8.5';
const STORAGE_KEY  = 'fin_data_v8';   // mantido para fallback / migração
const IDB_NAME     = 'financezas_db';
const IDB_VERSION  = 1;
const IDB_STORE    = 'app_state';
const IDB_KEY      = 'main';          // único registro no object store

// ---------- Estado global ----------

/** @type {Array} Lançamentos avulsos (receitas e despesas à vista) */
let lancamentos = [];

/** @type {Array} Compras parceladas no cartão */
let compras = [];

/** @type {Array} Regras de recorrência */
let recorrencias = [];

/** @type {Array} Cartões de crédito */
let cartoes = [];

/** @type {Array} Metas de reserva */
let reservaMetas = [];

/** @type {Array} Categorias personalizadas */
let categoriasPersonalizadas = [];

/** @type {Array} Orçamentos */
let orcamentos = [];

// ---------- Estado de UI (não persistido) ----------
let chart              = null;
let evolutionChart     = null;
let chartType          = 'despesa';
let currentFilterMes   = null;
let currentFilterAno   = null;
let pendingPagamentoInfo = null;
let currentFaturaMes   = null;
let currentFaturaAno   = null;
let currentCartaoId    = null;
let categoriaSearchTerm = '';

// ---------- Cache ----------
let _cacheTodosLancamentos = null;
let _cacheTimestamp        = null;

// ---------- Categorias padrão ----------
let categoriasReceitaPadrao = [
  'Salário', 'Freelance', 'Investimentos', 'Reembolso',
  'Venda', 'Presentes', 'Outras Receitas',
];
let categoriasDespesaPadrao = [
  'Alimentação', 'Moradia', 'Transporte', 'Contas',
  'Saúde', 'Educação', 'Lazer', 'Compras',
  'Assinaturas', 'Pets', 'Beleza', 'Presentes',
  'Imprevistos', 'Outros',
];

const mesesNomes = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
];

// =============================================================================
// ── IndexedDB ────────────────────────────────────────────────────────────────
// =============================================================================

/** Instância aberta do banco. Preenchida por _abrirDB(). */
let _db = null;

/**
 * Abre (ou cria) o banco IndexedDB.
 * Chamada uma única vez em carregarDados(); reutiliza _db nas demais.
 * @returns {Promise<IDBDatabase>}
 */
function _abrirDB() {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('IndexedDB não suportado'));
      return;
    }

    const req = indexedDB.open(IDB_NAME, IDB_VERSION);

    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
        console.log('[IDB] Object store criado');
      }
    };

    req.onsuccess = e => {
      _db = e.target.result;

      // Trata erros inesperados de conexão
      _db.onerror = ev => console.error('[IDB] Erro geral:', ev.target.error);

      // Quando o banco for fechado externamente (ex: upgrade em outra aba), limpa o cache
      _db.onversionchange = () => {
        _db.close();
        _db = null;
        console.warn('[IDB] Banco fechado por upgrade em outra aba');
      };

      console.log('[IDB] Banco aberto com sucesso');
      resolve(_db);
    };

    req.onerror   = e => reject(e.target.error);
    req.onblocked = () => {
      console.warn('[IDB] Abertura bloqueada — feche outras abas do app');
      reject(new Error('IDB bloqueado'));
    };
  });
}

/**
 * Lê o registro principal do IndexedDB.
 * @returns {Promise<Object|null>}
 */
function _idbLer() {
  return _abrirDB().then(db => new Promise((resolve, reject) => {
    const tx  = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror   = () => reject(req.error);
  }));
}

/**
 * Grava o registro principal no IndexedDB.
 * @param {Object} dados
 * @returns {Promise<void>}
 */
function _idbGravar(dados) {
  return _abrirDB().then(db => new Promise((resolve, reject) => {
    const tx  = db.transaction(IDB_STORE, 'readwrite');
    const req = tx.objectStore(IDB_STORE).put(dados, IDB_KEY);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
    tx.onabort    = () => reject(tx.error);
  }));
}

/**
 * Remove o registro principal do IndexedDB (usado no resetAll).
 * @returns {Promise<void>}
 */
function _idbApagar() {
  return _abrirDB().then(db => new Promise((resolve, reject) => {
    const tx  = db.transaction(IDB_STORE, 'readwrite');
    const req = tx.objectStore(IDB_STORE).delete(IDB_KEY);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  }));
}

// =============================================================================
// ── Persistência pública ─────────────────────────────────────────────────────
// =============================================================================

/**
 * Serializa o estado global e persiste no IndexedDB.
 * Em caso de falha do IDB, faz fallback para localStorage.
 * @returns {Promise<void>}
 */
async function salvarTudo() {
  const dados = {
    version: APP_VERSION,
    savedAt: new Date().toISOString(),
    lancamentos,
    compras,
    recorrencias,
    cartoes,
    reservaMetas,
    categoriasPersonalizadas,
    orcamentos,
  };

  invalidarCacheLancamentos();

  try {
    await _idbGravar(dados);
    console.log('[IDB] Dados salvos');
  } catch (err) {
    console.warn('[IDB] Falha ao salvar — usando localStorage como fallback:', err);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dados));
    } catch (lsErr) {
      console.error('[Storage] Fallback também falhou:', lsErr);
    }
  }
}

/**
 * Carrega os dados para o estado global.
 * Tenta IndexedDB primeiro; se vazio ou falhar, tenta localStorage
 * (migração automática de instalações antigas) e depois salva no IDB.
 * @returns {Promise<void>}
 */
async function carregarDados() {
  let dados = null;
  let origem = 'nenhuma';

  // 1. Tenta IndexedDB
  try {
    dados = await _idbLer();
    if (dados) origem = 'indexedDB';
  } catch (err) {
    console.warn('[IDB] Falha na leitura, tentando localStorage:', err);
  }

  // 2. Fallback / migração: tenta localStorage
  if (!dados) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        dados  = JSON.parse(raw);
        origem = 'localStorage (migração)';
      }
    } catch (e) {
      console.warn('[Storage] localStorage ilegível:', e);
    }
  }

  // 3. Aplica os dados encontrados
  if (dados && dados.version && dados.version.startsWith('8')) {
    lancamentos              = dados.lancamentos              || [];
    compras                  = dados.compras                  || [];
    recorrencias             = dados.recorrencias             || [];
    cartoes                  = dados.cartoes                  || [];
    reservaMetas             = dados.reservaMetas             || [];
    categoriasPersonalizadas = dados.categoriasPersonalizadas || [];
    orcamentos               = dados.orcamentos               || [];

    console.log(`[Storage] Dados carregados de: ${origem}`);

    // 4. Migração: se vieram do localStorage, salva no IDB e limpa o LS
    if (origem === 'localStorage (migração)') {
      try {
        await salvarTudo();
        localStorage.removeItem(STORAGE_KEY);
        console.log('[Storage] Migração localStorage → IndexedDB concluída');
      } catch (e) {
        console.warn('[Storage] Falha ao migrar para IDB:', e);
      }
    }
    return;
  }

  // 5. Nenhum dado encontrado — estado inicial
  lancamentos              = [];
  compras                  = [];
  recorrencias             = [];
  cartoes                  = [];
  reservaMetas             = [];
  categoriasPersonalizadas = [];
  orcamentos               = [];

  await salvarTudo();
  console.log('[Storage] Estado inicial criado no IndexedDB');
}

/**
 * Apaga todos os dados persistidos (IDB + localStorage).
 * Chamado por resetAll() em configuracoes.js.
 * @returns {Promise<void>}
 */
async function apagarTudoPersistido() {
  try {
    await _idbApagar();
  } catch (e) {
    console.warn('[IDB] Falha ao apagar IDB:', e);
  }
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (_) {}
  invalidarCacheLancamentos();
  console.log('[Storage] Dados persistidos apagados');
}

// Expõe para configuracoes.js e outros módulos que precisam
window.apagarTudoPersistido = apagarTudoPersistido;

// =============================================================================
// ── Cache ─────────────────────────────────────────────────────────────────────
// =============================================================================

function invalidarCacheLancamentos() {
  _cacheTodosLancamentos = null;
  _cacheTimestamp        = null;
}

// =============================================================================
// ── Helpers de consulta (síncronos — operam sobre o estado em memória) ────────
// =============================================================================

function getCategoriasReceita() {
  return [
    ...categoriasReceitaPadrao,
    ...categoriasPersonalizadas.filter(c => c.tipo === 'receita').map(c => c.nome),
  ];
}

function getCategoriasDespesa() {
  return [
    ...categoriasDespesaPadrao,
    ...categoriasPersonalizadas.filter(c => c.tipo === 'despesa').map(c => c.nome),
  ];
}

function calcularSaldoReal() {
  const receitas   = lancamentos.filter(l => l.valor > 0 && l.tipo !== 'pagamento_fatura').reduce((s, l) => s + l.valor, 0);
  const despesas   = lancamentos.filter(l => l.valor < 0 && l.tipo === 'despesa_avista').reduce((s, l) => s + Math.abs(l.valor), 0);
  const pagamentos = lancamentos.filter(l => l.tipo === 'pagamento_fatura').reduce((s, l) => s + Math.abs(l.valor), 0);
  return receitas - despesas - pagamentos;
}

function getTotalUtilizadoCartao(cartaoId) {
  return compras
    .filter(c => c.cartaoId === cartaoId)
    .reduce((total, c) => total + (c.parcelas - c.parcelasPagas) * c.valorParcela, 0);
}

function getDataVencimentoParcela(compra, cartao, indiceParcela) {
  const dataCompra = parseLocalDate(compra.dataCompra);
  const diaCompra  = dataCompra.getDate();
  const offsetMes  = diaCompra > cartao.fechamento ? 1 : 0;
  const mesVenc    = dataCompra.getMonth() + offsetMes + indiceParcela;
  return new Date(dataCompra.getFullYear(), mesVenc, cartao.vencimento);
}

function getFaturaPorMes(cartao, mes, ano) {
  let valorTotal = 0;
  const parcelasDaFatura = [];

  for (const compra of compras) {
    if (compra.cartaoId !== cartao.id) continue;
    const dataCompra  = parseLocalDate(compra.dataCompra);
    const diaCompra   = dataCompra.getDate();
    const offsetMes   = diaCompra > cartao.fechamento ? 1 : 0;

    for (let i = 0; i < compra.parcelas; i++) {
      const mesVenc       = dataCompra.getMonth() + offsetMes + i;
      const dataVencimento = new Date(dataCompra.getFullYear(), mesVenc, cartao.vencimento);
      const noMes  = dataVencimento.getMonth() === mes && dataVencimento.getFullYear() === ano;
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

function obterTodosLancamentosParaUI(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && _cacheTodosLancamentos && (now - _cacheTimestamp < 5000)) {
    return _cacheTodosLancamentos;
  }

  const todos = [...lancamentos];

  for (const compra of compras) {
    const cartao = cartoes.find(c => c.id === compra.cartaoId);
    if (!cartao) {
      todos.push({
        id: compra.id, data: compra.dataCompra, descricao: compra.descricao,
        categoria: compra.categoria, valor: -compra.valorTotal,
        tipo: 'compra_parcelada', parcelas: compra.parcelas,
        parcelasPagas: compra.parcelasPagas, valorParcela: compra.valorParcela,
        cartaoId: compra.cartaoId, compraId: compra.id,
      });
      continue;
    }

    const dataCompra = parseLocalDate(compra.dataCompra);
    const diaCompra  = dataCompra.getDate();
    const offsetPrimeiraParcela = diaCompra >= cartao.fechamento ? 1 : 0;

    for (let i = compra.parcelasPagas; i < compra.parcelas; i++) {
      const mesVencimento  = dataCompra.getMonth() + offsetPrimeiraParcela + (i - compra.parcelasPagas);
      const dataVencimento = new Date(dataCompra.getFullYear(), mesVencimento, cartao.vencimento);
      if (!isNaN(dataVencimento.getTime())) {
        todos.push({
          id: `${compra.id}_parcela_${i + 1}`,
          data: formatarDataLocal(dataVencimento),
          dataCompra: compra.dataCompra,
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

  _cacheTodosLancamentos = todos;
  _cacheTimestamp        = now;
  return todos;
}
