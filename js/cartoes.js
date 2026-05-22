// =============================================================================
// cartoes.js — Cartões de crédito, faturas, compras parceladas e pagamentos
// =============================================================================
// Depende de: utils.js, storage.js, dialogs.js
// =============================================================================

/**
 * Cores cíclicas para os cards de cartão no carrossel.
 * @constant {string[]}
 */
const CORES_CARTAO = ['card-purple', 'card-black', 'card-gold', 'card-blue'];

// ---------- Validações ----------

/**
 * Valida se as datas de fechamento e vencimento do cartão são consistentes.
 * O fechamento deve ser ANTES do vencimento.
 * @param {number} fechamento - Dia do fechamento (1-31)
 * @param {number} vencimento - Dia do vencimento (1-31)
 * @returns {boolean} - true se válido, false caso contrário
 */
function validarDatasCartao(fechamento, vencimento) {
  if (fechamento >= vencimento) {
    showToast('⚠️ O fechamento deve ser ANTES do vencimento', true);
    return false;
  }
  return true;
}

// ---------- Carrossel de cartões ----------

/**
 * Renderiza o carrossel de cartões na aba Cartões.
 */
function renderCartoesCarrossel() {
  const container = document.getElementById('cartoes-carrossel');
  if (!container) return;

  if (cartoes.length === 0) {
    container.innerHTML = `
      <div style="min-width:100%;text-align:center;padding:var(--space-4xl);color:var(--gray-400);">
        <div style="font-size:var(--font-5xl);">💳</div>
        <div style="font-size:var(--font-base);">Nenhum cartão cadastrado</div>
      </div>`;
    return;
  }

  container.innerHTML = '';

  cartoes.forEach((cartao, index) => {
    const usado = getTotalUtilizadoCartao(cartao.id);
    const disponivel = Math.max(0, cartao.limite - usado);
    const corClasse = CORES_CARTAO[index % CORES_CARTAO.length];
    const selecionado = currentCartaoId === cartao.id ? 'selected' : '';

    container.innerHTML += `
      <div class="cartao-bank-card ${corClasse} ${selecionado}"
           onclick="selecionarCartao('${cartao.id}')"
           id="cartao-card-${cartao.id}">
        <div class="cartao-bank-header">
          <span class="cartao-bank-nome">${escapeHtml(cartao.nome)}</span>
          <span class="cartao-bank-bandeira">💳</span>
        </div>
        <div class="cartao-bank-chip"></div>
        <div class="cartao-bank-numero">•••• ${String(cartao.id).slice(-4)}</div>
        <div class="cartao-bank-info">
          <div class="cartao-bank-info-item">
            <span class="cartao-bank-info-label">Disponível</span>
            <span class="cartao-bank-info-value">${formatMoney(disponivel)}</span>
          </div>
          <div class="cartao-bank-info-item">
            <span class="cartao-bank-info-label">Vencimento</span>
            <span class="cartao-bank-info-value">Dia ${cartao.vencimento}</span>
          </div>
        </div>
        <div class="cartao-bank-actions" onclick="event.stopPropagation();">
          <button onclick="editarCartao('${cartao.id}')" title="Editar">✏️</button>
          <button onclick="excluirCartaoPorId('${cartao.id}')" title="Excluir">🗑️</button>
        </div>
      </div>`;
  });
}

/**
 * Seleciona um cartão e exibe seus detalhes e fatura do mês atual.
 * @param {string} cartaoId - ID do cartão a ser selecionado.
 */
function selecionarCartao(cartaoId) {
  currentCartaoId = cartaoId;
  const hoje = new Date();
  currentFaturaMes = hoje.getMonth();
  currentFaturaAno = hoje.getFullYear();

  const detailSection = document.getElementById('cartao-detail-section');
  const emptyStateDiv = document.getElementById('nenhum-cartao-selecionado');

  if (detailSection) detailSection.style.display = 'block';
  if (emptyStateDiv) emptyStateDiv.style.display = 'none';

  renderDetalhesCartao();
  renderOperacoesFatura();
}

// ---------- Detalhes e fatura ----------

