// =============================================================================
// transacoes.js — Modal de receitas/despesas, CRUD de lançamentos e reserva
// =============================================================================
// Depende de: utils.js, storage.js, recorrencias.js
// =============================================================================

// ---------- Modal de transação ----------

/**
 * Abre o modal de nova receita ou despesa com campos zerados.
 * @param {'receita'|'despesa'} tipo
 */
function abrirModalTransacao(tipo) {
  document.getElementById('transacao-id').value    = '';
  document.getElementById('transacao-data').value  = hojeLocal();
  document.getElementById('transacao-desc').value  = '';

  const vi = document.getElementById('transacao-valor');
  if (vi) vi.value = '';

  // Carrega categorias conforme o tipo
  const cs = document.getElementById('transacao-cat');
  cs.innerHTML = '';
  (tipo === 'receita' ? getCategoriasReceita() : getCategoriasDespesa())
    .forEach(c => cs.add(new Option(c, c)));

  document.getElementById('modal-titulo').innerHTML = tipo === 'receita' ? '💰 Nova Receita' : '💸 Nova Despesa';

  // Reseta painel de recorrência
  _resetarPainelRecorrencia();

  document.getElementById('modal-transacao').style.display = 'flex';
  setTimeout(() => {
    const vi2 = document.getElementById('transacao-valor');
    if (vi2 && !vi2.value) vi2.value = '0,00';
    verificarExibicaoGerarHoje();
  }, 50);
}

/**
 * Abre o modal com a opção de recorrência já ativada.
 * @param {'receita'|'despesa'} tipo
 */
function abrirModalTransacaoComRecorrencia(tipo) {
  abrirModalTransacao(tipo);
  setTimeout(() => {
    document.getElementById('recorrencia-ativa').checked = true;
    toggleRecorrenciaConfig();
    toggleCartaoRecorrencia();
    _atualizarDiaRecorrencia();
    verificarExibicaoGerarHoje();
  }, 100);
}

/**
 * Salva a transação (nova, edição ou criação de recorrência).
 */
function salvarTransacao() {
  const id        = document.getElementById('transacao-id').value;
  const data      = document.getElementById('transacao-data').value;
  const descricao = document.getElementById('transacao-desc').value.trim();
  const categoria = document.getElementById('transacao-cat').value;
  const tipo      = document.getElementById('modal-titulo').innerHTML.includes('Receita') ? 'receita' : 'despesa';
  let valor       = currencyToNumber(document.getElementById('transacao-valor').value);

  if (!descricao || isNaN(valor) || valor <= 0) { showToast('Preencha os dados', true); return; }

  valor = tipo === 'receita' ? Math.abs(valor) : -Math.abs(valor);

  if (id) {
    // Edição de transação existente
    const idx = lancamentos.findIndex(l => l.id === id);
    if (idx !== -1) {
      lancamentos[idx] = { ...lancamentos[idx], data, descricao, categoria, valor };
      showToast('Transação atualizada!');
    }
  } else if (document.getElementById('recorrencia-ativa').checked) {
    _salvarComoRecorrencia({ descricao, categoria, valor });
    return; // salvarComoRecorrencia chama salvarTudo/renderTudo/fecharModal por conta própria
  } else {
    // Transação avulsa
    lancamentos.push({
      id: gerarId('trans'),
      data,
      descricao,
      categoria,
      valor,
      tipo: valor > 0 ? 'receita' : 'despesa_avista',
    });
    showToast('Salvo!');
  }

  salvarTudo();
  renderTudo();
  fecharModal('modal-transacao');
}

/**
 * Abre o modal de edição de uma transação existente.
 * @param {string} id
 */
function editarTransacao(id) {
  const t = lancamentos.find(x => x.id === id);
  if (!t || t.tipo === 'pagamento_fatura') { showToast('Edição não permitida', true); return; }

  document.getElementById('transacao-id').value   = t.id;
  document.getElementById('transacao-data').value = t.data;
  document.getElementById('transacao-desc').value = t.descricao;

  const vi = document.getElementById('transacao-valor');
  if (vi) vi.value = formatBRL(Math.abs(t.valor).toString());

  const cs = document.getElementById('transacao-cat');
  cs.innerHTML = '';
  (t.valor > 0 ? getCategoriasReceita() : getCategoriasDespesa())
    .forEach(c => cs.add(new Option(c, c)));
  cs.value = t.categoria;

  document.getElementById('modal-titulo').innerHTML = t.valor > 0 ? '💰 Editar Receita' : '💸 Editar Despesa';

  _resetarPainelRecorrencia();
  document.getElementById('modal-transacao').style.display = 'flex';
}

