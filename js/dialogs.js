// =============================================================================
// dialogs.js — Sistema de diálogos próprios (substitui prompt e confirm nativos)
// =============================================================================
// Sem dependências externas. Deve ser carregado antes dos demais módulos JS.
//
// API pública:
//   confirmar({ titulo, mensagem, textoBotao?, perigo? }, onConfirm)
//   perguntarTexto({ titulo, label, valorInicial?, placeholder? }, onConfirm)
//   perguntarValor({ titulo, label, valorInicial?, info? }, onConfirm)
//   perguntarForm({ titulo, campos[] }, onConfirm)
// =============================================================================

// ---------- Injeção de HTML e CSS dos diálogos ----------

(function injetarDialogsUI() {
  // CSS inline para não depender de main.css durante o boot
  const style = document.createElement('style');
  style.textContent = `
    #dlg-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,.45);
      z-index: 9999;
      align-items: center;
      justify-content: center;
      padding: 16px;
      animation: dlgFadeIn .15s ease;
    }
    #dlg-overlay.open { display: flex; }
    @keyframes dlgFadeIn { from { opacity:0 } to { opacity:1 } }

    #dlg-box {
      background: white;
      border-radius: 20px;
      width: 100%;
      max-width: 380px;
      box-shadow: 0 20px 60px rgba(0,0,0,.25);
      overflow: hidden;
      animation: dlgSlideUp .2s ease;
    }
    @keyframes dlgSlideUp { from { transform:translateY(24px); opacity:0 } to { transform:translateY(0); opacity:1 } }

    body.dark #dlg-box { background: #1e1e2e; color: #e2e8f0; }

    #dlg-header {
      padding: 20px 20px 0;
    }
    #dlg-icon   { font-size: 2rem; margin-bottom: 6px; }
    #dlg-titulo {
      font-size: 1.1rem;
      font-weight: 700;
      color: #1e293b;
      margin: 0 0 4px;
    }
    body.dark #dlg-titulo { color: #f1f5f9; }

    #dlg-mensagem {
      font-size: .9rem;
      color: #64748b;
      margin: 0;
      line-height: 1.5;
    }
    body.dark #dlg-mensagem { color: #94a3b8; }

    #dlg-body { padding: 16px 20px; }

    .dlg-label {
      display: block;
      font-size: .8rem;
      font-weight: 600;
      color: #475569;
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: .04em;
    }
    body.dark .dlg-label { color: #94a3b8; }

    .dlg-input {
      width: 100%;
      padding: 12px 14px;
      border: 2px solid #e2e8f0;
      border-radius: 12px;
      font-size: 1rem;
      color: #1e293b;
      background: #f8fafc;
      box-sizing: border-box;
      transition: border-color .2s;
      outline: none;
    }
    .dlg-input:focus { border-color: #6366f1; background: white; }
    body.dark .dlg-input { background: #2d2d44; border-color: #3d3d5c; color: #f1f5f9; }
    body.dark .dlg-input:focus { border-color: #818cf8; }

    .dlg-money-wrap {
      display: flex;
      align-items: center;
      border: 2px solid #e2e8f0;
      border-radius: 12px;
      background: #f8fafc;
      overflow: hidden;
      transition: border-color .2s;
    }
    .dlg-money-wrap:focus-within { border-color: #6366f1; background: white; }
    body.dark .dlg-money-wrap { background: #2d2d44; border-color: #3d3d5c; }
    body.dark .dlg-money-wrap:focus-within { border-color: #818cf8; }

    .dlg-money-prefix {
      padding: 0 10px 0 14px;
      font-weight: 600;
      color: #64748b;
      font-size: 1rem;
      user-select: none;
    }
    body.dark .dlg-money-prefix { color: #94a3b8; }

    .dlg-money-input {
      flex: 1;
      border: none;
      background: transparent;
      padding: 12px 14px 12px 0;
      font-size: 1rem;
      color: #1e293b;
      outline: none;
    }
    body.dark .dlg-money-input { color: #f1f5f9; }

    .dlg-info {
      margin-top: 10px;
      padding: 10px 14px;
      background: #f1f5f9;
      border-radius: 10px;
      font-size: .85rem;
      color: #475569;
      line-height: 1.5;
    }
    body.dark .dlg-info { background: #2d2d44; color: #94a3b8; }

    .dlg-form-row { margin-bottom: 14px; }
    .dlg-form-row:last-child { margin-bottom: 0; }

    #dlg-footer {
      display: flex;
      gap: 10px;
      padding: 0 20px 20px;
    }
    .dlg-btn {
      flex: 1;
      padding: 13px;
      border: none;
      border-radius: 12px;
      font-size: .95rem;
      font-weight: 600;
      cursor: pointer;
      transition: opacity .15s, transform .1s;
    }
    .dlg-btn:active { transform: scale(.97); }
    .dlg-btn-cancel  { background: #f1f5f9; color: #475569; }
    .dlg-btn-confirm { background: #6366f1; color: white; }
    .dlg-btn-danger  { background: #ef4444; color: white; }
    body.dark .dlg-btn-cancel { background: #2d2d44; color: #94a3b8; }
  `;
  document.head.appendChild(style);

  // Estrutura HTML do overlay
  const overlay = document.createElement('div');
  overlay.id = 'dlg-overlay';
  overlay.innerHTML = `
    <div id="dlg-box" role="dialog" aria-modal="true">
      <div id="dlg-header">
        <div id="dlg-icon"></div>
        <p id="dlg-titulo"></p>
        <p id="dlg-mensagem"></p>
      </div>
      <div id="dlg-body"></div>
      <div id="dlg-footer">
        <button class="dlg-btn dlg-btn-cancel" id="dlg-btn-cancel">Cancelar</button>
        <button class="dlg-btn dlg-btn-confirm" id="dlg-btn-confirm">Confirmar</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  // Fecha ao clicar fora da caixa
  overlay.addEventListener('click', e => { if (e.target === overlay) _fecharDialog(); });

  // Impede que cliques no overlay (mas fora da caixa) borbulhem para o window
  overlay.addEventListener('click', e => e.stopPropagation());

  // Fecha com Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) _fecharDialog();
  });
})();

// ---------- Estado interno ----------

let _dlgCallback = null;   // função chamada ao confirmar
let _dlgTipo     = null;   // 'confirm' | 'texto' | 'valor' | 'form'

// ---------- Helpers internos ----------

function _abrirDialog() {
  document.getElementById('dlg-overlay').classList.add('open');
  // Foca o primeiro input se existir, senão o botão de confirmar
  setTimeout(() => {
    const input = document.querySelector('#dlg-body input');
    if (input) input.focus();
    else document.getElementById('dlg-btn-confirm').focus();
  }, 220);
}

function _fecharDialog() {
  document.getElementById('dlg-overlay').classList.remove('open');
  _dlgCallback = null;
  _dlgTipo     = null;
}

function _configurarHeader({ icone = '', titulo, mensagem = '' }) {
  document.getElementById('dlg-icon').textContent    = icone;
  document.getElementById('dlg-titulo').textContent  = titulo;
  document.getElementById('dlg-mensagem').textContent = mensagem;
}

function _configurarBotoes({ textoCancelar = 'Cancelar', textoConfirmar = 'Confirmar', perigo = false }) {
  const btnCancel  = document.getElementById('dlg-btn-cancel');
  const btnConfirm = document.getElementById('dlg-btn-confirm');

  btnCancel.textContent  = textoCancelar;
  btnConfirm.textContent = textoConfirmar;
  btnConfirm.className   = `dlg-btn ${perigo ? 'dlg-btn-danger' : 'dlg-btn-confirm'}`;

  // Remove listeners antigos clonando e substituindo
  const novoCancel = btnCancel.cloneNode(true);
  const novoConfirm = btnConfirm.cloneNode(true);
  btnCancel.parentNode.replaceChild(novoCancel, btnCancel);
  btnConfirm.parentNode.replaceChild(novoConfirm, btnConfirm);

  // Adiciona novos listeners
  novoCancel.addEventListener('click', (e) => {
    e.stopPropagation();
    _fecharDialog();
  });
  
  novoConfirm.addEventListener('click', (e) => {
    e.stopPropagation();
    _executarCallback();
  });
}

function _executarCallback() {
  // 🔥 CORREÇÃO: Verifica se o callback existe e é uma função
  if (!_dlgCallback) {
    console.warn('[dialogs] _executarCallback chamado sem callback');
    _fecharDialog();
    return;
  }
  
  if (typeof _dlgCallback !== 'function') {
    console.error('[dialogs] _dlgCallback não é uma função:', _dlgCallback);
    _fecharDialog();
    return;
  }

  if (_dlgTipo === 'confirm') {
    const callback = _dlgCallback;
    _fecharDialog();
    callback();
    return;
  }

  if (_dlgTipo === 'texto') {
    const input = document.getElementById('dlg-input-texto');
    const valor = input?.value.trim();
    if (!valor) { 
      _shakeInput(input); 
      return; 
    }
    const callback = _dlgCallback;
    _fecharDialog();
    callback(valor);
    return;
  }

  if (_dlgTipo === 'valor') {
    const input  = document.getElementById('dlg-input-valor');
    const numero = currencyToNumber(input?.value);
    if (!numero || numero <= 0) { 
      _shakeInput(input); 
      return; 
    }
    const callback = _dlgCallback;
    _fecharDialog();
    callback(numero);
    return;
  }

  if (_dlgTipo === 'form') {
    const resultado = {};
    let invalido = false;
    document.querySelectorAll('#dlg-body [data-campo]').forEach(el => {
      const campo = el.dataset.campo;
      const valor = el.value?.trim();
      if (el.required && !valor) { 
        _shakeInput(el); 
        invalido = true; 
        return; 
      }
      resultado[campo] = valor;
    });
    if (invalido) return;
    const callback = _dlgCallback;
    _fecharDialog();
    callback(resultado);
  }
}

function _shakeInput(el) {
  if (!el) return;
  el.style.borderColor = '#ef4444';
  el.animate([
    { transform: 'translateX(-4px)' },
    { transform: 'translateX(4px)' },
    { transform: 'translateX(-4px)' },
    { transform: 'translateX(0)' },
  ], { duration: 300 });
  el.addEventListener('input', () => { el.style.borderColor = ''; }, { once: true });
}

// Suporte a Enter para confirmar
document.getElementById('dlg-overlay').addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') {
    e.preventDefault();
    _executarCallback();
  }
});

// ---------- API pública ----------

/**
 * Exibe um modal de confirmação simples (substitui `confirm()`).
 *
 * @param {Object}   opcoes
 * @param {string}   opcoes.titulo           — Texto principal em negrito
 * @param {string}   [opcoes.mensagem]       — Texto secundário explicativo
 * @param {string}   [opcoes.icone]          — Emoji decorativo
 * @param {string}   [opcoes.textoBotao]     — Rótulo do botão de confirmar (padrão: "Confirmar")
 * @param {boolean}  [opcoes.perigo=false]   — Botão vermelho quando true
 * @param {Function} onConfirm               — Callback chamado se o usuário confirmar
 *
 * @example
 * confirmar({ titulo: 'Excluir transação?', perigo: true }, () => {
 *   lancamentos = lancamentos.filter(l => l.id !== id);
 *   salvarTudo();
 * });
 */
function confirmar({ titulo, mensagem = '', icone = '⚠️', textoBotao = 'Confirmar', perigo = false }, onConfirm) {
  // 🔥 CORREÇÃO: Valida se onConfirm é uma função
  if (typeof onConfirm !== 'function') {
    console.error('[dialogs] confirmar: onConfirm não é uma função', onConfirm);
    return;
  }
  
  _dlgTipo     = 'confirm';
  _dlgCallback = onConfirm;

  _configurarHeader({ icone, titulo, mensagem });
  document.getElementById('dlg-body').innerHTML = '';
  _configurarBotoes({ textoConfirmar: textoBotao, perigo });
  _abrirDialog();
}

/**
 * Exibe um modal com campo de texto livre (substitui `prompt()` de texto).
 *
 * @param {Object}   opcoes
 * @param {string}   opcoes.titulo
 * @param {string}   [opcoes.label]         — Label acima do input
 * @param {string}   [opcoes.valorInicial]  — Valor pré-preenchido
 * @param {string}   [opcoes.placeholder]
 * @param {string}   [opcoes.icone]
 * @param {string}   [opcoes.textoBotao]
 * @param {Function} onConfirm              — Recebe o valor digitado (string)
 *
 * @example
 * perguntarTexto({ titulo: 'Nome da recorrência', valorInicial: rec.descricao }, novoNome => {
 *   rec.descricao = novoNome;
 *   salvarTudo();
 * });
 */
function perguntarTexto({ titulo, label = '', valorInicial = '', placeholder = '', icone = '✏️', textoBotao = 'Salvar' }, onConfirm) {
  // 🔥 CORREÇÃO: Valida se onConfirm é uma função
  if (typeof onConfirm !== 'function') {
    console.error('[dialogs] perguntarTexto: onConfirm não é uma função', onConfirm);
    return;
  }
  
  _dlgTipo     = 'texto';
  _dlgCallback = onConfirm;

  _configurarHeader({ icone, titulo });
  document.getElementById('dlg-body').innerHTML = `
    ${label ? `<label class="dlg-label" for="dlg-input-texto">${label}</label>` : ''}
    <input class="dlg-input" id="dlg-input-texto"
           type="text" value="${escapeHtml(valorInicial)}"
           placeholder="${escapeHtml(placeholder)}" autocomplete="off">`;
  _configurarBotoes({ textoConfirmar: textoBotao });
  _abrirDialog();
}

/**
 * Exibe um modal com campo monetário (substitui `prompt()` de valor numérico).
 *
 * @param {Object}   opcoes
 * @param {string}   opcoes.titulo
 * @param {string}   [opcoes.label]
 * @param {number}   [opcoes.valorInicial=0]
 * @param {string}   [opcoes.info]           — Texto informativo abaixo do campo
 * @param {string}   [opcoes.icone]
 * @param {string}   [opcoes.textoBotao]
 * @param {Function} onConfirm               — Recebe o valor numérico (number)
 *
 * @example
 * perguntarValor({ titulo: 'Adicionar à reserva', valorInicial: 0, info: `Saldo: ${formatMoney(saldo)}` }, valor => {
 *   // usar valor
 * });
 */
function perguntarValor({ titulo, label = 'Valor', valorInicial = 0, info = '', icone = '💰', textoBotao = 'Confirmar' }, onConfirm) {
  // 🔥 CORREÇÃO: Valida se onConfirm é uma função
  if (typeof onConfirm !== 'function') {
    console.error('[dialogs] perguntarValor: onConfirm não é uma função', onConfirm);
    return;
  }
  
  _dlgTipo     = 'valor';
  _dlgCallback = onConfirm;

  const valorFormatado = formatBRL((valorInicial * 100).toFixed(0));
  _configurarHeader({ icone, titulo });
  document.getElementById('dlg-body').innerHTML = `
    <label class="dlg-label" for="dlg-input-valor">${label}</label>
    <div class="dlg-money-wrap">
      <span class="dlg-money-prefix">R$</span>
      <input class="dlg-money-input money-input" id="dlg-input-valor"
             type="text" value="${valorFormatado}" autocomplete="off">
    </div>
    ${info ? `<div class="dlg-info">${info}</div>` : ''}`;

  // Ativa formatação BRL no novo input e posiciona cursor no final
  setTimeout(() => {
    const el = document.getElementById('dlg-input-valor');
    if (!el) return;
    el.dataset.moneyInit = '';   // força re-inicialização pelo setupMoneyInputs
    if (typeof setupMoneyInputs === 'function') setupMoneyInputs();
    el.focus();
    const len = el.value.length;
    el.setSelectionRange(len, len);
  }, 220);

  _configurarBotoes({ textoConfirmar: textoBotao });
  _abrirDialog();
}

/**
 * Exibe um modal com múltiplos campos de formulário.
 *
 * @param {Object}   opcoes
 * @param {string}   opcoes.titulo
 * @param {string}   [opcoes.icone]
 * @param {string}   [opcoes.textoBotao]
 * @param {Array}    opcoes.campos  — Lista de { campo, label, tipo?, valorInicial?, placeholder?, required? }
 * @param {Function} onConfirm     — Recebe objeto { [campo]: valor }
 *
 * @example
 * perguntarForm({
 *   titulo: 'Editar recorrência',
 *   campos: [
 *     { campo: 'nome',  label: 'Nome',  valorInicial: rec.descricao },
 *     { campo: 'valor', label: 'Valor', tipo: 'money', valorInicial: Math.abs(rec.valor) },
 *   ]
 * }, ({ nome, valor }) => { ... });
 */
function perguntarForm({ titulo, icone = '✏️', textoBotao = 'Salvar', campos = [] }, onConfirm) {
  // 🔥 CORREÇÃO: Valida se onConfirm é uma função
  if (typeof onConfirm !== 'function') {
    console.error('[dialogs] perguntarForm: onConfirm não é uma função', onConfirm);
    return;
  }
  
  _dlgTipo     = 'form';
  _dlgCallback = onConfirm;

  _configurarHeader({ icone, titulo });

  const linhas = campos.map(f => {
    const id  = `dlg-field-${f.campo}`;
    const req = f.required !== false ? 'required' : '';

    if (f.tipo === 'money') {
      const vf = formatBRL(((f.valorInicial || 0) * 100).toFixed(0));
      return `
        <div class="dlg-form-row">
          <label class="dlg-label" for="${id}">${f.label}</label>
          <div class="dlg-money-wrap">
            <span class="dlg-money-prefix">R$</span>
            <input class="dlg-money-input money-input" id="${id}"
                   data-campo="${f.campo}" type="text" value="${vf}" ${req} autocomplete="off">
          </div>
        </div>`;
    }

    if (f.tipo === 'number') {
      return `
        <div class="dlg-form-row">
          <label class="dlg-label" for="${id}">${f.label}</label>
          <input class="dlg-input" id="${id}" data-campo="${f.campo}"
                 type="number" value="${f.valorInicial ?? ''}"
                 min="${f.min ?? ''}" max="${f.max ?? ''}"
                 placeholder="${f.placeholder ?? ''}" ${req}>
        </div>`;
    }

    return `
      <div class="dlg-form-row">
        <label class="dlg-label" for="${id}">${f.label}</label>
        <input class="dlg-input" id="${id}" data-campo="${f.campo}"
               type="text" value="${escapeHtml(f.valorInicial ?? '')}"
               placeholder="${escapeHtml(f.placeholder ?? '')}" ${req} autocomplete="off">
      </div>`;
  });

  document.getElementById('dlg-body').innerHTML = linhas.join('');

  // Ativa formatação BRL em inputs de money e foca o primeiro campo
  setTimeout(() => {
    document.querySelectorAll('#dlg-body .money-input').forEach(el => {
      el.dataset.moneyInit = '';   // força re-inicialização
    });
    if (typeof setupMoneyInputs === 'function') setupMoneyInputs();
    const primeiro = document.querySelector('#dlg-body input');
    if (primeiro) {
      primeiro.focus();
      const len = primeiro.value.length;
      primeiro.setSelectionRange(len, len);
    }
  }, 220);

  _configurarBotoes({ textoConfirmar: textoBotao });
  _abrirDialog();
}