/**
 * Renderiza o card de detalhes (limite, utilização, fatura) do cartão selecionado.
 */
function renderDetalhesCartao() {
  const cartao = cartoes.find(c => c.id === currentCartaoId);
  if (!cartao) return;

  const usado = getTotalUtilizadoCartao(cartao.id);
  const percentual = cartao.limite > 0 ? (usado / cartao.limite * 100) : 0;

  const detailSection = document.getElementById('cartao-detail-section');
  if (!detailSection) return;

  detailSection.innerHTML = `
    <div class="cartao-resumo-card">
      <div class="cartao-limite-header">
        <span class="cartao-limite-titulo">Limite Disponível</span>
        <span class="cartao-limite-disponivel" id="detail-disponivel">${formatMoney(Math.max(0, cartao.limite - usado))}</span>
      </div>
      <div class="limite-progress-container">
        <div class="limite-labels">
          <span>Utilizado: <strong id="detail-utilizado">${formatMoney(usado)}</strong></span>
          <span id="detail-percentual">${percentual.toFixed(1)}%</span>
        </div>
        <div class="limite-bar-bg">
          <div class="limite-bar-fill ${_getStatusClass(percentual)}" id="detail-limite-bar" style="width:${Math.min(percentual, 100)}%;"></div>
        </div>
      </div>
      <div class="limite-detalhes-grid">
        <div class="limite-detalhe-item"><div class="label">Limite Total</div><div class="value" id="detail-limite-total">${formatMoney(cartao.limite)}</div></div>
        <div class="limite-detalhe-item"><div class="label">Vencimento</div><div class="value" id="detail-vencimento">Dia ${cartao.vencimento}</div></div>
      </div>

      <!-- Navegação de fatura -->
      <div class="fatura-periodo-selector">
        <button class="fatura-periodo-btn" onclick="navegarMesFatura(-1)">◀</button>
        <div style="text-align:center;">
          <div class="fatura-periodo-mes" id="fatura-mes-display-new">${mesesNomes[currentFaturaMes]} ${currentFaturaAno}</div>
          <div style="font-size:var(--font-sm);margin-top:2px;">
            <span class="fatura-status-badge aberta" id="fatura-status-badge">ABERTA</span>
          </div>
        </div>
        <button class="fatura-periodo-btn" onclick="navegarMesFatura(1)">▶</button>
      </div>

      <!-- Resumo da fatura -->
      <div class="fatura-resumo-inline">
        <div class="fatura-resumo-inline-item"><div class="label">Total</div><div class="value" id="resumo-total-fatura">R$ 0,00</div></div>
        <div class="fatura-resumo-inline-item"><div class="label">Pago</div><div class="value" id="resumo-pago">R$ 0,00</div></div>
        <div class="fatura-resumo-inline-item"><div class="label">Aberto</div><div class="value" id="resumo-aberto">R$ 0,00</div></div>
      </div>

      <div class="operacoes-list" id="operacoes-list"></div>
      <button class="btn-pagar-fatura-full" id="btn-pagar-fatura"
              onclick="prepararPagamentoFaturaAtual()" style="display:none;">
        💳 Pagar Fatura
      </button>
    </div>`;

  renderOperacoesFatura();
}

/**
 * Renderiza as parcelas da fatura do mês/ano selecionado e atualiza os totais.
 */
