// =============================================================================
// migration.js — Migrações de versão
// Responsabilidades:
//   1. Limpar chaves antigas de segurança (fin_pin → fin_security_v1)
//   2. Documentar o caminho localStorage → IndexedDB
//      (a migração de dados em si é feita em storage.js → carregarDados)
// =============================================================================

function executarMigracoes() {
  const versionKey    = 'fin_version';
  const currentVersion = localStorage.getItem(versionKey) || '1.0';

  // v2.0 — chave de segurança antiga
  if (currentVersion < '2.0') {
    const oldPin = localStorage.getItem('fin_pin');
    if (oldPin) localStorage.removeItem('fin_pin');
    localStorage.setItem(versionKey, '2.0');
    console.log('[Migration] → 2.0: chave fin_pin removida');
  }

  // v3.0 — migração localStorage → IndexedDB
  // A transferência real dos dados acontece em carregarDados() (storage.js):
  //   carregarDados() lê do IDB, se vazio lê do localStorage,
  //   salva no IDB e apaga o localStorage.
  // Aqui apenas registramos a versão para não repetir log.
  if (currentVersion < '3.0') {
    localStorage.setItem(versionKey, '3.0');
    console.log('[Migration] → 3.0: persistência migrada para IndexedDB');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', executarMigracoes);
} else {
  executarMigracoes();
}
