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
async function goToScreen(screenId) {
  // Verifica se o app está desbloqueado para telas sensíveis
  const telasSensiveis = ['orcamento', 'recorrentes', 'reserva'];
  if (telasSensiveis.includes(screenId)) {
    const desbloqueado = await solicitarDesbloqueio(`Acessar ${screenId}`);
    if (!desbloqueado) return;
  }
  
  // Desativa todas as telas e ativa a alvo
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(`screen-${screenId}`);
  if (target) target.classList.add('active');

  // Atualiza estado ativo no menu inferior
  document.querySelectorAll('.nav-item[data-screen]').forEach(btn => {
    const isActive = btn.getAttribute('data-screen') === screenId;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive);
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
async function abrirModalAcessivel(modalId) {
  // Verifica se o modal requer desbloqueio
  const modaisSensiveis = ['modal-config', 'modal-seguranca'];
  if (modaisSensiveis.includes(modalId)) {
    const desbloqueado = await solicitarDesbloqueio('Abrir configurações');
    if (!desbloqueado) return;
  }
  
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal._focoAnterior = document.activeElement;
  modal.style.display = 'flex';
  requestAnimationFrame(() => modal.classList.add('modal-open'));
  document.getElementById('appContainer')?.setAttribute('aria-hidden', 'true');
  requestAnimationFrame(() => {
    if (_trapCleanups[modalId]) _trapCleanups[modalId]();
    _trapCleanups[modalId] = _trapFocus(modal);
  });
}

/**
 * Exibe um bottom sheet pelo ID com animação slide-up.
 * @param {string} sheetId
 */
function openSheet(sheetId) {
  const el = document.getElementById(sheetId);
  if (!el) return;
  el.style.display = 'flex';
  // Aguarda frame para a animação CSS disparar
  requestAnimationFrame(() => el.classList.add('sheet-open'));
  if (navigator.vibrate) navigator.vibrate(10);
}

/**
 * Fecha um bottom sheet pelo ID.
 * @param {string} sheetId
 */
function closeSheet(sheetId) {
  const el = document.getElementById(sheetId);
  if (!el) return;
  el.classList.remove('sheet-open');
  el.style.display = 'none';
}

/**
 * Trata o clique nos botões do bottom sheet de nova transação.
 * Mantido para compatibilidade com chamadas legadas.
 * @param {'receita'|'despesa'|'cartao'} tipo
 */
async function handleNewTransaction(tipo) {
  // Verifica desbloqueio para transações financeiras
  const desbloqueado = await solicitarDesbloqueio('Nova transação');
  if (!desbloqueado) return;
  
  closeSheet('newSheet');
  if (tipo === 'receita')       abrirModalTransacao('receita');
  else if (tipo === 'despesa')  abrirModalTransacao('despesa');
  else if (tipo === 'cartao') {
    abrirModalTransacao('despesa');
    // Ativa chip de cartão após abrir
    setTimeout(() => {
      const chipCartao = document.querySelector('.forma-pag-chip[data-forma="cartao"]');
      if (chipCartao) chipCartao.click();
    }, 80);
  }
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
async function createRecurrent(tipo) {
  const desbloqueado = await solicitarDesbloqueio('Criar recorrência');
  if (!desbloqueado) return;
  
  closeSheet('recurrentSheet');
  abrirModalTransacaoComRecorrencia(tipo);
}

/**
 * Abre o modal de transação com a forma "recorrente" pré-selecionada.
 * Usado pelos botões "+ Receita" e "+ Despesa" na aba Recorrências.
 * @param {'receita'|'despesa'} tipo
 */
async function abrirModalTransacaoComRecorrencia(tipo) {
  const desbloqueado = await solicitarDesbloqueio('Nova transação recorrente');
  if (!desbloqueado) return;
  
  // Abre o modal normalmente
  abrirModalTransacao(tipo);

  // Após o modal abrir, ativa o modo recorrente
  setTimeout(() => {
    if (tipo === 'despesa') {
      // Para despesas: clicar no chip "Recorrente" da forma de pagamento
      const chipRec = document.querySelector('.forma-pag-chip[data-forma="recorrente"]');
      if (chipRec) {
        chipRec.click();
      } else {
        // Fallback: acionar _aplicarFormaPagamento diretamente
        if (typeof _aplicarFormaPagamento === 'function') {
          document.querySelectorAll('.forma-pag-chip').forEach(c => c.classList.remove('active'));
          const chip = document.querySelector('.forma-pag-chip[data-forma="recorrente"]');
          if (chip) chip.classList.add('active');
          _aplicarFormaPagamento('recorrente');
        }
      }
    } else {
      // Para receitas: ativar o toggle de recorrência
      const toggle = document.getElementById('receita-recorrencia-toggle');
      const checkbox = toggle ? toggle.querySelector('input[type="checkbox"]') : null;
      if (checkbox && !checkbox.checked) {
        checkbox.checked = true;
        checkbox.dispatchEvent(new Event('change'));
      }
      // Ou acionar a seção recorrente diretamente
      const secRec = document.getElementById('secao-recorrente');
      if (secRec) secRec.style.display = 'block';
      if (typeof _resetarPainelRecorrencia === 'function') _resetarPainelRecorrencia();
    }
  }, 60);
}

// ---------- Renderização global ----------

/**
 * Re-renderiza todos os componentes da aplicação.
 * Chamado após qualquer alteração nos dados.
 */
function renderTudo() {
  // Verifica se valores devem ser ocultados
  const saldoOculto = typeof isSaldoOculto === 'function' && isSaldoOculto();
  
  atualizarDashboard();
  atualizarReservaDisplay();
  renderCartoesCarrossel();
  renderRecorrenciasTab();
  atualizarPrevisaoFinanceira();

  if (currentCartaoId) {
    const cartaoExiste = cartoes.find(c => c.id === currentCartaoId);
    if (cartaoExiste) {
      const detailSection = document.getElementById('cartao-detail-section');
      const emptyStateDiv = document.getElementById('nenhum-cartao-selecionado');
      if (detailSection) detailSection.style.display = 'block';
      if (emptyStateDiv) emptyStateDiv.style.display = 'none';
      renderDetalhesCartao();
      renderOperacoesFatura();
    } else {
      currentCartaoId = null;
      const detailSection = document.getElementById('cartao-detail-section');
      const emptyStateDiv = document.getElementById('nenhum-cartao-selecionado');
      if (detailSection) detailSection.style.display = 'none';
      if (emptyStateDiv) emptyStateDiv.style.display = 'block';
    }
  }

  setupMoneyInputs();
  
  // Aplica ocultação se necessário
  if (saldoOculto && typeof atualizarOcultacaoValores === 'function') {
    atualizarOcultacaoValores();
  }
}

// ---------- Abrir configurações (protegido) ----------

/**
 * Abre o modal de configurações (versão protegida por segurança)
 */
async function openSettings() {
  const desbloqueado = await solicitarDesbloqueio('Configurações');
  if (!desbloqueado) return;
  
  categoriaSearchTerm = '';
  const si = document.getElementById('categorias-search');
  if (si) si.value = '';

  renderCategoriasManager();
  abrirModalAcessivel('modal-config');
}

// ---------- Abrir modal de transação (compatível com transacoes.js) ----------

/**
 * Abre o modal de transação (wrapper que chama a função do transacoes.js)
 * @param {'receita'|'despesa'} tipo 
 */
function abrirModalTransacao(tipo) {
  // Esta função é definida em transacoes.js
  if (typeof window._abrirModalTransacaoOriginal === 'function') {
    window._abrirModalTransacaoOriginal(tipo);
  } else if (typeof abrirNovoLancamento === 'function') {
    // Fallback para o método antigo
    if (tipo === 'receita') abrirNovoLancamento('receita');
    else abrirNovoLancamento('despesa');
  }
}

// Salva referência original
if (typeof abrirModalTransacao !== 'undefined') {
  window._abrirModalTransacaoOriginal = abrirModalTransacao;
}

// ---------- Event listeners ----------

/**
 * Fecha bottom sheets ao clicar fora do conteúdo.
 */
document.querySelectorAll('.sheet-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) {
      overlay.classList.remove('sheet-open');
      overlay.style.display = 'none';
    }
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
const centralButton = document.getElementById('centralButton');
if (centralButton) {
  centralButton.addEventListener('click', async () => {
    const desbloqueado = await solicitarDesbloqueio('Nova transação');
    if (desbloqueado) openSheet('newSheet');
  });
}

/**
 * Botão "☰ Mais" abre o sheet de mais opções.
 */
const moreButton = document.getElementById('moreButton');
if (moreButton) {
  moreButton.addEventListener('click', () => openSheet('moreSheet'));
}

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
    'modal-seguranca',
  ];
  for (const id of modais) {
    const el = document.getElementById(id);
    if (e.target === el) {
      fecharModal(id);
    }
  }
};

// ---------- PWA: registro do Service Worker + detecção de atualização ----------

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/financezas/service-worker.js')
    .then(registration => {
      console.log('[PWA] Service Worker registrado:', registration.scope);

      // SW novo encontrado enquanto um antigo já está ativo → mostra banner
      registration.addEventListener('updatefound', () => {
        const novoSW = registration.installing;
        if (novoSW) {
          novoSW.addEventListener('statechange', () => {
            if (novoSW.state === 'installed' && navigator.serviceWorker.controller) {
              // Há uma versão nova esperando: pede confirmação ao usuário
              _mostrarBannerAtualizacao(novoSW);
            }
          });
        }
      });

      // Verifica se já há um SW esperando (ex: aba reaberta após deploy)
      if (registration.waiting && navigator.serviceWorker.controller) {
        _mostrarBannerAtualizacao(registration.waiting);
      }
    })
    .catch(err => console.error('[FinanÇezas] SW registro falhou:', err));

  // Quando o SW ativa a nova versão, recarrega a página automaticamente
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    console.log('[PWA] Nova versão ativada, recarregando...');
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
    <div class="pwa-banner-inner">
      <span class="pwa-banner-icon">🔄</span>
      <span>Nova versão disponível!</span>
      <button onclick="_aplicarAtualizacao()" class="pwa-banner-btn">Atualizar</button>
      <button onclick="document.getElementById('update-banner').remove()" class="pwa-banner-close" aria-label="Dispensar">✕</button>
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
  // Não mostra se já está instalado como standalone
  if (window.matchMedia('(display-mode: standalone)').matches) return;
  // Não mostra se já existe banner
  if (document.getElementById('pwa-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'pwa-banner';
  banner.innerHTML = `
    <div class="pwa-banner-inner">
      <span class="pwa-banner-icon">📲</span>
      <span>Instalar o FinanÇezas</span>
      <button onclick="instalarPWA()" class="pwa-banner-btn">Instalar</button>
      <button onclick="document.getElementById('pwa-banner').remove()" class="pwa-banner-close">✕</button>
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
  if (isIOS && typeof confirmar === 'function') {
    confirmar({
      icone: '📲',
      titulo: 'Instalar no iPhone',
      mensagem: 'Toque em Compartilhar ⬆ na barra do Safari e depois em "Adicionar à Tela de Início".',
      textoBotao: 'Entendi',
    }, () => {});
  }
}

// ---------- Segurança: Modal de segurança ----------

/**
 * Abre o modal de configurações de segurança
 */
async function abrirModalSeguranca() {
  const desbloqueado = await solicitarDesbloqueio('Configurações de segurança');
  if (!desbloqueado) return;

  // Usa a função pública isPinConfigurado() do security.js (nunca lê _pinHash diretamente)
  const temPin = typeof isPinConfigurado === 'function' && isPinConfigurado();
  const btnConfig = document.getElementById('btn-config-pin');
  const btnRemove = document.getElementById('btn-remove-pin');

  if (btnConfig) {
    btnConfig.textContent = temPin ? 'Alterar PIN' : 'Configurar PIN';
  }
  if (btnRemove) {
    btnRemove.style.display = temPin ? 'inline-flex' : 'none';
  }

  // Atualiza toggle de ocultação
  const hideToggle = document.getElementById('hide-balance-toggle');
  if (hideToggle && typeof isSaldoOculto === 'function') {
    hideToggle.checked = isSaldoOculto();
  }

  // Atualiza toggle de bloqueio automático
  const autoLockToggle = document.getElementById('auto-lock-toggle');
  if (autoLockToggle) {
    const autoLockEnabled = localStorage.getItem('auto_lock_enabled') !== 'false';
    autoLockToggle.checked = autoLockEnabled;
  }

  abrirModalAcessivel('modal-seguranca');
}

// Configura toggle de bloqueio automático
document.addEventListener('DOMContentLoaded', () => {
  const autoLockToggle = document.getElementById('auto-lock-toggle');
  if (autoLockToggle) {
    autoLockToggle.addEventListener('change', (e) => {
      localStorage.setItem('auto_lock_enabled', e.target.checked);
      if (!e.target.checked && typeof _pararMonitorAtividade === 'function') {
        _pararMonitorAtividade();
      } else if (e.target.checked && typeof _reiniciarMonitorInatividade === 'function') {
        _reiniciarMonitorInatividade();
      }
    });
  }
});

// ---------- FUNÇÃO DE DESBLOQUEIO (delegada ao security.js) ----------
// A implementação real está em security.js. Após desbloqueio bem-sucedido
// o security.js chama _resolveDesbloqueio; aqui apenas garantimos que o
// dashboard seja re-renderizado quando o PIN for aceito.
// Ver: security.js → solicitarDesbloqueio()

// ---------- FUNÇÕES DO MENU "MAIS" ----------

/**
 * Alterna entre modo claro e escuro
 */
function toggleDarkMode() {
  document.body.classList.toggle('dark');
  const isDark = document.body.classList.contains('dark');
  localStorage.setItem('dark_mode_finance', isDark);
  
  // Atualiza gráficos se necessário
  if (typeof atualizarGrafico === 'function') {
    atualizarGrafico();
  }
  if (typeof renderEvolutionChart === 'function') {
    renderEvolutionChart();
  }
  
  showToast(isDark ? '🌙 Modo escuro ativado' : '☀️ Modo claro ativado');
}

/**
 * Navega para a tela de orçamento
 */
function irParaOrcamento() {
  closeSheet('moreSheet');
  goToScreen('orcamento');
}

/**
 * Navega para a tela de recorrentes
 */
function irParaRecorrentes() {
  closeSheet('moreSheet');
  goToScreen('recorrentes');
}

/**
 * Navega para a tela de reserva
 */
function irParaReserva() {
  closeSheet('moreSheet');
  goToScreen('reserva');
}

/**
 * Abre configurações de segurança
 */
function irParaSeguranca() {
  closeSheet('moreSheet');
  abrirModalSeguranca();
}

/**
 * Abre configurações gerais
 */
function irParaConfiguracoes() {
  closeSheet('moreSheet');
  openSettings();
}

/**
 * Alterna tema escuro e fecha sheet
 */
function alternarTema() {
  closeSheet('moreSheet');
  toggleDarkMode();
}

// ---------- Inicialização ----------

/**
 * Atualiza saudação e data no header do dashboard.
 */
function _atualizarSaudacao() {
  const hora = new Date().getHours();
  let saud = 'Boa noite';
  if (hora >= 5 && hora < 12) saud = 'Bom dia';
  if (hora >= 12 && hora < 18) saud = 'Boa tarde';
  if (hora >= 18) saud = 'Boa noite';

  const elHora = document.getElementById('db-greeting-hora');
  if (elHora) elHora.textContent = saud;

  // Data por extenso
  const elData = document.getElementById('db-current-date');
  if (elData) {
    elData.textContent = new Date().toLocaleDateString('pt-BR', {
      weekday: 'long', 
      day: 'numeric', 
      month: 'long'
    });
  }
}

/**
 * Ponto de entrada da aplicação.
 */
async function initApp() {
  console.log('[FinanÇezas] Inicializando...');
  
  // Carrega dados primeiro
  if (typeof carregarDados === 'function') {
    carregarDados();
  }
  
  // Inicializa filtros
  if (typeof initFilter === 'function') {
    initFilter();
  }
  
  // Inicializa sistema de segurança
  if (typeof initSecurity === 'function') {
    initSecurity();
  }
  
  // Aguarda um pouco para o security inicializar
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Verifica se tem PIN e se o app está desbloqueado
  const temPin = typeof isPinConfigurado === 'function' && isPinConfigurado();
  const estaDesbloqueado = typeof isAppDesbloqueado === 'function' && isAppDesbloqueado();
  
  console.log('[FinanÇezas] Tem PIN:', temPin, 'Está desbloqueado:', estaDesbloqueado);
  
  if (temPin && !estaDesbloqueado) {
    console.log('[FinanÇezas] App bloqueado, solicitando PIN...');
    const desbloqueado = await solicitarDesbloqueio('inicial');
    if (!desbloqueado) {
      console.log('[FinanÇezas] App bloqueado, aguardando PIN');
      // Fica aguardando o PIN
      return;
    }
  }
  
  // GARANTE QUE OS DADOS ESTÃO CARREGADOS ANTES DE RENDERIZAR
  if (typeof invalidarCacheLancamentos === 'function') {
    invalidarCacheLancamentos();
  }
  
  // Renderiza tudo
  if (typeof renderTudo === 'function') {
    renderTudo();
  }
  
  // FORÇA ATUALIZAÇÃO DO DASHBOARD ESPECIFICAMENTE
  setTimeout(() => {
    if (typeof forcarAtualizacaoDashboard === 'function') {
      forcarAtualizacaoDashboard();
    }
  }, 50);
  
  _atualizarSaudacao();

  const btnDespesas = document.getElementById('btn-despesas');
  if (btnDespesas) btnDespesas.classList.add('active');
  
  if (typeof setupMoneyInputs === 'function') {
    setupMoneyInputs();
  }

  setTimeout(() => {
    if (typeof processarRecorrencias === 'function') {
      processarRecorrencias();
    }
  }, 1000);
  
  setInterval(() => {
    if (typeof processarRecorrencias === 'function') {
      processarRecorrencias();
    }
  }, 300000);

  goToScreen('dashboard');

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
  if (isIOS && !isStandalone) {
    setTimeout(_mostrarBannerInstalar, 3000);
  }
  
  console.log('[FinanÇezas] Inicializado com sucesso!');
}

// ---------- Proteção de ações sensíveis ----------

/**
 * Wrapper para ações que requerem autenticação
 * @param {Function} action - Função a ser executada
 * @param {string} [motivo] - Motivo da solicitação
 */
async function acaoSegura(action, motivo = 'Ação requer autenticação') {
  const desbloqueado = await solicitarDesbloqueio(motivo);
  if (desbloqueado && typeof action === 'function') {
    action();
  } else if (!desbloqueado && typeof showToast === 'function') {
    showToast('🔒 É necessário desbloquear o app primeiro', true);
  }
}

// Sobrescreve funções sensíveis para exigir desbloqueio
// Nota: configurarPin e removerPin NÃO estão aqui pois já gerenciam
// sua própria autenticação internamente via security.js
const funcoesSensiveis = [
  'resetAll',
  'exportExcel',
  'exportPDFGeral',
  'backup',
  'restore',
];

funcoesSensiveis.forEach(nome => {
  const original = window[nome];
  if (typeof original === 'function') {
    window[nome] = function(...args) {
      return acaoSegura(() => original(...args), `${nome} requer autenticação`);
    };
  }
});

// Inicializa quando o DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

// Exporta funções públicas
window.goToScreen = goToScreen;
window.openSheet = openSheet;
window.closeSheet = closeSheet;
window.handleNewTransaction = handleNewTransaction;
window.openRecurrentSheet = openRecurrentSheet;
window.createRecurrent = createRecurrent;
window.abrirModalTransacaoComRecorrencia = abrirModalTransacaoComRecorrencia;
window.abrirModalTransacao = abrirModalTransacao;
window.renderTudo = renderTudo;
window.abrirModalAcessivel = abrirModalAcessivel;
window.abrirModalSeguranca = abrirModalSeguranca;
window.acaoSegura = acaoSegura;
window.instalarPWA = instalarPWA;
window.openSettings = openSettings;
window.toggleDarkMode = toggleDarkMode;
window.irParaOrcamento = irParaOrcamento;
window.irParaRecorrentes = irParaRecorrentes;
window.irParaReserva = irParaReserva;
window.irParaSeguranca = irParaSeguranca;
window.irParaConfiguracoes = irParaConfiguracoes;
window.alternarTema = alternarTema;
// window.solicitarDesbloqueio já exportado pelo security.js