function renderOperacoesFatura() {
  const cartao = cartoes.find(c => c.id === currentCartaoId);
  if (!cartao) return;

  const fatura = getFaturaPorMes(cartao, currentFaturaMes, currentFaturaAno);
  const statusMap = {
    aberta: { text: 'ABERTA', cls: 'aberta' },
    fechada: { text: 'FECHADA', cls: 'fechada' },
    vencida: { text: 'VENCIDA', cls: 'vencida' },
    paga: { text: 'PAGA', cls: 'paga' },
  };
  const status = statusMap[fatura.status] || statusMap.aberta;

  const mesDisplay = document.getElementById('fatura-mes-display-new');
  if (mesDisplay) mesDisplay.innerHTML = `${mesesNomes[currentFaturaMes]} ${currentFaturaAno}`;

  const statusSpan = document.getElementById('fatura-status-badge');
  if (statusSpan) {
    statusSpan.textContent = status.text;
    statusSpan.className = `fatura-status-badge ${status.cls}`;
  }

  const totalSpan = document.getElementById('resumo-total-fatura');
  const pagoSpan = document.getElementById('resumo-pago');
  const abertoSpan = document.getElementById('resumo-aberto');

  if (totalSpan) totalSpan.textContent = formatMoney(fatura.valorTotal);
  if (pagoSpan) pagoSpan.textContent = formatMoney(fatura.valorPago);
  if (abertoSpan) abertoSpan.textContent = formatMoney(fatura.valorRestante);

  const btnPagar = document.getElementById('btn-pagar-fatura');
  if (btnPagar) {
    if (fatura.valorTotal === 0 || fatura.valorRestante <= 0) {
      btnPagar.style.display = 'none';
    } else {
      btnPagar.style.display = 'block';
      btnPagar.textContent = `💳 Pagar Fatura • ${formatMoney(fatura.valorRestante)}`;
    }
  }

  const container = document.getElementById('operacoes-list');
  if (!container) return;

  if (fatura.parcelas.length === 0) {
    container.innerHTML = '<div class="empty-state-modern">📭 Nenhuma operação</div>';
    return;
  }

  let html = '';
  let ultimaData = '';

  for (const parcela of fatura.parcelas) {
    // ✅ parseLocalDate evita deslocamento de fuso ao interpretar YYYY-MM-DD
    const dataLabel = parseLocalDate(parcela.data).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', weekday: 'short' });
    if (dataLabel !== ultimaData) {
      html += `<div class="operacao-section-header">${dataLabel}</div>`;
      ultimaData = dataLabel;
    }
    html += `
      <div class="operacao-item">
        <div class="operacao-icon default">💳</div>
        <div class="operacao-details">
          <div class="operacao-name">${escapeHtml(parcela.descricao)}</div>
          <div class="operacao-meta">${escapeHtml(parcela.categoria)} • Parcela ${parcela.parcelaNumero}/${parcela.totalParcelas}</div>
        </div>
        <div class="operacao-right">
          <div class="operacao-valor">- ${formatMoney(parcela.valor)}</div>
          <span class="operacao-status ${parcela.paga ? 'pago' : 'pendente'}">${parcela.paga ? 'Pago' : 'Pendente'}</span>
        </div>
      </div>`;
  }
  container.innerHTML = html;
}

/**
 * Navega para o mês anterior ou próximo na visualização de fatura.
 * @param {-1|1} direcao - Direção da navegação (-1 para anterior, 1 para próximo).
 */
function navegarMesFatura(direcao) {
  if (!currentCartaoId) return;

  let mes = currentFaturaMes + direcao;
  let ano = currentFaturaAno;

  if (mes < 0) {
    mes = 11;
    ano--;
  } else if (mes > 11) {
    mes = 0;
    ano++;
  }

  currentFaturaMes = mes;
  currentFaturaAno = ano;
  renderOperacoesFatura();
}

// ---------- Pagamento de fatura ----------

/**
 * Prepara o modal de pagamento com os dados da fatura atual.
 * Valida saldo disponível antes de abrir.
 */
function prepararPagamentoFaturaAtual() {
  if (!currentCartaoId) {
    showToast('Selecione um cartão', true);
    return;
  }

  const cartao = cartoes.find(c => c.id === currentCartaoId);
  if (!cartao) return;

  const fatura = getFaturaPorMes(cartao, currentFaturaMes, currentFaturaAno);
  if (!fatura || fatura.valorRestante <= 0) {
    showToast('Fatura sem valor pendente', true);
    return;
  }

  if (calcularSaldoReal() < fatura.valorRestante) {
    showToast('Saldo insuficiente!', true);
    return;
  }

  pendingPagamentoInfo = {
    cartao: cartao,
    fatura: fatura,
    competencia: { mes: currentFaturaMes, ano: currentFaturaAno },
  };

  const pagamentoInfo = document.getElementById('pagamento-info');
  if (pagamentoInfo) {
    pagamentoInfo.innerHTML = `
      Fatura: ${mesesNomes[currentFaturaMes]}/${currentFaturaAno}<br>
      Total: ${formatMoney(fatura.valorTotal)}<br>
      Restante: ${formatMoney(fatura.valorRestante)}`;
  }

  const valorInput = document.getElementById('pagamento-valor');
  if (valorInput) valorInput.value = formatBRL(fatura.valorRestante.toString());

  const modal = document.getElementById('modal-pagamento');
  if (modal) modal.style.display = 'flex';
}

