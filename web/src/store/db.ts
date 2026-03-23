import Dexie, { type Table } from 'dexie';

export interface DiligenciaLocal {
  id: string; 
  nome_alvo: string;
  telefone: string;
  numero_mandado: string;
  latitude: number;
  longitude: number;
  precisao: number; 
  status: string; 
  observacao: string;
  created_at: string; 
  synced: number; 
}

export class OficialHelperDB extends Dexie {
  diligencias!: Table<DiligenciaLocal>;

  constructor() {
    super('OficialHelperDatabase');
    
    // ATUALIZAÇÃO PARA A VERSÃO 3:
    // Adicionamos o 'created_at' aqui no final para o comando orderBy() funcionar!
    this.version(3).stores({
      diligencias: 'id, nome_alvo, telefone, synced, created_at' 
    });
  }
}

export const db = new OficialHelperDB();