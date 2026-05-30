// =============================================================================
// recorrencias.js — Lógica de transações recorrentes
// =============================================================================
// Depende de: utils.js, storage.js
// =============================================================================

/**
 * Alterna o checkbox de recorrência manualmente (chamado por clique no label).
 */
function toggleRecorrenciaCheckbox() {
  const cb = document.getElementById('recorrencia-ativa');
  cb.checked = !cb.checked;
  toggleRecorrenciaConfig();
}

/**
 * Exibe ou oculta o painel de configuração de recorrência
 * conforme o estado do checkbox.
 */
function toggleRecorrenciaConfig() {
  const ativa = document.getElementById('recorrencia-ativa').checked;
  document.getElementById('recorrencia-config').classList.toggle('active', ativa);
  document.getElementById('recorrencia-icon').textContent = ativa ? '✅' : '🔄';
  if (ativa) verificarExibicaoGerarHoje();
}

/**
 * Verifica se o dia configurado na recorrência coincide com hoje
 * e mostra/oculta o toggle "Gerar hoje".
 */
function verificarExibicaoGerarHoje() {
  const freqBtn = document.querySelector('#frequencia-chips .recorrencia-chip.active');
  if (!freqBtn) return;

  const frequencia = freqBtn.dataset.freq;
  const dia = parseInt(document.getElementById('recorrencia-dia').value);
  const hoje = new Date();
  const forma = document.getElementById('recorrencia-forma-pagamento').value;
  const cartaoId = document.getElementById('recorrencia-cartao')?.value;
  let mostrar = false;

  if (frequencia === 'mensal') {
    const diaAjustado = ajustarDiaParaUltimoDiaDoMes(hoje.getFullYear(), hoje.getMonth(), dia);
    mostrar = hoje.getDate() === diaAjustado;
  } else if (frequencia === 'quinzenal') {
    const diaBase = Math.min(dia, 15);
    const ultimoDia = getUltimoDiaMes(hoje.getFullYear(), hoje.getMonth());
    const q1 = Math.min(diaBase, ultimoDia);
    const q2 = Math.min(diaBase + 15, ultimoDia);
    mostrar = hoje.getDate() === q1 || (q2 > q1 && hoje.getDate() === q2);
  } else if (frequencia === 'semanal') {
    mostrar = dia === hoje.getDay();
  }

  // Para cartão: só mostra "gerar hoje" se hoje for ANTES ou NO dia do fechamento.
  // Se já passou do fechamento, a entrada vai para a fatura do próximo mês de
  // qualquer forma — não há motivo para oferecer a opção.
  if (mostrar && forma === 'cartao' && cartaoId) {
    const cartao = cartoes.find(c => c.id === cartaoId);
    if (cartao && hoje.getDate() > cartao.fechamento) {
      mostrar = false;
    }
  }

  const toggle = document.getElementById('gerar-hoje-toggle');
  if (toggle) toggle.style.display = mostrar ? 'flex' : 'none';
}

/**
 * Seleciona uma frequência nos chips (Mensal / Quinzenal / Semanal)
 * e ajusta os limites e labels do input de dia.
 * @param {HTMLElement} botao — O chip clicado.
 */
function selecionarFrequencia(botao) {
  document.querySelectorAll('#frequencia-chips .recorrencia-chip')
    .forEach(c => c.classList.remove('active'));
  botao.classList.add('active');

  const freq = botao.dataset.freq;
  const label = document.getElementById('label-dia-recorrencia');
  const input = document.getElementById('recorrencia-dia');
  const hoje = new Date();

  if (freq === 'semanal') {
    label.textContent = 'Dia da semana (0=Dom, 6=Sáb)';
    input.min = 0;
    input.max = 6;
    input.placeholder = '0-6';
    input.value = hoje.getDay();
  } else if (freq === 'quinzenal') {
    label.textContent = 'Dia base (1-15)';
    input.min = 1;
    input.max = 15;
    input.placeholder = '1-15';
    input.value = Math.min(hoje.getDate(), 15);
  } else {
    label.textContent = 'Dia do mês (1-31)';
    input.min = 1;
    input.max = 31;
    input.placeholder = 'Dia do vencimento';
    input.value = hoje.getDate();
  }

  verificarExibicaoGerarHoje();
}