/**
 * Confirma o pagamento parcial ou total da fatura.
 * Marca parcelas como pagas e registra o lançamento de débito.
 */
function confirmarPagamento() {
  if (!pendingPagamentoInfo) {
    showToast('Nenhum pagamento pendente', true);
    return;
  }

  const { cartao, fatura, competencia } = pendingPagamentoInfo;
  const valorPagamento = currencyToNumber(document.getElementById('pagamento-valor')?.value);

  if (isNaN(valorPagamento) || valorPagamento <= 0) {
    showToast('Valor inválido', true);
    return;
  }

  if (valorPagamento > fatura.valorRestante) {
    showToast(`Máximo: ${formatMoney(fatura.valorRestante)}`, true);
    return;
  }

  if (calcularSaldoReal() < valorPagamento) {
    showToast('Saldo insuficiente!', true);
    return;
  }

  // Marca parcelas como pagas na ordem
  let restante = valorPagamento;
  for (const compra of compras) {
    if (compra.cartaoId !== cartao.id) continue;

    for (let i = compra.parcelasPagas; i < compra.parcelas; i++) {
      if (restante <= 0) break;

      const dataCompra = parseLocalDate(compra.dataCompra);
      const diaCompra = dataCompra.getDate();
      const offsetMes = diaCompra >= cartao.fechamento ? 1 : 0;
      const mesVencimento = dataCompra.getMonth() + offsetMes + i;
      const dataVenc = new Date(dataCompra.getFullYear(), mesVencimento, cartao.vencimento);

      if (dataVenc.getMonth() === competencia.mes && dataVenc.getFullYear() === competencia.ano) {
        compra.parcelasPagas++;
        restante -= compra.valorParcela;
      }
    }
  }

  // Registra o débito na conta
  lancamentos.push({
    id: gerarId('pag'),
    data: hojeLocal(),
    descricao: `Pagamento fatura ${cartao.nome}`,
    categoria: 'Pagamento Fatura',
    valor: -valorPagamento,
    tipo: 'pagamento_fatura',
    cartaoId: cartao.id,
    competenciaPaga: competencia,
  });

  // Invalida o cache após alterações
  if (typeof invalidarCacheLancamentos === 'function') {
    invalidarCacheLancamentos();
  }

  salvarTudo();
  renderTudo();
  fecharModal('modal-pagamento');
  pendingPagamentoInfo = null;
  showToast(`✅ Pagamento de ${formatMoney(valorPagamento)} realizado!`);
}

// ---------- CRUD de cartões ----------

/**
 * Abre o modal de criação de novo cartão com campos limpos.
 */
function abrirModalCartao() {
  const idInput = document.getElementById('cartao-editar-id');
  const nomeInput = document.getElementById('cartao-nome');
  const limiteInput = document.getElementById('cartao-limite');
  const fechamentoInput = document.getElementById('cartao-fechamento');
  const vencimentoInput = document.getElementById('cartao-vencimento');

  if (idInput) idInput.value = '';
  if (nomeInput) nomeInput.value = '';
  if (limiteInput) limiteInput.value = '';
  if (fechamentoInput) fechamentoInput.value = '';
  if (vencimentoInput) vencimentoInput.value = '';

  const modal = document.getElementById('modal-cartao');
  if (modal) modal.style.display = 'flex';

  setTimeout(() => {
    if (limiteInput && !limiteInput.value) limiteInput.value = '0,00';
  }, 50);
}

/**
 * Salva um cartão novo ou atualiza um existente.
 */
