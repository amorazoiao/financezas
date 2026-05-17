// =============================================================================
// app.js — Inicialização, navegação entre telas e event listeners globais
// =============================================================================
// Este é o ponto de entrada principal. Deve ser carregado por último,
// depois de todos os outros módulos.
// =============================================================================

// ---------- Navegação entre telas ----------

/**
 * Navega para uma tela específica da aplicação.
 * Atualiza os itens do menu inferior e inicializa o conteúdo da tela destino.
 * @param {string} screenId — ID da tela sem o prefixo "screen-" (ex: 'dashboard')
 */
function goToScreen(screenId) {
  // Desativa todas as telas e ativa a alvo
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(`screen-${screenId}`);
  if (target) target.classList.add('active');

  // Atualiza estado ativo no menu inferior
  document.querySelectorAll('.nav-item[data-screen]').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-screen') === screenId);
  });

  // Inicialização específica de cada tela
  switch (screenId) {
    case 'extrato': {
      const h = new Date();
      currentFilterMes = h.getMonth();
      currentFilterAno = h.getFullYear();
      atualizarDisplayMes(currentFilterMes, currentFilterAno);
      carregarExtratoComFiltro(currentFilterMes, currentFilterAno);
      break;
    }
    case 'cartoes': {
      renderCartoesCarrossel();
      if (currentCartaoId) {
        document.getElementById('cartao-detail-section').style.display = 'block';
        document.getElementById('nenhum-cartao-selecionado').style.display = 'none';
        renderDetalhesCartao();
        renderOperacoesFatura();
      } else {
        document.getElementById('cartao-detail-section').style.display = 'none';
        document.getElementById('nenhum-cartao-selecionado').style.display = 'block';
      }
      break;
    }
    case 'recorrentes':
      renderRecorrenciasTab();
      break;
    case 'reserva':
      atualizarReservaDisplay();
      break;
    case 'orcamento':
      carregarOrcamentos();
      break;
  }

  // Vibração tátil sutil (suporte limitado)
  if (navigator.vibrate) navigator.vibrate(10);
}

// ---------- Bottom Sheets ----------

/**
 * Exibe um bottom sheet pelo ID.
 * @param {string} sheetId
 */
function openSheet(sheetId) {
  document.getElementById(sheetId).style.display = 'flex';
  if (navigator.vibrate) navigator.vibrate(10);
}

/**
 * Fecha um bottom sheet pelo ID.
 * @param {string} sheetId
 */
function closeSheet(sheetId) {
  document.getElementById(sheetId).style.display = 'none';
}

/**
 * Trata o clique nos botões do bottom sheet de nova transação.
 * @param {'receita'|'despesa'|'cartao'} tipo
 */
function handleNewTransaction(tipo) {
  closeSheet('newSheet');
  if (tipo === 'receita')  abrirModalTransacao('receita');
  else if (tipo === 'despesa') abrirModalTransacao('despesa');
  else if (tipo === 'cartao')  abrirModalCompra();
}

/**
 * Abre o sub-sheet de criação de recorrência.
 */
function openRecurrentSheet() {
  closeSheet('newSheet');
  openSheet('recurrentSheet');
}

/**
 * Cria uma recorrência do tipo especificado.
 * @param {'receita'|'despesa'} tipo
 */
function createRecurrent(tipo) {
  closeSheet('recurrentSheet');
  abrirModalTransacaoComRecorrencia(tipo);
}

// ---------- Renderização global ----------

/**
 * Re-renderiza todos os componentes da aplicação.
 * Chamado após qualquer alteração nos dados.
 */
function renderTudo() {
  atualizarDashboard();
  atualizarReservaDisplay();
  renderCartoesCarrossel();
  renderRecorrenciasTab();
  atualizarPrevisaoFinanceira();

  // Mantém a tela de cartões sincronizada após operações
  if (currentCartaoId) {
    const cartaoExiste = cartoes.find(c => c.id === currentCartaoId);
    if (cartaoExiste) {
      document.getElementById('cartao-detail-section').style.display = 'block';
      document.getElementById('nenhum-cartao-selecionado').style.display = 'none';
      renderDetalhesCartao();
      renderOperacoesFatura();
    } else {
      currentCartaoId = null;
      document.getElementById('cartao-detail-section').style.display = 'none';
      document.getElementById('nenhum-cartao-selecionado').style.display = 'block';
    }
  }

  setupMoneyInputs();
}

// ---------- Event listeners ----------

/**
 * Fecha bottom sheets ao clicar fora do conteúdo.
 */
document.querySelectorAll('.sheet-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.style.display = 'none';
  });
});

/**
 * Navegação pelos botões do menu inferior.
 */
document.querySelectorAll('.nav-item[data-screen]').forEach(btn => {
  btn.addEventListener('click', () => goToScreen(btn.getAttribute('data-screen')));
});

/**
 * Botão central "+" abre o sheet de novo lançamento.
 */
document.getElementById('centralButton').addEventListener('click', () => openSheet('newSheet'));

/**
 * Botão "☰ Mais" abre o sheet de mais opções.
 */
document.getElementById('moreButton').addEventListener('click', () => openSheet('moreSheet'));

/**
 * Fecha modais ao clicar no overlay externo.
 */
window.onclick = e => {
  const modais = [
    'modal-transacao',
    'modal-cartao',
    'modal-compra',
    'modal-config',
    'modal-meta',
    'modal-pagamento',
    'modal-orcamento',
  ];
  for (const id of modais) {
    const el = document.getElementById(id);
    if (e.target === el) el.style.display = 'none';
  }
};

// ---------- Inicialização ----------

/**
 * Ponto de entrada da aplicação.
 * Carrega dados, configura UI e inicia processamento de recorrências.
 */
function initApp() {
  carregarDados();
  initFilter();
  renderTudo();

  // Destaca o botão de despesas no gráfico do dashboard
  document.getElementById('btn-despesas')?.classList.add('active');

  // Configura inputs de moeda
  setupMoneyInputs();

  // Processa recorrências: na inicialização e a cada 5 minutos
  setTimeout(() => processarRecorrencias(), 1_000);
  setInterval(() => processarRecorrencias(), 300_000);

  // Navega para o dashboard
  goToScreen('dashboard');
}

window.onload = initApp;
