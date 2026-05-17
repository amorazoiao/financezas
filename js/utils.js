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
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`;
}

/**
 * Formata um objeto Date como YYYY-MM-DD sem conversão de fuso.
 * @param {Date} d
 * @returns {string}
 */
function formatarDataLocal(d) {
  if (!(d instanceof Date) || isNaN(d)) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Converte string YYYY-MM-DD em Date local (sem UTC shift).
 * @param {string} s
 * @returns {Date}
 */
function parseLocalDate(s) {
  const [a, m, d] = s.split('-').map(Number);
  return new Date(a, m - 1, d);
}

/**
 * Retorna o último dia do mês informado.
 * @param {number} ano
 * @param {number} mes  (0 = Janeiro)
 * @returns {number}
 */
function getUltimoDiaMes(ano, mes) {
  return new Date(ano, mes + 1, 0).getDate();
}

// ---------- Formatação de moeda ----------

/**
 * Formata dígitos brutos no padrão BRL (sem prefixo R$).
 * Trata a string como centavos da direita para a esquerda.
 * Ex: "5"→"0,05" | "150"→"1,50" | "123456"→"1.234,56"
 * @param {string|number} v
 * @returns {string}
 */
function formatBRL(v) {
  const digits = v.toString().replace(/\D/g, '');
  if (!digits) return '0,00';
  const num      = parseInt(digits, 10);
  const reais    = Math.floor(num / 100);
  const cents    = num % 100;
  const reaisStr = reais.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${reaisStr},${String(cents).padStart(2, '0')}`;
}

/**
 * Converte string no formato BRL ("1.234,56") para number (1234.56).
 * @param {string} v
 * @returns {number}
 */
function currencyToNumber(v) {
  if (!v) return 0;
  return Number(v.toString().replace(/\./g, '').replace(',', '.'));
}

/**
 * Formata um number como moeda BRL completa.
 * Ex: 1234.56 → "R$ 1.234,56" | -50 → "R$ -50,00"
 * @param {number} v
 * @returns {string}
 */
function formatMoney(v) {
  if (v < 0) return `R$ -${Math.abs(v).toFixed(2).replace('.', ',')}`;
  return `R$ ${Math.abs(v).toFixed(2).replace('.', ',')}`;
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
 * @param {boolean} [erro=false]  Se true, exibe em vermelho.
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
 * - Ao focar: cursor vai instantaneamente para o final (imperceptível ao usuário)
 * - Ao digitar: acumula apenas dígitos, reformata e mantém cursor no final
 * - Ao colar: trata o conteúdo colado como dígitos brutos
 * - Backspace: remove o último dígito (efeito de "apagar da direita")
 */
function setupMoneyInputs() {
  document.querySelectorAll('.money-input').forEach(input => {
    if (input.dataset.moneyInit) return;
    input.dataset.moneyInit = '1';

    // Garante valor inicial formatado
    input.value = (!input.value || input.value === '0,00') ? '0,00' : formatBRL(input.value);

    // Força cursor para o final — precisa de setTimeout porque o browser
    // reposiciona o cursor DEPOIS do evento focus/click terminar
    function fixarCursor() {
      const el = this;
      setTimeout(() => {
        const len = el.value.length;
        el.setSelectionRange(len, len);
      }, 0);
    }

    input.addEventListener('focus',    fixarCursor);
    input.addEventListener('click',    fixarCursor);
    input.addEventListener('mouseup',  fixarCursor);  // impede seleção por arraste
    input.addEventListener('touchend', fixarCursor);  // mobile

    // Digitação: só processa dígitos e backspace, bloqueia todo o resto
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Tab' || e.key === 'Enter' || e.key === 'Escape' ||
          e.ctrlKey || e.metaKey) return;

      e.preventDefault();

      const digits = this.value.replace(/\D/g, '');

      if (e.key === 'Backspace' || e.key === 'Delete') {
        this.value = formatBRL(digits.slice(0, -1)) || '0,00';
      } else if (/^\d$/.test(e.key)) {
        if (digits.length >= 13) return;
        this.value = formatBRL(digits + e.key);
      }

      const len = this.value.length;
      this.setSelectionRange(len, len);
    });

    // Paste: extrai dígitos e reformata
    input.addEventListener('paste', function (e) {
      e.preventDefault();
      const colado = (e.clipboardData || window.clipboardData).getData('text');
      const digits = this.value.replace(/\D/g, '') + colado.replace(/\D/g, '');
      this.value   = formatBRL(digits.slice(0, 13));
      const len    = this.value.length;
      this.setSelectionRange(len, len);
    });
  });
}

/**
 * Fecha um modal pelo seu ID.
 * @param {string} id
 */
function fecharModal(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}
