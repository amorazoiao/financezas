// =============================================================================
// cartoes.js — Cartões de crédito, faturas, compras parceladas e pagamentos
// =============================================================================
// Depende de: utils.js, storage.js
// =============================================================================

const CORES_CARTAO = ['card-purple', 'card-black', 'card-gold', 'card-blue'];

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

  cartoes.forEach((c, i) => {
    const usado = getTotalUtilizadoCartao(c.id);
    const disponivel = Math.max(0, c.limite - usado);
    const corClasse = CORES_CARTAO[i % CORES_CARTAO.length];
    const selecionado = currentCartaoId === c.id ? 'selected' : '';

    container.innerHTML += `
      <div class="cartao-bank-card ${corClasse} ${selecionado}"
           onclick="selecionarCartao('${c.id}')"
           id="cartao-card-${c.id}">
        <div class="cartao-bank-header">
          <span class="cartao-bank-nome">${escapeHtml(c.nome)}</span>
          <span class="cartao-bank-bandeira">💳</span>
        </div>
        <div class="cartao-bank-chip"></div>
        <div class="cartao-bank-numero">•••• ${String(c.id).slice(-4)}</div>
        <div class="cartao-bank-info">
          <div class="cartao-bank-info-item">
            <span class="cartao-bank-info-label">Disponível</span>
            <span class="cartao-bank-info-value">${formatMoney(disponivel)}</span>
          </div>
          <div class="cartao-bank-info-item">
            <span class="cartao-bank-info-label">Vencimento</span>
            <span class="cartao-bank-info-value">Dia ${c.vencimento}</span>
          </div>
        </div>
        <div class="cartao-bank-actions" onclick="event.stopPropagation();">
          <button onclick="event.stopPropagation(); editarCartao('${c.id}')" title="Editar">✏️</button>
          <button onclick="event.stopPropagation(); excluirCartaoPorId('${c.id}')" title="Excluir">🗑️</button>
        </div>
      </div>`;
  });
}

/**
 * Seleciona um cartão e exibe seus detalhes e fatura do mês atual.
 * @param {string} id
 */
function selecionarCartao(id) {
  currentCartaoId = id;
  currentFaturaMes = new Date().getMonth();
  currentFaturaAno = new Date().getFullYear();

  document.getElementById('cartao-detail-section').style.display = 'block';
  document.getElementById('nenhum-cartao-selecionado').style.display = 'none';

  renderDetalhesCartao();
  renderOperacoesFatura();
}

// ---------- Detalhes e fatura ----------

/**
 * Renderiza o card de detalhes (limite, utilização, fatura) do cartão selecionado.
 */