/**
 * Exibe ou oculta o seletor de cartão no modal de recorrência,
 * conforme a forma de pagamento escolhida.
 */
function toggleCartaoRecorrencia() {
  const forma = document.getElementById('recorrencia-forma-pagamento').value;
  const grupo = document.getElementById('recorrencia-cartao-group');
  const isReceita = document.getElementById('modal-titulo').innerHTML.includes('Receita');

  // Receitas nunca usam cartão — volta para débito se estava em cartão
  if (isReceita) {
    const optCartao = document.querySelector('#recorrencia-forma-pagamento option[value="cartao"]');
    if (optCartao) optCartao.style.display = 'none';
    document.getElementById('recorrencia-forma-pagamento').value = 'debito';
    grupo.style.display = 'none';
    return;
  }

  // Despesas — mostra a opção de cartão normalmente
  const optCartao = document.querySelector('#recorrencia-forma-pagamento option[value="cartao"]');
  if (optCartao) optCartao.style.display = '';

  if (forma === 'cartao') {
    grupo.style.display = 'block';
    const sel = document.getElementById('recorrencia-cartao');
    sel.innerHTML = '<option value="">Selecione o cartão</option>';
    cartoes.forEach(c => sel.add(new Option(c.nome, c.id)));
  } else {
    grupo.style.display = 'none';
  }
}

/**
 * Calcula a próxima data de geração de uma recorrência a partir
 * de uma data de referência (padrão: hoje).
 *
 * @param {Object} rec — Objeto de recorrência.
 * @param {Date} [dataReferencia=new Date()]
 * @returns {Date|null} null se já passou da data de fim.
 */
function calcularProximaDataRecorrencia(rec, dataReferencia = new Date()) {
  const hoje = new Date(dataReferencia);
  let proximaData = null;

  if (rec.tipo === 'mensal') {
    const ano = hoje.getFullYear();
    const mes = hoje.getMonth();
    const diaGerar = ajustarDiaParaUltimoDiaDoMes(ano, mes, rec.dia);

    if (hoje.getDate() <= diaGerar) {
      proximaData = new Date(ano, mes, diaGerar);
    } else {
      const proxMes = mes === 11 ? 0 : mes + 1;
      const proxAno = mes === 11 ? ano + 1 : ano;
      const diaProx = ajustarDiaParaUltimoDiaDoMes(proxAno, proxMes, rec.dia);
      proximaData = new Date(proxAno, proxMes, diaProx);
    }

  } else if (rec.tipo === 'quinzenal') {
    const diaBase = Math.min(rec.dia, 15);
    const ultimoDia = getUltimoDiaMes(hoje.getFullYear(), hoje.getMonth());
    const q1 = Math.min(diaBase, ultimoDia);
    const q2 = Math.min(diaBase + 15, ultimoDia);

    if (hoje.getDate() <= q1) {
      proximaData = new Date(hoje.getFullYear(), hoje.getMonth(), q1);
    } else if (q2 > q1 && hoje.getDate() <= q2) {
      proximaData = new Date(hoje.getFullYear(), hoje.getMonth(), q2);
    } else {
      const proxMes = hoje.getMonth() === 11 ? 0 : hoje.getMonth() + 1;
      const proxAno = hoje.getMonth() === 11 ? hoje.getFullYear() + 1 : hoje.getFullYear();
      const diaProx = Math.min(diaBase, getUltimoDiaMes(proxAno, proxMes));
      proximaData = new Date(proxAno, proxMes, diaProx);
    }

  } else if (rec.tipo === 'semanal' && rec.dia <= 7) {
    let diasAte = rec.dia - hoje.getDay();
    if (diasAte < 0) diasAte += 7;
    proximaData = new Date(hoje);
    proximaData.setDate(hoje.getDate() + diasAte);
  }

  // Verifica data de expiração
  if (rec.dataFim && proximaData && proximaData > new Date(rec.dataFim + 'T00:00:00')) {
    return null;
  }

  return proximaData;
}

