// =============================================================================
// security.js — Sistema de segurança com PIN
// =============================================================================

console.log('[Security] Iniciando carregamento do módulo...');

const SECURITY_KEY = 'fin_security_v1';
const PIN_MAX_TENTATIVAS = 3;
const PIN_BLOQUEIO_MINUTOS = 5;

let _pinHash = null;
let _tentativasRestantes = PIN_MAX_TENTATIVAS;
let _bloqueioAte = null;
let _saldoOculto = false;
let _appDesbloqueado = false;
let _pinDigitado = '';
let _resolveDesbloqueio = null;
let _telaPinAtiva = false;

// ========== FUNÇÕES AUXILIARES (DEFINIDAS PRIMEIRO) ==========

function _simularHash(pin) {
  let hash = 0;
  for (let i = 0; i < pin.length; i++) {
    hash = ((hash << 5) - hash) + pin.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(16);
}

function _verificarPin(pin, hashArmazenado) {
  return _simularHash(pin) === hashArmazenado;
}

function _salvarSeguranca() {
  const dados = {
    pinHash: _pinHash,
    saldoOculto: _saldoOculto,
  };
  localStorage.setItem(SECURITY_KEY, JSON.stringify(dados));
  // Mantém window em sincronia para leitura por outros módulos
  window._pinHash = _pinHash;
  window._appDesbloqueado = _appDesbloqueado;
  console.log('[Security] Salvo, PIN:', !!_pinHash);
}

function _carregarSeguranca() {
  const stored = localStorage.getItem(SECURITY_KEY);
  console.log('[Security] Carregando, stored existe?', !!stored);
  if (stored) {
    try {
      const dados = JSON.parse(stored);
      _pinHash = dados.pinHash || null;
      _saldoOculto = dados.saldoOculto || false;
      console.log('[Security] PIN carregado:', !!_pinHash);
    } catch (e) {
      console.error('[Security] Erro:', e);
    }
  }
}

function _resetarPinInput() {
  _pinDigitado = '';
  const display = document.getElementById('pin-display');
  if (display) display.innerHTML = '<span>○○○○</span>';
  const msgEl = document.getElementById('pin-mensagem');
  if (msgEl) msgEl.textContent = '';
}

function _fecharTelaPin() {
  _telaPinAtiva = false;
  const telaPin = document.getElementById('pin-screen');
  if (telaPin) telaPin.style.display = 'none';
  const appContainer = document.getElementById('appContainer');
  if (appContainer) appContainer.removeAttribute('aria-hidden');
  _resetarPinInput();
}

function _mostrarMensagemPin(msg, cor = '#ef4444') {
  const msgEl = document.getElementById('pin-mensagem');
  if (msgEl) {
    msgEl.textContent = msg;
    msgEl.style.color = cor;
  }
}

// ========== FUNÇÃO PRINCIPAL DE VERIFICAÇÃO ==========

function _verificarPinDigitado() {
  console.log('[Security] Verificando PIN digitado:', _pinDigitado);
  
  // Caso 1: Nenhum PIN configurado ainda (primeira configuração)
  if (_pinHash === null) {
    // Primeira etapa: digitou o PIN pela primeira vez
    if (!window._pinTemp) {
      if (_pinDigitado.length === 4) {
        window._pinTemp = _pinDigitado;
        _resetarPinInput();
        _mostrarMensagemPin('Confirme o PIN', '#f59e0b');
        console.log('[Security] Aguardando confirmação do PIN');
      } else {
        _mostrarMensagemPin('Digite 4 dígitos', '#f59e0b');
        _resetarPinInput();
      }
      return;
    }
    
    // Segunda etapa: confirmando o PIN
    if (_pinDigitado === window._pinTemp) {
      _pinHash = _simularHash(_pinDigitado);
      _appDesbloqueado = true;
      window._pinHash = _pinHash;
      window._appDesbloqueado = true;
      _salvarSeguranca();
      _fecharTelaPin();
      if (typeof showToast === 'function') {
        showToast('✅ PIN configurado com sucesso!');
      }
      if (_resolveDesbloqueio) {
        _resolveDesbloqueio(true);
        _resolveDesbloqueio = null;
      }
      _posDesbloqueio();
      delete window._pinTemp;
      console.log('[Security] PIN configurado com sucesso');
    } else {
      _mostrarMensagemPin('PIN não confere. Tente novamente.', '#ef4444');
      _resetarPinInput();
      delete window._pinTemp;
      console.log('[Security] Confirmação falhou');
    }
    return;
  }
  
  // Caso 2: PIN já configurado (verificação normal)
  if (_verificarPin(_pinDigitado, _pinHash)) {
    _appDesbloqueado = true;
    window._appDesbloqueado = true;
    _tentativasRestantes = PIN_MAX_TENTATIVAS;
    _bloqueioAte = null;
    _fecharTelaPin();
    if (typeof showToast === 'function') {
      showToast('🔓 Acesso liberado');
    }
    if (_resolveDesbloqueio) {
      _resolveDesbloqueio(true);
      _resolveDesbloqueio = null;
    }
    _posDesbloqueio();
    console.log('[Security] PIN correto, acesso liberado');
  } else {
    _tentativasRestantes--;
    const mensagem = `PIN incorreto! Tentativas restantes: ${_tentativasRestantes}`;
    _mostrarMensagemPin(mensagem, '#ef4444');
    _resetarPinInput();
    console.log('[Security] PIN incorreto, tentativas restantes:', _tentativasRestantes);
    
    if (_tentativasRestantes <= 0) {
      _bloqueioAte = Date.now() + (PIN_BLOQUEIO_MINUTOS * 60 * 1000);
      _appDesbloqueado = false;
      _fecharTelaPin();
      if (typeof showToast === 'function') {
        showToast(`🔒 Muitas tentativas! Aguarde ${PIN_BLOQUEIO_MINUTOS} minutos.`, true);
      }
      if (_resolveDesbloqueio) {
        _resolveDesbloqueio(false);
        _resolveDesbloqueio = null;
      }
      console.log('[Security] Bloqueado por muitas tentativas');
    }
  }
}

function _adicionarDigitoPin(digito) {
  if (_pinDigitado.length < 4) {
    _pinDigitado += digito;
    const bolinhas = '●'.repeat(_pinDigitado.length) + '○'.repeat(4 - _pinDigitado.length);
    const display = document.getElementById('pin-display');
    if (display) display.innerHTML = `<span>${bolinhas}</span>`;
    
    if (_pinDigitado.length === 4) {
      _verificarPinDigitado();
    }
  }
}

function _removerDigitoPin() {
  if (_pinDigitado.length > 0) {
    _pinDigitado = _pinDigitado.slice(0, -1);
    const bolinhas = '●'.repeat(_pinDigitado.length) + '○'.repeat(4 - _pinDigitado.length);
    const display = document.getElementById('pin-display');
    if (display) display.innerHTML = `<span>${bolinhas}</span>`;
  }
}

// ========== INTERFACE DA TELA DE PIN ==========

function _mostrarTelaPin(motivo = 'desbloqueio') {
  if (_telaPinAtiva) return;
  _telaPinAtiva = true;
  console.log('[Security] Mostrando tela de PIN, motivo:', motivo);
  
  let telaPin = document.getElementById('pin-screen');
  if (!telaPin) {
    telaPin = document.createElement('div');
    telaPin.id = 'pin-screen';
    telaPin.className = 'pin-overlay';
    telaPin.innerHTML = `
      <div class="pin-container">
        <div class="pin-icon">🔒</div>
        <div class="pin-titulo" id="pin-titulo">Acesso Protegido</div>
        <div class="pin-subtitulo" id="pin-subtitulo">Digite seu PIN</div>
        <div class="pin-display" id="pin-display"><span>○○○○</span></div>
        <div class="pin-teclado" id="pin-teclado">
          ${[1,2,3,4,5,6,7,8,9,0].map(n => `<button class="pin-tecla" data-num="${n}">${n}</button>`).join('')}
          <button class="pin-tecla pin-tecla-limpar" id="pin-limpar">⌫</button>
          <button class="pin-tecla pin-tecla-fechar" id="pin-fechar">✕</button>
        </div>
        <div class="pin-mensagem" id="pin-mensagem"></div>
        ${_pinHash ? '<button class="pin-esqueci" id="pin-esqueci">Esqueci o PIN</button>' : ''}
      </div>
    `;
    document.body.appendChild(telaPin);
  }
  
  telaPin.style.display = 'flex';
  const appContainer = document.getElementById('appContainer');
  if (appContainer) appContainer.setAttribute('aria-hidden', 'true');
  
  const tituloEl = document.getElementById('pin-titulo');
  if (tituloEl) {
    if (motivo === 'config') tituloEl.textContent = 'Configurar PIN';
    else if (motivo === 'inatividade') tituloEl.textContent = 'App Bloqueado';
    else tituloEl.textContent = 'Acesso Protegido';
  }
  
  _resetarPinInput();
  
  // Configurar eventos dos botões
  setTimeout(() => {
    document.querySelectorAll('.pin-tecla[data-num]').forEach(btn => {
      btn.onclick = () => _adicionarDigitoPin(btn.dataset.num);
    });
    const btnLimpar = document.getElementById('pin-limpar');
    if (btnLimpar) btnLimpar.onclick = () => _removerDigitoPin();
    
    const btnFechar = document.getElementById('pin-fechar');
    if (btnFechar) {
      btnFechar.onclick = () => {
        if (_resolveDesbloqueio) {
          _resolveDesbloqueio(false);
          _resolveDesbloqueio = null;
        }
        _fecharTelaPin();
      };
    }
    
    const btnEsqueci = document.getElementById('pin-esqueci');
    if (btnEsqueci) btnEsqueci.onclick = () => _resetarPinPorSeguranca();
  }, 10);
}

function _resetarPinPorSeguranca() {
  if (typeof confirmar === 'function') {
    confirmar({
      icone: '🆘',
      titulo: 'Esqueceu o PIN?',
      mensagem: 'Isso irá resetar TODOS os dados do app (lançamentos, cartões, etc.). Deseja continuar?',
      textoBotao: 'Resetar Tudo',
      perigo: true,
    }, () => {
      _pinHash = null;
      _salvarSeguranca();
      _appDesbloqueado = true;
      _tentativasRestantes = PIN_MAX_TENTATIVAS;
      _bloqueioAte = null;
      _fecharTelaPin();
      
      if (typeof resetAll === 'function') {
        resetAll();
      } else if (typeof showToast === 'function') {
        showToast('Dados resetados. Configure um novo PIN nas configurações.', true);
        setTimeout(() => location.reload(), 1500);
      }
    });
  } else {
    if (typeof showToast === 'function') {
      showToast('Recarregue a página e configure um novo PIN', true);
      setTimeout(() => location.reload(), 1500);
    }
  }
}

// ========== FUNÇÕES PÚBLICAS ==========

function isAppDesbloqueado() {
  return _appDesbloqueado || !_pinHash;
}

function isPinConfigurado() {
  return _pinHash !== null;
}

async function solicitarDesbloqueio(motivo = 'padrao') {
  console.log('[Security] solicitarDesbloqueio, PIN:', !!_pinHash, 'desbloqueado:', _appDesbloqueado);
  if (!_pinHash) return true;
  if (_appDesbloqueado) return true;
  if (_bloqueioAte && Date.now() < _bloqueioAte) {
    const restam = Math.ceil((_bloqueioAte - Date.now()) / 60000);
    if (typeof showToast === 'function') {
      showToast(`🔒 App bloqueado. Aguarde ${restam} minuto(s).`, true);
    }
    return false;
  }

  return new Promise((resolve) => {
    _resolveDesbloqueio = (result) => {
      resolve(result);
      _resolveDesbloqueio = null;
    };
    _mostrarTelaPin(motivo);
  });
}

function configurarPin() {
  console.log('[Security] configurarPin chamado');
  delete window._pinTemp;
  _mostrarTelaPin('config');
  _mostrarMensagemPin('Digite um PIN de 4 dígitos', '#f59e0b');
}

function removerPin() {
  if (!_pinHash) {
    if (typeof showToast === 'function') showToast('Nenhum PIN configurado', true);
    return;
  }
  if (typeof perguntarTexto === 'function') {
    perguntarTexto({
      icone: '⚠️',
      titulo: 'Remover PIN',
      label: 'Digite seu PIN atual',
      textoBotao: 'Remover',
      perigo: true,
    }, pin => {
      if (_verificarPin(pin, _pinHash)) {
        _pinHash = null;
        _appDesbloqueado = true;
        window._pinHash = null;
        window._appDesbloqueado = true;
        _salvarSeguranca();
        _fecharTelaPin();
        if (typeof showToast === 'function') showToast('✅ PIN removido com sucesso!');
        const modal = document.getElementById('modal-seguranca');
        if (modal) modal.style.display = 'none';
      } else {
        if (typeof showToast === 'function') showToast('PIN incorreto!', true);
      }
    });
  } else {
    if (typeof showToast === 'function') showToast('Função não disponível', true);
  }
}

function toggleOcultarSaldo() {
  _saldoOculto = !_saldoOculto;
  _salvarSeguranca();
  const msg = _saldoOculto ? '💰 Valores ocultados' : '💰 Valores visíveis';
  if (typeof showToast === 'function') showToast(msg);
  if (typeof atualizarDashboard === 'function') {
    atualizarDashboard();
  }
}

function isSaldoOculto() {
  return _saldoOculto;
}

function formatarComOcultacao(valor, formatoOriginal = null) {
  if (_saldoOculto) {
    return '••••••';
  }
  return formatoOriginal || (typeof formatMoney === 'function' ? formatMoney(valor) : `R$ ${valor.toFixed(2)}`);
}

function initSecurity() {
  console.log('[Security] initSecurity chamado');
  _carregarSeguranca();
  _appDesbloqueado = !_pinHash;
  // Expõe estado no window para que outros módulos possam ler
  window._pinHash = _pinHash;
  window._appDesbloqueado = _appDesbloqueado;
  console.log('[Security] initSecurity finalizado, desbloqueado:', _appDesbloqueado);
}

/**
 * Executado após cada desbloqueio bem-sucedido.
 * Garante que o dashboard re-renderize com os dados visíveis.
 * @private
 */
function _posDesbloqueio() {
  setTimeout(() => {
    if (typeof invalidarCacheLancamentos === 'function') invalidarCacheLancamentos();
    if (typeof renderTudo === 'function') renderTudo();
    if (typeof forcarAtualizacaoDashboard === 'function') forcarAtualizacaoDashboard();
  }, 80);
}

// ========== EXPORTAÇÃO ==========
window.configurarPin = configurarPin;
window.removerPin = removerPin;
window.toggleOcultarSaldo = toggleOcultarSaldo;
window.isSaldoOculto = isSaldoOculto;
window.solicitarDesbloqueio = solicitarDesbloqueio;
window.isAppDesbloqueado = isAppDesbloqueado;
window.isPinConfigurado = isPinConfigurado;
window.initSecurity = initSecurity;

console.log('[Security] Módulo carregado com sucesso!');