function salvarCartao() {
  const id = document.getElementById('cartao-editar-id')?.value;
  const nome = document.getElementById('cartao-nome')?.value.trim();
  const limite = currencyToNumber(document.getElementById('cartao-limite')?.value);
  const fechamento = parseInt(document.getElementById('cartao-fechamento')?.value);
  const vencimento = parseInt(document.getElementById('cartao-vencimento')?.value);

  if (!nome || isNaN(limite) || isNaN(fechamento) || isNaN(vencimento)) {
    showToast('Preencha todos os campos', true);
    return;
  }

  // 🔥 VALIDAÇÃO DAS DATAS DO CARTÃO
  if (!validarDatasCartao(fechamento, vencimento)) {
    return;
  }

  if (id) {
    // Edição
    const idx = cartoes.findIndex(c => c.id === id);
    if (idx !== -1) {
      cartoes[idx] = { ...cartoes[idx], nome, limite, fechamento, vencimento };
      showToast('Cartão atualizado!');
    } else {
      showToast('Erro: cartão não encontrado', true);
      return;
    }
  } else {
    // Criação
    cartoes.push({
      id: gerarId('cartao'),
      nome,
      limite,
      fechamento,
      vencimento,
    });
    showToast('Cartão cadastrado!');
  }

  // Invalida o cache após alterações
  if (typeof invalidarCacheLancamentos === 'function') {
    invalidarCacheLancamentos();
  }

  salvarTudo();
  renderTudo();
  fecharModal('modal-cartao');
  renderCartoesCarrossel();

  if (currentCartaoId && cartoes.find(c => c.id === currentCartaoId)) {
    selecionarCartao(currentCartaoId);
  }
}

/**
 * Abre o modal de edição preenchendo os campos com dados do cartão.
 * @param {string} cartaoId - ID do cartão a ser editado.
 */
function editarCartao(cartaoId) {
  const cartao = cartoes.find(c => c.id === cartaoId);
  if (!cartao) return;

  const idInput = document.getElementById('cartao-editar-id');
  const nomeInput = document.getElementById('cartao-nome');
  const limiteInput = document.getElementById('cartao-limite');
  const fechamentoInput = document.getElementById('cartao-fechamento');
  const vencimentoInput = document.getElementById('cartao-vencimento');

  if (idInput) idInput.value = cartao.id;
  if (nomeInput) nomeInput.value = cartao.nome;
  if (limiteInput) limiteInput.value = formatBRL(cartao.limite.toString());
  if (fechamentoInput) fechamentoInput.value = cartao.fechamento;
  if (vencimentoInput) vencimentoInput.value = cartao.vencimento;

  const modal = document.getElementById('modal-cartao');
  if (modal) modal.style.display = 'flex';
}

/**
 * Remove um cartão e todas as compras associadas a ele após confirmação.
 * @param {string} cartaoId - ID do cartão a ser excluído.
 */
function excluirCartaoPorId(cartaoId) {
  const cartao = cartoes.find(c => c.id === cartaoId);
  if (!cartao) return;

  confirmar({
    icone: '🗑️',
    titulo: `Excluir "${cartao.nome}"?`,
    mensagem: 'Todas as compras associadas a este cartão também serão removidas.',
    textoBotao: 'Excluir',
    perigo: true,
  }, () => {
    compras = compras.filter(c => c.cartaoId !== cartaoId);
    cartoes = cartoes.filter(c => c.id !== cartaoId);

    if (currentCartaoId === cartaoId) {
      currentCartaoId = null;
      const detailSection = document.getElementById('cartao-detail-section');
      const emptyStateDiv = document.getElementById('nenhum-cartao-selecionado');

      if (detailSection) detailSection.style.display = 'none';
      if (emptyStateDiv) emptyStateDiv.style.display = 'block';
    }

    // Invalida o cache após alterações
    if (typeof invalidarCacheLancamentos === 'function') {
      invalidarCacheLancamentos();
    }

    salvarTudo();
    renderTudo();
    renderCartoesCarrossel();
    showToast('Cartão removido!');
  });
}

// ---------- Compras parceladas ----------

/**
 * Abre o modal de lançamento de compra parcelada.
 * Exige pelo menos um cartão cadastrado.
 */