/**
 * Verifica se uma recorrência deve ser gerada hoje.
 * @param {Object} rec
 * @returns {boolean}
 */
function verificarGeracaoHoje(rec) {
  const hoje = new Date();

  if (rec.tipo === 'mensal') {
    const diaGerar = ajustarDiaParaUltimoDiaDoMes(hoje.getFullYear(), hoje.getMonth(), rec.dia);
    return hoje.getDate() === diaGerar;
  }

  if (rec.tipo === 'quinzenal') {
    const diaBase = Math.min(rec.dia, 15);
    const ultimoDia = getUltimoDiaMes(hoje.getFullYear(), hoje.getMonth());
    const q1 = Math.min(diaBase, ultimoDia);
    const q2 = Math.min(diaBase + 15, ultimoDia);
    return hoje.getDate() === q1 || hoje.getDate() === q2;
  }

  if (rec.tipo === 'semanal') {
    return rec.dia === hoje.getDay();
  }

  return false;
}

/**
 * Processa todas as recorrências ativas e gera os lançamentos/compras
 * correspondentes se for o dia correto.
 * Chamado na inicialização e a cada 5 minutos.
 */
function processarRecorrencias() {
  const hoje = new Date();
  const hojeStr = formatarDataLocal(hoje);
  let houveAlteracoes = false;

  for (const rec of recorrencias) {
    if (!rec.ativo) continue;

    // Evita gerar duplicatas: só processa se ainda não gerou hoje
    if (rec.ultimaGeracao === hojeStr) continue;

    if (!verificarGeracaoHoje(rec)) continue;

    // Verifica data de expiração
    if (rec.dataFim && hoje > new Date(rec.dataFim + 'T00:00:00')) {
      rec.ativo = false;
      houveAlteracoes = true;
      continue;
    }

    if (rec.formaPagamento === 'cartao' && rec.cartaoId) {
      const cartao = cartoes.find(c => c.id === rec.cartaoId);
      if (cartao) {
        const dataCompra = new Date(hojeStr + 'T00:00:00');
        const diaCompra = dataCompra.getDate();
        
        // Se dia da compra >= fechamento, primeira parcela vai para o próximo mês
        const offsetMeses = diaCompra >= cartao.fechamento ? 1 : 0;
        
        compras.push({
          id: gerarId('rec_compra'),
          dataCompra: hojeStr,
          descricao: rec.descricao + ' (Recorrente)',
          categoria: rec.categoria,
          valorTotal: Math.abs(rec.valor),
          parcelas: 1,
          valorParcela: Math.abs(rec.valor),
          cartaoId: cartao.id,
          parcelasPagas: 0,
          primeiroVencimentoOffset: offsetMeses,
        });
        
        const dataVencimento = new Date(
          dataCompra.getFullYear(),
          dataCompra.getMonth() + offsetMeses,
          cartao.vencimento
        );
        const mesVencimento = dataVencimento.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
        showToast(`✅ ${rec.descricao} agendado! Entra na fatura de ${mesVencimento}.`);
      }
    } else {
      // Lança como transação avulsa
      lancamentos.push({
        id: gerarId('rec_trans'),
        data: hojeStr,
        descricao: rec.descricao + ' (Recorrente)',
        categoria: rec.categoria,
        valor: rec.valor,
        tipo: rec.valor > 0 ? 'receita' : 'despesa_avista',
        recorrenciaId: rec.id,
      });
      showToast(`✅ ${rec.descricao} lançado hoje!`);
    }

    // Marca que já foi gerado hoje para evitar duplicatas
    rec.ultimaGeracao = hojeStr;
    houveAlteracoes = true;
  }

  if (houveAlteracoes) {
    // Invalida o cache após alterações
    if (typeof invalidarCacheLancamentos === 'function') {
      invalidarCacheLancamentos();
    }
    salvarTudo();
    renderTudo();
  }
}