function renderDetalhesCartao() {
  const c = cartoes.find(x => x.id === currentCartaoId);
  if (!c) return;

  const usado = getTotalUtilizadoCartao(c.id);
  const pct   = c.limite > 0 ? (usado / c.limite * 100) : 0;

  document.getElementById('cartao-detail-section').innerHTML = `
    <div class="cartao-resumo-card">
      <div class="cartao-limite-header">
        <span class="cartao-limite-titulo">Limite Disponível</span>
        <span class="cartao-limite-disponivel" id="detail-disponivel">${formatMoney(Math.max(0, c.limite - usado))}</span>
      </div>
      <div class="limite-progress-container">
        <div class="limite-labels">
          <span>Utilizado: <strong id="detail-utilizado">${formatMoney(usado)}</strong></span>
          <span id="detail-percentual">${pct.toFixed(1)}%</span>
        </div>
        <div class="limite-bar-bg">
          <div class="limite-bar-fill safe" id="detail-limite-bar" style="width:${Math.min(pct, 100)}%;"></div>
        </div>
      </div>
      <div class="limite-detalhes-grid">
        <div class="limite-detalhe-item"><div class="label">Limite Total</div><div class="value" id="detail-limite-total">${formatMoney(c.limite)}</div></div>
        <div class="limite-detalhe-item"><div class="label">Vencimento</div><div class="value" id="detail-vencimento">Dia ${c.vencimento}</div></div>
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
  const c = cartoes.find(x => x.id === currentCartaoId);
  if (!c) return;

  const fatura = getFaturaPorMes(c, currentFaturaMes, currentFaturaAno);
  const statusMap = {
    aberta:  { text: 'ABERTA',  cls: 'aberta' },
    fechada: { text: 'FECHADA', cls: 'fechada' },
    vencida: { text: 'VENCIDA', cls: 'vencida' },
    paga:    { text: 'PAGA',    cls: 'paga' },
  };
  const status = statusMap[fatura.status] || statusMap.aberta;

  document.getElementById('fatura-mes-display-new').innerHTML = `${mesesNomes[currentFaturaMes]} ${currentFaturaAno}`;

  const statusSpan = document.getElementById('fatura-status-badge');
  if (statusSpan) { statusSpan.textContent = status.text; statusSpan.className = `fatura-status-badge ${status.cls}`; }

  document.getElementById('resumo-total-fatura').textContent = formatMoney(fatura.valorTotal);
  document.getElementById('resumo-pago').textContent         = formatMoney(fatura.valorPago);
  document.getElementById('resumo-aberto').textContent       = formatMoney(fatura.valorRestante);

  const btn = document.getElementById('btn-pagar-fatura');
  if (fatura.valorTotal === 0 || fatura.valorRestante <= 0) {
    btn.style.display = 'none';
  } else {
    btn.style.display = 'block';
    btn.textContent = `💳 Pagar Fatura • ${formatMoney(fatura.valorRestante)}`;
  }

  const container = document.getElementById('operacoes-list');
  if (fatura.parcelas.length === 0) {
    container.innerHTML = '<div class="empty-state-modern">📭 Nenhuma operação</div>';
    return;
  }

  let html = '';
  let ultimaData = '';

  for (const p of fatura.parcelas) {
    const dataLabel = new Date(p.data).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', weekday: 'short' });
    if (dataLabel !== ultimaData) {
      html += `<div class="operacao-section-header">${dataLabel}</div>`;
      ultimaData = dataLabel;
    }
    html += `
      <div class="operacao-item">
        <div class="operacao-icon default">💳</div>
        <div class="operacao-details">
          <div class="operacao-name">${escapeHtml(p.descricao)}</div>
          <div class="operacao-meta">${escapeHtml(p.categoria)} • Parcela ${p.parcelaNumero}/${p.totalParcelas}</div>
        </div>
        <div class="operacao-right">
          <div class="operacao-valor">- ${formatMoney(p.valor)}</div>
          <span class="operacao-status ${p.paga ? 'pago' : 'pendente'}">${p.paga ? 'Pago' : 'Pendente'}</span>
        </div>
      </div>`;
  }
  container.innerHTML = html;
}

/**
 * Navega para o mês anterior ou próximo na visualização de fatura.
 * @param {-1|1} direcao
 */
function navegarMesFatura(direcao) {
  if (!currentCartaoId) return;
  let m = currentFaturaMes + direcao;
  let a = currentFaturaAno;
  if (m < 0)  { m = 11; a--; }
  if (m > 11) { m = 0;  a++; }
  currentFaturaMes = m;
  currentFaturaAno = a;
  renderOperacoesFatura();
}

// ---------- Pagamento de fatura ----------

/**
 * Prepara o modal de pagamento com os dados da fatura atual.
 * Valida saldo disponível antes de abrir.
 */
function prepararPagamentoFaturaAtual() {
  if (!currentCartaoId) { showToast('Selecione um cartão', true); return; }

  const c = cartoes.find(x => x.id === currentCartaoId);
  if (!c) return;

  const f = getFaturaPorMes(c, currentFaturaMes, currentFaturaAno);
  if (!f || f.valorRestante <= 0) { showToast('Fatura sem valor pendente', true); return; }
  if (calcularSaldoReal() < f.valorRestante) { showToast('Saldo insuficiente!', true); return; }

  pendingPagamentoInfo = {
    cartao: c,
    fatura: f,
    competencia: { mes: currentFaturaMes, ano: currentFaturaAno },
  };

  document.getElementById('pagamento-info').innerHTML = `
    Fatura: ${mesesNomes[currentFaturaMes]}/${currentFaturaAno}<br>
    Total: ${formatMoney(f.valorTotal)}<br>
    Restante: ${formatMoney(f.valorRestante)}`;

  document.getElementById('pagamento-valor').value = formatBRL(f.valorRestante.toString());
  document.getElementById('modal-pagamento').style.display = 'flex';
}

/**
 * Confirma o pagamento parcial ou total da fatura.
 * Marca parcelas como pagas e registra o lançamento de débito.
 */
function confirmarPagamento() {
  if (!pendingPagamentoInfo) return;

  const { cartao, fatura, competencia } = pendingPagamentoInfo;
  let valor = currencyToNumber(document.getElementById('pagamento-valor').value);

  if (isNaN(valor) || valor <= 0)  { showToast('Valor inválido', true); return; }
  if (valor > fatura.valorRestante) { showToast(`Máximo: ${formatMoney(fatura.valorRestante)}`, true); return; }
  if (calcularSaldoReal() < valor)  { showToast('Saldo insuficiente!', true); return; }

  // Marca parcelas como pagas na ordem
  let restante = valor;
  for (const compra of compras) {
    if (compra.cartaoId !== cartao.id) continue;
    for (let i = compra.parcelasPagas; i < compra.parcelas; i++) {
      if (restante <= 0) break;
      const dataVenc = new Date(compra.dataCompra);
      dataVenc.setMonth(new Date(compra.dataCompra).getMonth() + i);
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
    valor: -valor,
    tipo: 'pagamento_fatura',
    cartaoId: cartao.id,
    competenciaPaga: competencia,
  });

  salvarTudo();
  renderTudo();
  fecharModal('modal-pagamento');
  pendingPagamentoInfo = null;
  showToast(`✅ Pagamento de ${formatMoney(valor)} realizado!`);
}

// ---------- CRUD de cartões ----------

/**
 * Abre o modal de criação de novo cartão com campos limpos.
 */
function abrirModalCartao() {
  document.getElementById('cartao-editar-id').value  = '';
  document.getElementById('cartao-nome').value        = '';
  document.getElementById('cartao-limite').value      = '';
  document.getElementById('cartao-fechamento').value  = '';
  document.getElementById('cartao-vencimento').value  = '';
  document.getElementById('modal-cartao').style.display = 'flex';
  setTimeout(() => {
    const li = document.getElementById('cartao-limite');
    if (li && !li.value) li.value = '0,00';
  }, 50);
}

/**
 * Salva um cartão novo ou atualiza um existente.
 */
function salvarCartao() {
  const id         = document.getElementById('cartao-editar-id').value;
  const nome       = document.getElementById('cartao-nome').value.trim();
  const limite     = currencyToNumber(document.getElementById('cartao-limite').value);
  const fechamento = parseInt(document.getElementById('cartao-fechamento').value);
  const vencimento = parseInt(document.getElementById('cartao-vencimento').value);

  if (!nome || isNaN(limite) || !fechamento || !vencimento) { showToast('Preencha todos os campos', true); return; }

  if (id) {
    const idx = cartoes.findIndex(c => c.id === id);
    if (idx !== -1) cartoes[idx] = { ...cartoes[idx], nome, limite, fechamento, vencimento };
    showToast('Cartão atualizado!');
  } else {
    cartoes.push({ id: gerarId('cartao'), nome, limite, fechamento, vencimento });
    showToast('Cartão cadastrado!');
  }

  salvarTudo();
  renderTudo();
  fecharModal('modal-cartao');
  renderCartoesCarrossel();
  if (currentCartaoId && cartoes.find(c => c.id === currentCartaoId)) selecionarCartao(currentCartaoId);
}

/**
 * Abre o modal de edição preenchendo os campos com dados do cartão.
 * @param {string} id
 */
function editarCartao(id) {
  const c = cartoes.find(x => x.id === id);
  if (!c) return;

  document.getElementById('cartao-editar-id').value  = c.id;
  document.getElementById('cartao-nome').value        = c.nome;
  document.getElementById('cartao-limite').value      = formatBRL(c.limite.toString());
  document.getElementById('cartao-fechamento').value  = c.fechamento;
  document.getElementById('cartao-vencimento').value  = c.vencimento;
  document.getElementById('modal-cartao').style.display = 'flex';
}

/**
 * Remove um cartão e todas as compras associadas a ele.
 * @param {string} id
 */
function excluirCartaoPorId(id) {
  const cartao = cartoes.find(c => c.id === id);
  if (!cartao) return;

  confirmar({
    icone: '🗑️',
    titulo: `Excluir "${cartao.nome}"?`,
    mensagem: 'Todas as compras associadas a este cartão também serão removidas.',
    textoBotao: 'Excluir',
    perigo: true,
  }, () => {
    compras = compras.filter(c => c.cartaoId !== id);
    cartoes = cartoes.filter(c => c.id !== id);

    if (currentCartaoId === id) {
      currentCartaoId = null;
      document.getElementById('cartao-detail-section').style.display = 'none';
      document.getElementById('nenhum-cartao-selecionado').style.display = 'block';
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
  if (cartoes.length === 0) { showToast('Cadastre um cartão primeiro', true); return; }

  const sel = document.getElementById('compra-cartao');
  sel.innerHTML = '<option value="">Selecione</option>';
  cartoes.forEach(c => sel.add(new Option(`${c.nome} (${formatMoney(c.limite)})`, c.id)));

  document.getElementById('compra-desc').value  = '';
  document.getElementById('compra-valor').value = '';
  document.getElementById('compra-data').value  = hojeLocal();

  const cc = document.getElementById('compra-categoria');
  cc.innerHTML = '<option value="">Selecione</option>';
  getCategoriasDespesa().forEach(c => cc.add(new Option(c, c)));

  document.getElementById('modal-compra').style.display = 'flex';
  setTimeout(() => {
    const vi = document.getElementById('compra-valor');
    if (vi && !vi.value) vi.value = '0,00';
  }, 50);
}

/**
 * Salva uma nova compra parcelada.
 */
function salvarCompra() {
  const cartaoId   = document.getElementById('compra-cartao').value;
  const desc       = document.getElementById('compra-desc').value.trim();
  const valorTotal = currencyToNumber(document.getElementById('compra-valor').value);
  const parcelas   = parseInt(document.getElementById('compra-parcelas').value);
  const dataCompra = document.getElementById('compra-data').value;
  const categoria  = document.getElementById('compra-categoria').value;

  if (!cartaoId || !desc || isNaN(valorTotal) || valorTotal <= 0 || !dataCompra || !categoria) {
    showToast('Preencha todos os campos', true);
    return;
  }

  const cartao = cartoes.find(c => c.id === cartaoId);
  if (!cartao) { showToast('Cartão não encontrado', true); return; }

  const valorParcela = Math.round((valorTotal / parcelas) * 100) / 100;

  compras.push({
    id: gerarId('compra'),
    dataCompra,
    descricao: desc,
    categoria,
    valorTotal,
    parcelas,
    valorParcela,
    cartaoId: cartao.id,
    parcelasPagas: 0,
  });

  salvarTudo();
  renderTudo();
  fecharModal('modal-compra');
  showToast(`✅ Compra de ${formatMoney(valorTotal)} em ${parcelas}x lançada!`);

  if (currentCartaoId === cartao.id || !currentCartaoId) selecionarCartao(cartao.id);
}

/**
 * Remove uma compra e todas as suas parcelas.
 * @param {string} compraId
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
    salvarTudo();
    renderTudo();
    showToast('Compra removida!');
  });
}