/**
 * Exclui uma transação avulsa.
 * @param {string} id
 */
function excluirItem(id) {
  const t = lancamentos.find(l => l.id === id);
  if (!t) return;

  confirmar({
    icone: '🗑️',
    titulo: 'Excluir transação?',
    mensagem: `"${t.descricao}" — esta ação não pode ser desfeita.`,
    textoBotao: 'Excluir',
    perigo: true,
  }, () => {
    lancamentos = lancamentos.filter(l => l.id !== id);
    salvarTudo();
    renderTudo();
    showToast('Removido!');
  });
}

// ---------- Reserva de emergência ----------

/**
 * Renderiza a tela de reserva: totais, barra de progresso e lista de metas.
 */
function atualizarReservaDisplay() {
  const total = reservaMetas.reduce((s, m) => s + (m.atual || 0), 0);
  const meta  = reservaMetas.reduce((s, m) => s + m.valor, 0);

  document.getElementById('total-reservado').innerHTML     = formatMoney(total);
  document.getElementById('meta-total').innerHTML          = formatMoney(meta);
  document.getElementById('progress-percent').innerHTML    = meta > 0 ? ((total / meta) * 100).toFixed(1) + '%' : '0%';
  document.getElementById('progress-reserva-fill').style.width = meta > 0 ? `${Math.min((total / meta) * 100, 100)}%` : '0%';

  const container = document.getElementById('metas-reserva-list');

  if (reservaMetas.length === 0) {
    container.innerHTML = '<div class="empty-state-modern"><div class="icon">🎯</div><div class="title">Nenhuma meta</div></div>';
    return;
  }

  container.innerHTML = '';
  for (const m of reservaMetas) {
    const pm = m.valor > 0 ? ((m.atual || 0) / m.valor * 100) : 0;
    container.innerHTML += `
      <div class="meta-item">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <strong>${escapeHtml(m.nome)}</strong>
          <div class="meta-actions">
            <button onclick="editarMeta('${m.id}')" title="Editar">✏️</button>
            <button onclick="excluirMeta('${m.id}')" title="Excluir" style="color:var(--danger);">🗑️</button>
          </div>
        </div>
        <div style="font-size:var(--font-base); margin-top:var(--margin-xs);">${formatMoney(m.atual || 0)} de ${formatMoney(m.valor)}</div>
        <div style="height:6px; background:var(--gray-200); border-radius:var(--radius-full); margin-top:var(--margin-xs);">
          <div style="width:${Math.min(pm, 100)}%; background:${pm >= 100 ? 'var(--success)' : 'var(--primary)'}; border-radius:var(--radius-full); height:100%;"></div>
        </div>
      </div>`;
  }
}

/**
 * Abre o modal de criação de meta de reserva.
 */
function abrirModalMeta() {
  document.getElementById('meta-nome').value  = '';
  document.getElementById('meta-valor').value = '';
  document.getElementById('modal-meta').style.display = 'flex';
}

/**
 * Salva uma nova meta de reserva.
 */
function salvarMeta() {
  const nome  = document.getElementById('meta-nome').value.trim();
  const valor = parseFloat(document.getElementById('meta-valor').value);

  if (!nome || isNaN(valor) || valor <= 0) { showToast('Preencha os dados', true); return; }

  reservaMetas.push({ id: gerarId('meta'), nome, valor, atual: 0 });
  salvarTudo();
  atualizarReservaDisplay();
  fecharModal('modal-meta');
  showToast('Meta criada!');
}

/**
 * Edita nome e valor de uma meta existente.
 * @param {string} id
 */
function editarMeta(id) {
  const m = reservaMetas.find(x => x.id === id);
  if (!m) return;

  perguntarForm({
    icone: '🎯',
    titulo: 'Editar meta',
    textoBotao: 'Salvar',
    campos: [
      { campo: 'nome',  label: 'Nome',           valorInicial: m.nome,  required: true },
      { campo: 'valor', label: 'Valor objetivo', tipo: 'money', valorInicial: m.valor, required: true },
    ],
  }, ({ nome, valor }) => {
    const novoValor = currencyToNumber(valor);
    if (!nome.trim() || isNaN(novoValor) || novoValor <= 0) { showToast('Dados inválidos', true); return; }
    m.nome  = nome.trim();
    m.valor = novoValor;
    salvarTudo();
    atualizarReservaDisplay();
    showToast('Atualizada!');
  });
}

