// =============================================================================
// utils.js — Funções auxiliares e utilitários gerais
// =============================================================================

// ---------- Geração de ID único ----------

/**
 * Gera um ID único com prefixo opcional.
 * Usa crypto.randomUUID quando disponível; fallback com Date + random.
 * @param {string} [prefixo='']
 * @returns {string}
 */
function gerarId(prefixo = '') {
  const uuid = crypto.randomUUID
    ? crypto.randomUUID()
    : 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  return prefixo ? `${prefixo}_${uuid}` : uuid;
}

// ---------- Datas ----------

/**
 * Retorna a data de hoje no formato YYYY-MM-DD sem conversão de fuso.
 * @returns {string}
 */
function hojeLocal() {
  const h = new Date();
  const ano = h.getFullYear();
  const mes = String(h.getMonth() + 1).padStart(2, '0');
  const dia = String(h.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

/**
 * Formata um objeto Date como YYYY-MM-DD no horário local.
 * @param {Date} d
 * @returns {string}
 */
function formatarDataLocal(d) {
  if (!(d instanceof Date) || isNaN(d)) return '';
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

/**
 * Converte string YYYY-MM-DD em Date no horário local (sem UTC shift).
 * @param {string} s — formato "YYYY-MM-DD"
 * @returns {Date}
 */
function parseLocalDate(s) {
  if (!s) return new Date();
  const [ano, mes, dia] = s.split('-').map(Number);
  return new Date(ano, mes - 1, dia);
}

/**
 * Retorna o último dia do mês informado.
 * @param {number} ano
 * @param {number} mes (0 = Janeiro)
 * @returns {number}
 */
function getUltimoDiaMes(ano, mes) {
  return new Date(ano, mes + 1, 0).getDate();
}

/**
 * Ajusta um dia desejado para o último dia do mês se necessário.
 * Útil para recorrências com dia 31 em meses de 30 dias.
 * @param {number} ano
 * @param {number} mes (0 = Janeiro)
 * @param {number} diaDesejado
 * @returns {number}
 */
function ajustarDiaParaUltimoDiaDoMes(ano, mes, diaDesejado) {
  const ultimoDia = getUltimoDiaMes(ano, mes);
  return Math.min(diaDesejado, ultimoDia);
}

/**
 * Formata uma data para exibição amigável (ex: "20 mai")
 * @param {Date|string} data
 * @returns {string}
 */
function formatarDataAmigavel(data) {
  let d = data;
  if (typeof data === 'string') {
    d = parseLocalDate(data);
  }
  return d.toLocaleDateString('pt-BR', { 
    day: '2-digit', 
    month: 'short',
    timeZone: 'America/Sao_Paulo'
  });
}

// ---------- Formatação de moeda ----------

/**
 * Formata dígitos brutos no padrão BRL (sem prefixo R$).
 * Trata a string como centavos da direita para a esquerda.
 * Ex: "5" → "0,05" | "150" → "1,50" | "123456" → "1.234,56"
 * @param {string|number} v
 * @returns {string}
 */
function formatBRL(v) {
  const digits = v.toString().replace(/\D/g, '');
  if (!digits) return '0,00';
  
  const num = parseInt(digits, 10);
  const reais = Math.floor(num / 100);
  const cents = num % 100;
  
  const reaisStr = reais.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
  
  return `${reaisStr},${String(cents).padStart(2, '0')}`;
}

/**
 * Converte um número float (reais) para o formato que o input monetário espera.
 * Exemplo: 3700.00 → "370000" → formatBRL → "3.700,00"
 * Usar sempre que preencher um .money-input com um valor existente.
 * @param {number} valor — valor em reais (ex: 3700.50)
 * @returns {string} string de centavos para passar ao formatBRL
 */
function valorParaInput(valor) {
  return String(Math.round(Math.abs(valor) * 100));
}

/**
 * Converte string no formato BRL ("1.234,56") para number (1234.56).
 * Suporta tanto formato brasileiro quanto americano como fallback.
 * @param {string} v
 * @returns {number}
 */
function currencyToNumber(v) {
  if (!v) return 0;
  
  let cleaned = v.toString().trim();
  
  if (cleaned.includes(',')) {
    cleaned = cleaned.replace(/\./g, '');
    cleaned = cleaned.replace(',', '.');
  }
  
  const number = parseFloat(cleaned);
  return isNaN(number) ? 0 : number;
}

/**
 * Formata um number como moeda BRL completa.
 * Ex: 1234.56 → "R$ 1.234,56" | -50 → "R$ -50,00"
 * @param {number} v
 * @returns {string}
 */
function formatMoney(v) {
  if (v < 0) {
    return `R$ ${Math.abs(v).toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  }
  return `R$ ${v.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

// ---------- DOM / UI ----------

/**
 * Escapa HTML para evitar XSS ao inserir strings dinâmicas no DOM.
 * @param {string} s
 * @returns {string}
 */
function escapeHtml(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

/**
 * Exibe um toast de notificação temporário.
 * @param {string} mensagem
 * @param {boolean} [erro=false] Se true, exibe em vermelho.
 */
function showToast(mensagem, erro = false) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = mensagem;
  t.style.background = erro ? 'var(--danger)' : 'var(--success)';
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

/**
 * Inicializa inputs com a classe `.money-input` para digitação
 * monetária da direita para a esquerda no padrão BRL.
 *
 * Comportamento:
 * - Ao focar: cursor vai instantaneamente para o final
 * - Ao digitar: acumula apenas dígitos, reformata e mantém cursor no final
 * - Ao colar: trata o conteúdo colado como dígitos brutos
 * - Backspace: remove o último dígito (efeito de "apagar da direita")
 */
function setupMoneyInputs() {
  document.querySelectorAll('.money-input').forEach(input => {
    // ── Reset de valor: sempre que setupMoneyInputs é chamado ──────────────
    // Lê o value atual do DOM (geralmente '0,00' após abrir o modal)
    // e sincroniza _digits com ele, limpando qualquer valor anterior.
    const rawValue = input.value.replace(/\D/g, '') || '0';
    input._digits = rawValue;
    input.value = formatBRL(rawValue);

    // ── Setup de listeners: apenas uma vez por elemento ────────────────────
    if (input.dataset.moneyInit) return;
    input.dataset.moneyInit = '1';

    function cursorFinal() {
      setTimeout(() => {
        try { 
          input.setSelectionRange(input.value.length, input.value.length); 
        } catch(e) {}
      }, 0);
    }

    input.addEventListener('focus',    cursorFinal);
    input.addEventListener('click',    cursorFinal);
    input.addEventListener('mouseup',  cursorFinal);
    input.addEventListener('touchend', cursorFinal);

    input.addEventListener('keydown', function(e) {
      if (e.ctrlKey || e.metaKey || e.key === 'Tab' ||
          e.key === 'Enter' || e.key === 'Escape') return;

      if (!/^\d$/.test(e.key) && e.key !== 'Backspace' && e.key !== 'Delete') {
        e.preventDefault();
        return;
      }

      e.preventDefault();

      if (e.key === 'Backspace' || e.key === 'Delete') {
        this._digits = this._digits.length > 1 ? this._digits.slice(0, -1) : '0';
      } else {
        if (this._digits === '0') this._digits = e.key;
        else if (this._digits.length < 13) this._digits += e.key;
      }

      this.value = formatBRL(this._digits);
      cursorFinal();
    });

    input.addEventListener('beforeinput', function(e) {
      e.preventDefault();

      if (e.inputType === 'deleteContentBackward' || e.inputType === 'deleteContentForward') {
        this._digits = this._digits.length > 1 ? this._digits.slice(0, -1) : '0';
      } else if (e.data) {
        const digito = e.data.replace(/\D/g, '');
        if (!digito) return;
        if (this._digits === '0') this._digits = digito;
        else if (this._digits.length < 13) this._digits += digito;
      }

      this.value = formatBRL(this._digits);
      cursorFinal();
    });

    input.addEventListener('paste', function(e) {
      e.preventDefault();
      const colado = (e.clipboardData || window.clipboardData).getData('text');
      const novos = colado.replace(/\D/g, '');
      if (!novos) return;
      const base = this._digits === '0' ? '' : this._digits;
      this._digits = (base + novos).slice(0, 13) || '0';
      this.value = formatBRL(this._digits);
      cursorFinal();
    });
  });
}

/**
 * Fecha um modal pelo seu ID.
 * @param {string} id
 */
function fecharModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('modal-open');
  el.style.display = 'none';

  const algumAberto = ['modal-transacao','modal-cartao','modal-compra','modal-config',
    'modal-meta','modal-pagamento','modal-orcamento']
    .some(mid => { const m = document.getElementById(mid); return m && m.style.display !== 'none'; });
  if (!algumAberto) document.getElementById('appContainer')?.removeAttribute('aria-hidden');

  if (el._focoAnterior?.focus) { el._focoAnterior.focus(); el._focoAnterior = null; }
}