// ---------- Renderização da aba Recorrências ----------

/**
 * Renderiza a lista de recorrências e a central de assinaturas.
 */
function renderRecorrenciasTab() {
  const container = document.getElementById('recorrencias-list');
  const containerAss = document.getElementById('assinaturas-list');
  if (!container) return;

  if (recorrencias.length === 0) {
    container.innerHTML = '<div class="empty-state-modern"><div class="icon">🔄</div><div class="title">Nenhuma recorrência</div></div>';
    if (containerAss) containerAss.innerHTML = '<div class="empty-state-modern"><div class="icon">📱</div><div class="title">Nenhuma assinatura ativa</div></div>';
    return;
  }

  container.innerHTML = '';

  const receitas = recorrencias.filter(r => r.valor > 0);
  const despesas = recorrencias.filter(r => r.valor < 0);

  // -- Receitas recorrentes --
  if (receitas.length > 0) {
    const totalReceitas = receitas.filter(r => r.ativo).reduce((s, r) => s + r.valor, 0);
    container.innerHTML += _renderCabecalhoRecorrencia('💰', 'Receitas Recorrentes', 'var(--success-light)', 'var(--success)', totalReceitas);
    receitas.forEach(r => { container.innerHTML += _renderCardRecorrencia(r, 'receita'); });
  }

  // -- Despesas recorrentes --
  if (despesas.length > 0) {
    const totalDespesas = despesas.filter(r => r.ativo).reduce((s, r) => s + Math.abs(r.valor), 0);
    container.innerHTML += _renderCabecalhoRecorrencia('💸', 'Despesas Recorrentes', 'var(--danger-light)', 'var(--danger)', totalDespesas, true);
    despesas.forEach(r => { container.innerHTML += _renderCardRecorrencia(r, 'despesa'); });
  }

  // -- Central de assinaturas (apenas despesas ativas) --
  _renderCentralAssinaturas(containerAss);

  atualizarPrevisaoFinanceira();
}

/** @private Gera o HTML do cabeçalho de grupo de recorrências. */
function _renderCabecalhoRecorrencia(icon, titulo, bgColor, textColor, total, comMargem = false) {
  return `
    <div class="rec-grupo-header" style="margin-top:${comMargem ? 'var(--margin-lg)' : '0'};background:${bgColor};">
      <span class="rec-grupo-icon">${icon}</span>
      <span class="rec-grupo-titulo" style="color:${textColor};">${titulo}</span>
      <span class="rec-grupo-total">Total: ${formatMoney(total)}</span>
    </div>`;
}