/**
 * Remove uma meta de reserva.
 * @param {string} id
 */
function excluirMeta(id) {
  const m = reservaMetas.find(x => x.id === id);
  if (!m) return;

  confirmar({
    icone: '🗑️',
    titulo: `Excluir "${m.nome}"?`,
    mensagem: 'O saldo desta meta será perdido permanentemente.',
    textoBotao: 'Excluir',
    perigo: true,
  }, () => {
    reservaMetas = reservaMetas.filter(x => x.id !== id);
    salvarTudo();
    atualizarReservaDisplay();
    showToast('Excluída!');
  });
}

/**
 * Transfere um valor da conta corrente para a reserva de emergência.
 * Distribui o valor proporcionalmente entre todas as metas.
 */
function adicionarReservaRapida() {
  const saldo = calcularSaldoReal();
  perguntarValor({
    icone: '➕',
    titulo: 'Adicionar à reserva',
    label: 'Valor a transferir',
    valorInicial: 0,
    info: `Saldo disponível: <strong>${formatMoney(saldo)}</strong>`,
    textoBotao: 'Transferir',
  }, valor => {
    if (saldo < valor) { showToast('Saldo insuficiente!', true); return; }

    lancamentos.push({
      id: gerarId('res'),
      data: hojeLocal(),
      descricao: 'Transferência para Reserva',
      categoria: 'Reserva',
      valor: -valor,
      tipo: 'despesa_avista',
    });

    const totalMeta = reservaMetas.reduce((s, m) => s + m.valor, 0);
    for (const m of reservaMetas) {
      m.atual = (m.atual || 0) + (valor * (m.valor / totalMeta));
    }

    salvarTudo();
    renderTudo();
    showToast(`✅ ${formatMoney(valor)} adicionado!`);
  });
}

/**
 * Resgata um valor da reserva e devolve para a conta corrente.
 */
function sacarReserva() {
  const total = reservaMetas.reduce((s, m) => s + (m.atual || 0), 0);
  if (total === 0) { showToast('Nada para sacar', true); return; }

  perguntarValor({
    icone: '➖',
    titulo: 'Sacar da reserva',
    label: 'Valor a resgatar',
    valorInicial: 0,
    info: `Reserva disponível: <strong>${formatMoney(total)}</strong>`,
    textoBotao: 'Sacar',
  }, valor => {
    if (total < valor) { showToast('Saldo insuficiente!', true); return; }

    lancamentos.push({
      id: gerarId('res_saq'),
      data: hojeLocal(),
      descricao: 'Resgate da Reserva',
      categoria: 'Reserva',
      valor: +valor,
      tipo: 'receita',
    });

    const totalMeta = reservaMetas.reduce((s, m) => s + m.valor, 0);
    for (const m of reservaMetas) {
      m.atual = Math.max(0, (m.atual || 0) - (valor * (m.valor / totalMeta)));
    }

    salvarTudo();
    renderTudo();
    showToast(`✅ ${formatMoney(valor)} sacado!`);
  });
}

// ---------- Helpers privados ----------

/**
 * Reseta o painel de recorrência para o estado padrão (desmarcado).
 * @private
 */
function _resetarPainelRecorrencia() {
  document.getElementById('recorrencia-ativa').checked = false;
  document.getElementById('recorrencia-config').classList.remove('active');
  document.getElementById('recorrencia-icon').textContent = '🔄';

  document.querySelectorAll('#frequencia-chips .recorrencia-chip')
    .forEach(chip => chip.classList.remove('active'));
  const chipMensal = document.querySelector('#frequencia-chips .recorrencia-chip[data-freq="mensal"]');
  if (chipMensal) chipMensal.classList.add('active');

  const inputDia = document.getElementById('recorrencia-dia');
  inputDia.min = 1; inputDia.max = 31;
  inputDia.placeholder = 'Dia do vencimento';
  inputDia.value = new Date().getDate();

  document.getElementById('label-dia-recorrencia').textContent = 'Dia do mês (1-31)';
  document.getElementById('recorrencia-forma-pagamento').value = 'debito';
  document.getElementById('recorrencia-cartao-group').style.display = 'none';
  document.getElementById('recorrencia-fim').value = '';

  const gerarHojeToggle = document.getElementById('gerar-hoje-toggle');
  if (gerarHojeToggle) gerarHojeToggle.style.display = 'none';
}

