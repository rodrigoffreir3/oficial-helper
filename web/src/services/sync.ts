import { db } from '../store/db';

// Por enquanto aponta para o Go local. Depois, na VPS, isso virá de um .env
const API_URL = 'http://localhost:8080/api/sync';

export const syncPendentes = async () => {
  try {
    // 1. Busca no IndexedDB todos os registros que ainda não subiram para a VPS
    const pendentes = await db.diligencias.where('synced').equals(0).toArray();

    if (pendentes.length === 0) {
      console.log('Tudo em dia. Nada para sincronizar.');
      return;
    }

    console.log(`Tentando sincronizar ${pendentes.length} registro(s) com a VPS...`);

    // 2. Dispara o lote inteiro para a nossa rota no Go
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(pendentes),
    });

    // 3. O Go nos devolve HTTP 201 (Created) se deu tudo certo lá no Postgres
    if (response.ok) {
      // Extrai apenas os IDs dos registros que acabamos de enviar
      const idsSincronizados = pendentes.map(p => p.id);

      // Atualiza o IndexedDB para não mandar esses caras de novo no futuro
      await db.diligencias.where('id').anyOf(idsSincronizados).modify({ synced: 1 });
      
      console.log('✅ Sincronização concluída com sucesso!');
    } else {
      console.error('❌ Falha na sincronização. O backend rejeitou o lote.');
    }
  } catch (error) {
    // Esse catch é esperado e não é um bug. 
    // Ele cai aqui quando ela estiver na rua sem 4G ou se a sua VPS cair.
    console.warn('📡 Sem conexão com o servidor no momento. Os dados continuam salvos no iPad.');
  }
};