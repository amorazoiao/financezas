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
  // Ignora cliques dentro do sistema de dialogs (dlg-overlay)
  if (e.target.closest && e.target.closest('#dlg-overlay')) return;

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

// ---------- PWA: botão de instalação ----------

let _pwaPrompt = null;

// Captura o evento de instalação do browser (Android/Chrome)
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  _pwaPrompt = e;
  _mostrarBannerInstalar();
});

function _mostrarBannerInstalar() {
  if (window.matchMedia('(display-mode: standalone)').matches) return;

  const banner = document.createElement('div');
  banner.id = 'pwa-banner';
  banner.innerHTML = `
    <div style="
      position:fixed; bottom:80px; left:50%; transform:translateX(-50%);
      background:#1e293b; color:white; padding:12px 20px;
      border-radius:16px; display:flex; align-items:center; gap:12px;
      box-shadow:0 8px 32px rgba(0,0,0,.3); z-index:9998;
      font-size:14px; white-space:nowrap; max-width:90vw;">
      <span style="font-size:1.4rem;">📲</span>
      <span>Instalar o FinanÇezas</span>
      <button onclick="instalarPWA()" style="
        background:#6366f1; color:white; border:none; border-radius:10px;
        padding:8px 14px; font-weight:600; cursor:pointer;">Instalar</button>
      <button onclick="document.getElementById('pwa-banner').remove()" style="
        background:none; border:none; color:#94a3b8; cursor:pointer; font-size:1.2rem;">✕</button>
    </div>`;
  document.body.appendChild(banner);
}

/**
 * Dispara o prompt nativo de instalação do PWA.
 * No iPhone mostra instruções manuais pois o iOS não suporta o prompt automático.
 */
function instalarPWA() {
  if (_pwaPrompt) {
    _pwaPrompt.prompt();
    _pwaPrompt.userChoice.then(() => {
      _pwaPrompt = null;
      const b = document.getElementById('pwa-banner');
      if (b) b.remove();
    });
    return;
  }

  // iOS — mostra instrução manual
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (isIOS) {
    confirmar({
      icone: '📲',
      titulo: 'Instalar no iPhone',
      mensagem: 'Toque em Compartilhar ⬆ na barra do Safari e depois em "Adicionar à Tela de Início".',
      textoBotao: 'Entendi',
    }, () => {});
  }
}

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

  // Mostra botão de instalar no iPhone após 3 segundos
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
  if (isIOS && !isStandalone) {
    setTimeout(_mostrarBannerInstalar, 3000);
  }
}

window.onload = initApp;
