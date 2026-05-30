// =============================================================================
// migration.js — Migração de dados para versão com segurança
// =============================================================================

function migrarParaVersaoComSeguranca() {
  const versionKey = 'fin_version';
  const currentVersion = localStorage.getItem(versionKey) || '1.0';
  
  if (currentVersion < '2.0') {
    // Remove dados antigos de segurança se existirem em formato diferente
    const oldSecurity = localStorage.getItem('fin_pin');
    if (oldSecurity) {
      localStorage.removeItem('fin_pin');
    }
    
    localStorage.setItem(versionKey, '2.0');
    console.log('[Migration] Atualizado para versão com segurança');
  }
}

// Executa migração
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', migrarParaVersaoComSeguranca);
} else {
  migrarParaVersaoComSeguranca();
}