/** @private Gera o HTML de um card de recorrência (receita ou despesa). */
function _renderCardRecorrencia(r, tipo) {
  const hoje    = new Date();
  const proxima = calcularProximaDataRecorrencia(r);
  const gerarHoje  = verificarGeracaoHoje(r);
  const formaTexto = r.formaPagamento === 'cartao' ? '💳 Crédito' : '🏦 Débito/Pix';
  const prefixo    = tipo === 'receita' ? '+' : '-';

  let statusTexto = '', statusClasse = '';
  if (!r.ativo) {
    statusTexto = '⏸️ Pausado';
  } else if (gerarHoje) {
    statusTexto = '⚡ Gerar hoje!';
    statusClasse = 'hoje';
  } else if (proxima) {
    const dataF = proxima.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    const dias  = Math.ceil((proxima - hoje) / 86_400_000);
    statusTexto = dias <= 1 ? `📌 Amanhã (${dataF})` : `📅 ${dataF} — em ${dias}d`;
  }

  return `
    <div class="rec-card ${r.ativo ? '' : 'pausado'}">
      <div class="rec-card-top">
        <div class="rec-card-info">
          <div class="rec-card-nome">${escapeHtml(r.descricao)}</div>
          <div class="rec-card-meta">${r.tipo} • Dia ${r.dia} • ${formaTexto}</div>
        </div>
        <div>
          <div class="rec-card-valor ${tipo}">${prefixo}${formatMoney(Math.abs(r.valor))}</div>
          <div class="rec-card-status ${statusClasse}">${statusTexto}</div>
        </div>
      </div>
      <div class="rec-card-acoes">
        <button class="rec-card-btn editar"  onclick="editarRecorrencia('${r.id}')">✏️ Editar</button>
        <button class="rec-card-btn ${r.ativo ? 'pausar' : 'ativar'}" onclick="toggleStatusRecorrencia('${r.id}')">
          ${r.ativo ? '⏸️ Pausar' : '▶️ Ativar'}
        </button>
        <button class="rec-card-btn excluir" onclick="excluirRecorrencia('${r.id}')">🗑️</button>
      </div>
    </div>`;
}

/** @private Renderiza a central de assinaturas ativas (despesas recorrentes). */
function _renderCentralAssinaturas(containerAss) {
  if (!containerAss) return;
  const assinaturas = recorrencias.filter(r => r.valor < 0 && r.ativo);

  if (assinaturas.length === 0) {
    containerAss.innerHTML = '<div class="empty-state-modern"><div class="icon">📱</div><div class="title">Nenhuma assinatura ativa</div></div>';
    return;
  }

  const total = assinaturas.reduce((s, r) => s + Math.abs(r.valor), 0);
  const el = document.getElementById('total-assinaturas');
  if (el) el.textContent = `Total: ${formatMoney(total)}`;

  containerAss.innerHTML = '';
  assinaturas.forEach(a => {
    const proxima = calcularProximaDataRecorrencia(a);
    const pct = total > 0 ? ((Math.abs(a.valor) / total) * 100) : 0;
    const proximaStr = proxima ? proxima.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : '—';

    containerAss.innerHTML += `
      <div class="assinaturas-card">
        <div class="rec-assn-row">
          <div>
            <div class="rec-assn-nome">${escapeHtml(a.descricao)}</div>
            <div class="rec-assn-sub">Dia ${a.dia} • Próx: ${proximaStr}</div>
          </div>
          <div class="rec-assn-right">
            <div style="font-weight:700;color:var(--danger);">${formatMoney(Math.abs(a.valor))}</div>
            <div class="rec-assn-pct">${pct.toFixed(0)}%</div>
          </div>
        </div>
        <div class="rec-assn-barra-bg">
          <div class="rec-assn-barra-fill" style="width:${pct}%;"></div>
        </div>
      </div>`;
  });
}

// ---------- CRUD de recorrências ----------

/**
 * Abre o modal de edição de uma recorrência existente.
 * @param {string} id
 */
