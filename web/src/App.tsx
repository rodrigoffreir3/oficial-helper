import { useState, useEffect } from 'react';
import { useHighPrecisionGPS } from './hooks/useHighPrecisionGPS';
import { db, type DiligenciaLocal } from './store/db';
import { syncPendentes } from './services/sync';

function App() {
  // 1. Hooks customizados e Estado da Interface
  const { data: gpsData, error: gpsError, loading: gpsLoading, captureLocation } = useHighPrecisionGPS();
  const [diligencias, setDiligencias] = useState<DiligenciaLocal[]>([]);
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

  // 2. Carrega o histórico (com filtro de busca opcional)
  const carregarDiligencias = async (termoDeBusca = busca) => {
    const todos = await db.diligencias.orderBy('created_at').reverse().toArray();
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
  };

  useEffect(() => {
    carregarDiligencias();
    syncPendentes().then(() => carregarDiligencias());
  }, []);

  // 3. Ação Principal: Criar NOVO registro do zero
  const handleSalvarNovo = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!gpsData) {
      alert("Capture a localização primeiro!");
      return;
    }

    const novoRegistro: DiligenciaLocal = {
      id: crypto.randomUUID(),
      nome_alvo: nome,
      telefone: telefone,
      numero_mandado: mandado,
      latitude: gpsData.latitude,
      longitude: gpsData.longitude,
      precisao: gpsData.accuracy,
      status: 'pendente',
      observacao: observacao,
      created_at: new Date().toISOString(),
      synced: 0
    };

    await db.diligencias.add(novoRegistro);

    setNome('');
    setTelefone('');
    setMandado('');
    setObservacao('');

    await syncPendentes();
    carregarDiligencias();
  };

  // 4. Ação Secundária: Atualizar contato importado que estava sem GPS
  const vincularGpsAoContato = async (idContato: string) => {
    if (!gpsData) {
      alert("Por favor, clique em 'Capturar Localização Atual' no painel azul lá em cima primeiro!");
      return;
    }

    await db.diligencias.update(idContato, {
      latitude: gpsData.latitude,
      longitude: gpsData.longitude,
      precisao: gpsData.accuracy,
      synced: 0
    });

    await syncPendentes();
    carregarDiligencias();
  };

  // 5. Utilitários (Importar CSV e Abrir Mapas)
  const handleImportarCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n');
      const novosContatos: DiligenciaLocal[] = [];

      for (const line of lines) {
        const [csvNome, csvTel] = line.split(',');

        if (csvNome && csvNome.trim() !== '') {
          novosContatos.push({
            id: crypto.randomUUID(),
            nome_alvo: csvNome.trim(),
            telefone: csvTel ? csvTel.trim() : '',
            numero_mandado: '',
            latitude: 0,
            longitude: 0,
            precisao: 0,
            status: 'pendente',
            observacao: 'Importado da base antiga',
            created_at: new Date().toISOString(),
            synced: 0
          });
        }
      }

      if (novosContatos.length > 0) {
        await db.diligencias.bulkAdd(novosContatos);
        carregarDiligencias();
        syncPendentes();
        alert(`${novosContatos.length} contatos importados com sucesso!`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
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

        <label className="btn-ios" style={{ background: '#e5e5ea', color: '#1c1c1e', padding: '8px 14px', fontSize: '13px', cursor: 'pointer' }}>
          📂 Importar CSV
          <input type="file" accept=".csv" onChange={handleImportarCSV} style={{ display: 'none' }} />
        </label>
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
                // Leve matiz amarela no vidro se faltar GPS
                background: faltaGps ? 'rgba(255, 204, 0, 0.15)' : 'var(--glass-bg)'
              }}>

                <div
                  onClick={() => toggleContato(d.id)}
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
                      {d.synced === 1 ? ' • ☁️ Nuvem' : ' • 📱 Aparelho'}
                    </p>

                    {faltaGps ? (
                      <button
                        className="btn-ios"
                        onClick={() => vincularGpsAoContato(d.id)}
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