function abrirModalCompra() {
  if (cartoes.length === 0) {
    showToast('Cadastre um cartão primeiro', true);
    return;
  }

  const cartaoSelect = document.getElementById('compra-cartao');
  if (cartaoSelect) {
    cartaoSelect.innerHTML = '<option value="">Selecione</option>';
    cartoes.forEach(c => cartaoSelect.add(new Option(`${c.nome} (${formatMoney(c.limite)})`, c.id)));
  }

  const descInput = document.getElementById('compra-desc');
  const valorInput = document.getElementById('compra-valor');
  const dataInput = document.getElementById('compra-data');
  const categoriaSelect = document.getElementById('compra-categoria');

  if (descInput) descInput.value = '';
  if (valorInput) valorInput.value = '';
  if (dataInput) dataInput.value = hojeLocal();

  if (categoriaSelect) {
    categoriaSelect.innerHTML = '<option value="">Selecione</option>';
    getCategoriasDespesa().forEach(c => categoriaSelect.add(new Option(c, c)));
  }

  const modal = document.getElementById('modal-compra');
  if (modal) modal.style.display = 'flex';

  setTimeout(() => {
    if (valorInput && !valorInput.value) valorInput.value = '0,00';
  }, 50);
}

/**
 * Salva uma nova compra parcelada.
 */
function salvarCompra() {
  const cartaoId = document.getElementById('compra-cartao')?.value;
  const descricao = document.getElementById('compra-desc')?.value.trim();
  const valorTotal = currencyToNumber(document.getElementById('compra-valor')?.value);
  const parcelas = parseInt(document.getElementById('compra-parcelas')?.value);
  const dataCompra = document.getElementById('compra-data')?.value;
  const categoria = document.getElementById('compra-categoria')?.value;

  if (!cartaoId || !descricao || isNaN(valorTotal) || valorTotal <= 0 || !dataCompra || !categoria) {
    showToast('Preencha todos os campos', true);
    return;
  }

  const cartao = cartoes.find(c => c.id === cartaoId);
  if (!cartao) {
    showToast('Cartão não encontrado', true);
    return;
  }

  const valorParcela = Math.round((valorTotal / parcelas) * 100) / 100;

  compras.push({
    id: gerarId('compra'),
    dataCompra,
    descricao: descricao,
    categoria,
    valorTotal,
    parcelas,
    valorParcela,
    cartaoId: cartao.id,
    parcelasPagas: 0,
  });

  // Invalida o cache após alterações
  if (typeof invalidarCacheLancamentos === 'function') {
    invalidarCacheLancamentos();
  }

  salvarTudo();
  renderTudo();
  fecharModal('modal-compra');
  showToast(`✅ Compra de ${formatMoney(valorTotal)} em ${parcelas}x lançada!`);

  if (currentCartaoId === cartao.id || !currentCartaoId) {
    selecionarCartao(cartao.id);
  }
}

/**
 * Remove uma compra e todas as suas parcelas após confirmação.
 * @param {string} compraId - ID da compra a ser excluída.
 */
function excluirCompra(compraId) {
  const compra = compras.find(c => c.id === compraId);
  if (!compra) return;

  confirmar({
    icone: '🗑️',
    titulo: 'Excluir compra?',
    mensagem: `"${compra.descricao}" — todas as ${compra.parcelas} parcelas serão removidas.`,
    textoBotao: 'Excluir',
    perigo: true,
  }, () => {
    compras = compras.filter(c => c.id !== compraId);
    
    // Invalida o cache após alterações
    if (typeof invalidarCacheLancamentos === 'function') {
      invalidarCacheLancamentos();
    }
    
    salvarTudo();
    renderTudo();
    showToast('Compra removida!');
  });
}

// ---------- Helpers privados ----------

/**
 * Retorna a classe CSS para a barra de progresso baseada no percentual usado.
 * @param {number} percentual - Percentual utilizado do limite (0-100).
 * @returns {string} Classe CSS: 'safe', 'warning' ou 'danger'.
 * @private
 */
function _getStatusClass(percentual) {
  if (percentual >= 90) return 'danger';
  if (percentual >= 70) return 'warning';
  return 'safe';
}