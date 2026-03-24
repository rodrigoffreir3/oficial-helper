import { useState, useEffect } from 'react';
import { useHighPrecisionGPS } from './hooks/useHighPrecisionGPS';
import { db } from './store/firebase';
import { collection, getDocs, addDoc, updateDoc, doc, query, orderBy, writeBatch } from 'firebase/firestore';
import { Contacts } from '@capacitor-community/contacts';

// Definimos o tipo direto aqui agora
export interface Diligencia {
  id?: string;
  nome_alvo: string;
  telefone: string;
  numero_mandado: string;
  latitude: number;
  longitude: number;
  precisao: number;
  status: string;
  observacao: string;
  created_at: string;
}

function App() {
  // 1. Hooks customizados e Estado da Interface
  const { data: gpsData, error: gpsError, loading: gpsLoading, captureLocation } = useHighPrecisionGPS();
  const [diligencias, setDiligencias] = useState<Diligencia[]>([]);
  const [totalContatos, setTotalContatos] = useState(0);

  // Estado do Formulário Novo
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [mandado, setMandado] = useState('');
  const [observacao, setObservacao] = useState('');

  // Estado da Busca e UX (Acordeão e Lista Oculta)
  const [busca, setBusca] = useState('');
  const [mostrarLista, setMostrarLista] = useState(false);
  const [contatoExpandidoId, setContatoExpandidoId] = useState<string | null>(null);

  // 2. Carrega o histórico do Firestore
  const carregarDiligencias = async (termoDeBusca = busca) => {
    try {
      const q = query(collection(db, "diligencias"), orderBy("created_at", "desc"));
      const querySnapshot = await getDocs(q);

      const todos: Diligencia[] = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Diligencia[];

      setTotalContatos(todos.length);

      if (termoDeBusca) {
        const lowerTerm = termoDeBusca.toLowerCase();
        const filtrados = todos.filter(d =>
          d.nome_alvo.toLowerCase().includes(lowerTerm) ||
          d.telefone.includes(termoDeBusca)
        );
        setDiligencias(filtrados);
        setMostrarLista(true);
      } else {
        setDiligencias(todos);
      }
    } catch (error) {
      console.error("Erro ao buscar diligências: ", error);
    }
  };

  useEffect(() => {
    carregarDiligencias();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 3. Ação Principal: Criar NOVO registro direto no Firestore
  const handleSalvarNovo = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!gpsData) {
      alert("Capture a localização primeiro!");
      return;
    }

    const novoRegistro = {
      nome_alvo: nome,
      telefone: telefone,
      numero_mandado: mandado,
      latitude: gpsData.latitude,
      longitude: gpsData.longitude,
      precisao: gpsData.accuracy,
      status: 'pendente',
      observacao: observacao,
      created_at: new Date().toISOString()
    };

    try {
      await addDoc(collection(db, "diligencias"), novoRegistro);

      setNome('');
      setTelefone('');
      setMandado('');
      setObservacao('');

      carregarDiligencias();
    } catch (error) {
      console.error("Erro ao salvar: ", error);
      alert("Erro ao salvar o registro.");
    }
  };

  // 4. Ação Secundária: Atualizar contato importado que estava sem GPS
  const vincularGpsAoContato = async (idContato: string) => {
    if (!gpsData) {
      alert("Por favor, clique em 'Capturar Localização Atual' no painel azul lá em cima primeiro!");
      return;
    }

    try {
      const contatoRef = doc(db, "diligencias", idContato);
      await updateDoc(contatoRef, {
        latitude: gpsData.latitude,
        longitude: gpsData.longitude,
        precisao: gpsData.accuracy
      });

      carregarDiligencias();
    } catch (error) {
      console.error("Erro ao vincular GPS: ", error);
    }
  };

  // 5. NOVA FUNÇÃO: Sincronizar contatos nativos do celular em Lotes (Anti-travamento)
  const sincronizarAgenda = async () => {
    try {
      // Pede permissão ao Android
      const perm = await Contacts.requestPermissions();
      if (perm.contacts !== 'granted') {
        alert('Você precisa permitir o acesso aos contatos para sincronizar.');
        return;
      }

      alert('Lendo agenda... Isso pode levar alguns segundos dependendo da quantidade de contatos.');

      // Puxa os contatos do telefone
      const result = await Contacts.getContacts({
        projection: { name: true, phones: true }
      });

      // Trava anti-duplicação: cria uma lista com os nomes que já temos no Firebase
      const nomesExistentes = new Set(diligencias.map(d => d.nome_alvo.trim().toLowerCase()));

      const novosContatos = result.contacts.filter(c => {
        const nomeContato = c.name?.display;
        if (!nomeContato) return false; // Ignora contatos sem nome
        // Só passa se o nome AINDA NÃO EXISTE no nosso banco
        return !nomesExistentes.has(nomeContato.trim().toLowerCase());
      });

      if (novosContatos.length === 0) {
        alert('Tudo atualizado! Nenhum contato novo encontrado na agenda.');
        return;
      }

      // Fatiamento em lotes de 490 para respeitar o limite do Firebase
      const TAMANHO_LOTE = 490;
      let contagem = 0;

      for (let i = 0; i < novosContatos.length; i += TAMANHO_LOTE) {
        const pedaco = novosContatos.slice(i, i + TAMANHO_LOTE);
        const batch = writeBatch(db);

        for (const c of pedaco) {
          const nome = c.name?.display || 'Sem Nome';
          const tel = (c.phones && c.phones.length > 0) ? c.phones[0].number : '';

          const docRef = doc(collection(db, "diligencias"));
          batch.set(docRef, {
            nome_alvo: nome,
            telefone: tel,
            numero_mandado: '',
            latitude: 0,
            longitude: 0,
            precisao: 0,
            status: 'pendente',
            observacao: 'Sincronizado da agenda do celular',
            created_at: new Date().toISOString()
          });
          contagem++;
        }

        // Dispara o lote para o Firebase
        await batch.commit();
      }

      carregarDiligencias();
      alert(`${contagem} novos contatos sincronizados com sucesso!`);

    } catch (error) {
      console.error(error);
      alert('Erro ao tentar ler a agenda do celular.');
    }
  };

  const abrirWaze = (lat: number, lng: number) => {
    window.location.href = `waze://?ll=${lat},${lng}&navigate=yes`;
  };

  const abrirGoogleMaps = (lat: number, lng: number) => {
    window.location.href = `comgooglemaps://?q=${lat},${lng}`;
  };

  const abrirAppleMaps = (lat: number, lng: number) => {
    window.location.href = `maps://?daddr=${lat},${lng}&dirflg=d`;
  };

  const toggleContato = (id: string) => {
    setContatoExpandidoId(contatoExpandidoId === id ? null : id);
  };

  return (
    <div style={{ padding: '24px 20px', maxWidth: '600px', margin: '0 auto' }}>

      <h2 style={{ fontSize: '28px', fontWeight: '700', letterSpacing: '-0.5px', marginBottom: '24px', color: '#1c1c1e' }}>
        📍 Oficial Helper
      </h2>

      {/* PAINEL DE GPS GLOBAL (Estilo Apple Widget) */}
      <div className="glass-panel" style={{ padding: '20px', marginBottom: '24px' }}>
        <button
          className="btn-ios"
          type="button"
          onClick={captureLocation}
          disabled={gpsLoading}
          style={{ padding: '16px', fontSize: '16px', width: '100%', background: '#007aff', color: 'white' }}
        >
          {gpsLoading ? '📡 Buscando Satélite...' : '📍 1. Capturar Localização Atual'}
        </button>
        {gpsError && <p style={{ color: '#ff3b30', marginTop: '12px', fontSize: '14px', fontWeight: '500' }}>{gpsError}</p>}
        {gpsData && !gpsLoading && (
          <p style={{ color: '#34c759', marginTop: '12px', fontSize: '14px', fontWeight: '600' }}>
            ✓ GPS travado no alvo! Precisão: {Math.round(gpsData.accuracy)}m. (Pronto para uso)
          </p>
        )}
      </div>

      {/* FORMULÁRIO DE NOVO REGISTRO */}
      <form onSubmit={handleSalvarNovo} className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '36px', padding: '20px' }}>
        <h4 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: '600' }}>Cadastrar Novo Alvo</h4>

        <input
          type="text"
          placeholder="Nome do Alvo / Local"
          required
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="glass-input"
        />

        <div style={{ display: 'flex', gap: '12px' }}>
          <input
            type="tel"
            placeholder="Telefone"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            className="glass-input"
          />
          <input
            type="text"
            placeholder="Nº Mandado"
            value={mandado}
            onChange={(e) => setMandado(e.target.value)}
            className="glass-input"
          />
        </div>

        <textarea
          placeholder="Observação (Ex: cachorro bravo)"
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          className="glass-input"
          style={{ minHeight: '80px', resize: 'vertical' }}
        />

        <button
          className="btn-ios"
          type="submit"
          disabled={!gpsData}
          style={{ padding: '16px', fontSize: '16px', background: gpsData ? '#34c759' : '#d1d1d6', color: 'white', marginTop: '8px' }}
        >
          2. Salvar Novo Registro
        </button>
      </form>

      {/* ÁREA DE BUSCA E CRM */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, fontSize: '22px', fontWeight: '600' }}>Meus Contatos</h3>

        {/* NOVO BOTÃO DE SINCRONIZAÇÃO NATIVA */}
        <button
          onClick={sincronizarAgenda}
          className="btn-ios"
          style={{ background: '#34c759', color: '#fff', padding: '8px 14px', fontSize: '13px', fontWeight: 'bold' }}
        >
          📱 Sincronizar Agenda
        </button>
      </div>

      <input
        type="text"
        placeholder="🔍 Buscar por nome ou telefone..."
        value={busca}
        onChange={(e) => {
          setBusca(e.target.value);
          carregarDiligencias(e.target.value);
        }}
        className="glass-input"
        style={{ marginBottom: '16px', background: 'rgba(255, 255, 255, 0.8)' }}
      />

      {/* BOTÃO INTELIGENTE (TOGGLE) PARA MOSTRAR/RECOLHER LISTA */}
      {!mostrarLista && busca === '' && totalContatos > 0 && (
        <button
          className="btn-ios glass-panel"
          onClick={() => setMostrarLista(true)}
          style={{ width: '100%', padding: '16px', fontSize: '16px', color: '#007aff', marginBottom: '16px' }}
        >
          👀 Abrir lista com todos os {totalContatos} contatos
        </button>
      )}

      {/* LISTA RENDERIZADA APENAS SE ABERTA OU BUSCANDO */}
      {mostrarLista && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingBottom: '40px' }}>

          {/* BOTÃO RECOLHER NO TOPO DA LISTA */}
          {busca === '' && (
            <button
              className="btn-ios glass-panel"
              onClick={() => setMostrarLista(false)}
              style={{ width: '100%', padding: '12px', fontSize: '14px', color: '#ff3b30', marginBottom: '8px' }}
            >
              🙈 Recolher lista de contatos
            </button>
          )}

          {diligencias.map((d) => {
            const isExpanded = contatoExpandidoId === d.id;
            const faltaGps = d.latitude === 0;

            return (
              <div key={d.id} className="glass-panel" style={{
                overflow: 'hidden',
                background: faltaGps ? 'rgba(255, 204, 0, 0.15)' : 'var(--glass-bg)'
              }}>

                <div
                  onClick={() => toggleContato(d.id as string)}
                  style={{ padding: '18px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <h4 style={{ margin: 0, fontSize: '16px', fontWeight: '500' }}>{d.nome_alvo}</h4>
                  <span style={{ fontSize: '14px', color: '#8e8e93' }}>{isExpanded ? '▲' : '▼'}</span>
                </div>

                {isExpanded && (
                  <div style={{ padding: '0 18px 18px 18px', borderTop: '1px solid rgba(0,0,0,0.05)', marginTop: '4px', paddingTop: '16px' }}>
                    {d.telefone && <p style={{ margin: '0 0 8px 0', fontSize: '15px' }}>📞 {d.telefone}</p>}

                    <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: '#8e8e93' }}>
                      {new Date(d.created_at).toLocaleDateString('pt-BR')}
                      {' • ☁️ Firebase Sync'}
                    </p>

                    {faltaGps ? (
                      <button
                        className="btn-ios"
                        onClick={() => vincularGpsAoContato(d.id as string)}
                        style={{ padding: '14px', width: '100%', background: '#ffcc00', color: '#000', fontSize: '15px' }}
                      >
                        📍 Vincular Coordenada a este Contato
                      </button>
                    ) : (
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button className="btn-ios" onClick={() => abrirAppleMaps(d.latitude, d.longitude)} style={{ flex: 1, minWidth: '80px', padding: '12px', background: '#000', color: '#fff', fontSize: '14px' }}>
                          Apple Maps
                        </button>
                        <button className="btn-ios" onClick={() => abrirGoogleMaps(d.latitude, d.longitude)} style={{ flex: 1, minWidth: '80px', padding: '12px', background: '#ea4335', color: '#fff', fontSize: '14px' }}>
                          G. Maps
                        </button>
                        <button className="btn-ios" onClick={() => abrirWaze(d.latitude, d.longitude)} style={{ flex: 1, minWidth: '80px', padding: '12px', background: '#33ccff', color: '#000', fontSize: '14px' }}>
                          Waze
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {diligencias.length === 0 && <p style={{ color: '#8e8e93', textAlign: 'center', marginTop: '20px' }}>Nenhum contato encontrado.</p>}
        </div>
      )}
    </div>
  );
}

export default App;