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

// ---------- Acessibilidade: trap de foco em modais ----------

/**
 * Captura e mantém o foco dentro do modal aberto (WCAG 2.1 - 2.1.2).
 * Retorna uma função para remover o listener quando o modal fechar.
 * @param {HTMLElement} modal
 * @returns {Function} cleanup
 */
function _trapFocus(modal) {
  const focaveis = modal.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  if (!focaveis.length) return () => {};

  const primeiro = focaveis[0];
  const ultimo   = focaveis[focaveis.length - 1];

  function handler(e) {
    if (e.key !== 'Tab') return;
    if (e.shiftKey) {
      if (document.activeElement === primeiro) {
        e.preventDefault();
        ultimo.focus();
      }
    } else {
      if (document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    }
  }

  modal.addEventListener('keydown', handler);
  // Foca o primeiro input ou o primeiro botão focável
  const primeiroInput = modal.querySelector('input:not([type="hidden"]), select');
  (primeiroInput || primeiro)?.focus();

  return () => modal.removeEventListener('keydown', handler);
}

// Mapa para armazenar os cleanups de trap de foco por modal ID
const _trapCleanups = {};

/**
 * Abre um modal com acessibilidade completa:
 * ativa aria-hidden no fundo, faz trap de foco e restaura foco ao fechar.
 * @param {string} modalId
 */
function abrirModalAcessivel(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;

  // Salva o elemento que estava com foco antes de abrir
  modal._focoAnterior = document.activeElement;

  modal.style.display = 'flex';
  document.getElementById('appContainer')?.setAttribute('aria-hidden', 'true');

  // Aguarda o display:flex computar antes de focar
  requestAnimationFrame(() => {
    if (_trapCleanups[modalId]) _trapCleanups[modalId]();
    _trapCleanups[modalId] = _trapFocus(modal);
  });
}



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

// ---------- PWA: registro do Service Worker + detecção de atualização ----------

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/financezas/service-worker.js')
    .then(registration => {

      // SW novo encontrado enquanto um antigo já está ativo → mostra banner
      registration.addEventListener('updatefound', () => {
        const novoSW = registration.installing;
        novoSW.addEventListener('statechange', () => {
          if (novoSW.state === 'installed' && navigator.serviceWorker.controller) {
            // Há uma versão nova esperando: pede confirmação ao usuário
            _mostrarBannerAtualizacao(novoSW);
          }
        });
      });

      // Verifica se já há um SW esperando (ex: aba reaberta após deploy)
      if (registration.waiting && navigator.serviceWorker.controller) {
        _mostrarBannerAtualizacao(registration.waiting);
      }
    })
    .catch(err => console.error('[FinanÇezas] SW registro falhou:', err));

  // Quando o SW ativa a nova versão, recarrega a página automaticamente
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
}

/**
 * Exibe um banner informando que há uma nova versão disponível.
 * @param {ServiceWorker} sw — o SW em estado 'installed' (waiting)
 */
function _mostrarBannerAtualizacao(sw) {
  // Evita duplicar o banner
  if (document.getElementById('update-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'update-banner';
  banner.setAttribute('role', 'alert');
  banner.innerHTML = `
    <div style="
      position:fixed; bottom:80px; left:50%; transform:translateX(-50%);
      background:#1e293b; color:white; padding:12px 20px;
      border-radius:16px; display:flex; align-items:center; gap:12px;
      box-shadow:0 8px 32px rgba(0,0,0,.3); z-index:9998;
      font-size:14px; white-space:nowrap; max-width:90vw;">
      <span style="font-size:1.4rem;">🔄</span>
      <span>Nova versão disponível!</span>
      <button onclick="_aplicarAtualizacao()" style="
        background:#6366f1; color:white; border:none; border-radius:10px;
        padding:8px 14px; font-weight:600; cursor:pointer;">Atualizar</button>
      <button onclick="document.getElementById('update-banner').remove()" style="
        background:none; border:none; color:#94a3b8; cursor:pointer; font-size:1.2rem;"
        aria-label="Dispensar">✕</button>
    </div>`;
  document.body.appendChild(banner);

  // Guarda referência ao SW para usar ao clicar em Atualizar
  banner._sw = sw;
}

/**
 * Envia SKIP_WAITING ao SW em espera para ativar a nova versão.
 * O reload é disparado automaticamente pelo evento 'controllerchange'.
 */
function _aplicarAtualizacao() {
  const banner = document.getElementById('update-banner');
  if (banner?._sw) {
    banner._sw.postMessage({ type: 'SKIP_WAITING' });
  }
}

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