function editarRecorrencia(id) {
  const r = recorrencias.find(x => x.id === id);
  if (!r) return;

  // Configura o campo "dia" conforme a frequência
  let diaConfig = { label: 'Dia do mês (1-31)', min: 1, max: 31 };
  
  if (r.tipo === 'semanal') {
    diaConfig = { label: 'Dia da semana (0=Domingo a 6=Sábado)', min: 0, max: 6 };
  } else if (r.tipo === 'quinzenal') {
    diaConfig = { label: 'Dia base (1-15)', min: 1, max: 15 };
  }

  perguntarForm({
    icone: '🔄',
    titulo: 'Editar recorrência',
    textoBotao: 'Salvar',
    campos: [
      {
        campo: 'nome',
        label: 'Nome da recorrência',
        valorInicial: r.descricao,
        required: true,
      },
      {
        campo: 'dia',
        label: diaConfig.label,
        tipo: 'number',
        valorInicial: r.dia,
        min: diaConfig.min,
        max: diaConfig.max,
        required: true,
      },
      {
        campo: 'valor',
        label: 'Valor',
        tipo: 'money',
        valorInicial: Math.abs(r.valor),
        required: true,
      },
    ],
  }, ({ nome, dia, valor }) => {
    const novoDia = parseInt(dia);
    const novoValor = currencyToNumber(valor);
    
    if (!nome.trim()) {
      showToast('Nome inválido', true);
      return;
    }
    
    if (isNaN(novoDia) || novoDia < diaConfig.min || novoDia > diaConfig.max) {
      showToast(`Dia inválido (deve ser ${diaConfig.min} a ${diaConfig.max})`, true);
      return;
    }
    
    if (isNaN(novoValor) || novoValor <= 0) {
      showToast('Valor inválido', true);
      return;
    }
    
    r.descricao = nome.trim();
    r.dia = novoDia;
    r.valor = r.valor > 0 ? Math.abs(novoValor) : -Math.abs(novoValor);
    
    // Invalida o cache após alterações
    if (typeof invalidarCacheLancamentos === 'function') {
      invalidarCacheLancamentos();
    }
    
    salvarTudo();
    renderRecorrenciasTab();
    showToast('✅ Recorrência atualizada!');
  });
}

/**
 * Alterna o status ativo/pausado de uma recorrência.
 * @param {string} id
 */
function toggleStatusRecorrencia(id) {
  const r = recorrencias.find(x => x.id === id);
  if (r) {
    r.ativo = !r.ativo;
    
    // Invalida o cache após alterações
    if (typeof invalidarCacheLancamentos === 'function') {
      invalidarCacheLancamentos();
    }
    
    salvarTudo();
    renderRecorrenciasTab();
    showToast(r.ativo ? 'Ativada!' : 'Pausada!');
  }
}

/**
 * Remove permanentemente uma recorrência.
 * @param {string} id
 */
function excluirRecorrencia(id) {
  const r = recorrencias.find(x => x.id === id);
  if (!r) return;

  confirmar({
    icone: '🗑️',
    titulo: `Excluir "${r.descricao}"?`,
    mensagem: 'Os lançamentos já gerados não serão afetados.',
    textoBotao: 'Excluir',
    perigo: true,
  }, () => {
    recorrencias = recorrencias.filter(x => x.id !== id);
    
    // Invalida o cache após alterações
    if (typeof invalidarCacheLancamentos === 'function') {
      invalidarCacheLancamentos();
    }
    
    salvarTudo();
    renderRecorrenciasTab();
    showToast('Removida!');
  });
}

/**
 * Atualiza os valores exibidos no card de previsão financeira.
 */
function atualizarPrevisaoFinanceira() {
  const receitasFixas = recorrencias.filter(r => r.ativo && r.valor > 0).reduce((s, r) => s + r.valor, 0);
  const despesasFixas = recorrencias.filter(r => r.ativo && r.valor < 0).reduce((s, r) => s + Math.abs(r.valor), 0);
  const compromissos = compras.reduce((s, c) => s + ((c.parcelas - c.parcelasPagas) * c.valorParcela), 0);
  const saldoPrevisto = calcularSaldoReal() + receitasFixas - despesasFixas;

  document.getElementById('previsao-receitas').textContent = formatMoney(receitasFixas);
  document.getElementById('previsao-despesas').textContent = formatMoney(despesasFixas);
  document.getElementById('previsao-compromissos').textContent = formatMoney(compromissos);

  const elSaldo = document.getElementById('previsao-saldo');
  elSaldo.textContent = formatMoney(saldoPrevisto);
  elSaldo.style.color = saldoPrevisto < 0 ? '#ff6b6b' : '#ffffff';
}