/**
 * Atualiza o campo de dia da recorrência conforme o chip de frequência ativo.
 * @private
 */
function _atualizarDiaRecorrencia() {
  const chipAtivo = document.querySelector('#frequencia-chips .recorrencia-chip.active');
  if (!chipAtivo) return;

  const hoje = new Date();
  const freq = chipAtivo.dataset.freq;
  const inputDia = document.getElementById('recorrencia-dia');

  if (freq === 'mensal')    inputDia.value = hoje.getDate();
  else if (freq === 'quinzenal') inputDia.value = Math.min(hoje.getDate(), 15);
  else if (freq === 'semanal')   inputDia.value = hoje.getDay();
}

/**
 * Salva a transação como recorrência, gerando a primeira ocorrência imediatamente
 * se aplicável.
 * @private
 * @param {{ descricao: string, categoria: string, valor: number }} params
 */
function _salvarComoRecorrencia({ descricao, categoria, valor }) {
  const freqBtn    = document.querySelector('#frequencia-chips .recorrencia-chip.active');
  const frequencia = freqBtn ? freqBtn.dataset.freq : 'mensal';
  const hoje       = new Date();

  // Valida e normaliza o dia conforme a frequência
  let dia = parseInt(document.getElementById('recorrencia-dia').value);
  if (frequencia === 'semanal')    dia = (!isNaN(dia) && dia >= 0 && dia <= 6) ? dia : hoje.getDay();
  else if (frequencia === 'quinzenal') dia = Math.min(!isNaN(dia) && dia >= 1 ? dia : hoje.getDate(), 15);
  else                             dia = Math.min(Math.max(!isNaN(dia) && dia >= 1 ? dia : hoje.getDate(), 1), 31);

  const dataFim       = document.getElementById('recorrencia-fim').value || null;
  const formaPagamento = document.getElementById('recorrencia-forma-pagamento').value;
  let cartaoId = null;

  if (formaPagamento === 'cartao') {
    cartaoId = document.getElementById('recorrencia-cartao').value;
    if (!cartaoId) { showToast('Selecione um cartão', true); return; }
  }

  const novaRec = {
    id: gerarId('rec'),
    descricao,
    categoria,
    valor,
    tipo: frequencia,
    dia,
    dataFim,
    ativo: true,
    ultimaGeracao: '',
    formaPagamento,
    cartaoId,
  };

  // Gera a primeira ocorrência
  const gerarHojeEl    = document.getElementById('gerar-hoje-toggle');
  const gerarPrimeiraHoje = document.getElementById('gerar-primeira-hoje');
  const gerarHoje      = gerarHojeEl?.style.display === 'flex' && gerarPrimeiraHoje?.checked === true;
  const dataPrimeira   = gerarHoje ? hoje : calcularProximaDataRecorrencia(novaRec, hoje);

  if (dataPrimeira && formaPagamento === 'cartao' && cartaoId) {
    const cartao = cartoes.find(c => c.id === cartaoId);
    if (cartao) {
      compras.push({
        id: gerarId('compra_rec_' + novaRec.id),
        dataCompra: formatarDataLocal(dataPrimeira),
        descricao: descricao + ' (Recorrente)',
        categoria,
        valorTotal: Math.abs(valor),
        parcelas: 1,
        valorParcela: Math.abs(valor),
        cartaoId: cartao.id,
        parcelasPagas: 0,
      });
      showToast(`✅ Recorrência criada! Lançado no cartão ${cartao.nome}.`);
    }
  } else if (dataPrimeira) {
    lancamentos.push({
      id: gerarId('trans_rec'),
      data: formatarDataLocal(dataPrimeira),
      descricao: descricao + ' (Recorrente)',
      categoria,
      valor,
      tipo: valor > 0 ? 'receita' : 'despesa_avista',
      recorrenciaId: novaRec.id,
    });
    showToast(`✅ Recorrência criada! Lançada para ${dataPrimeira.toLocaleDateString('pt-BR')}.`);
  } else {
    showToast('✅ Recorrência criada! Processada no próximo ciclo.');
  }

  recorrencias.push(novaRec);
  salvarTudo();
  renderTudo();
  fecharModal('modal-transacao');
}
