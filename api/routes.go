package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// Diligencia reflete os 1200 contatos + telefone + coordenadas
type Diligencia struct {
	ID            uuid.UUID `json:"id"`
	NomeAlvo      string    `json:"nome_alvo"`
	Telefone      string    `json:"telefone"` // <-- NOVO CAMPO
	NumeroMandado string    `json:"numero_mandado"`
	Latitude      float64   `json:"latitude"`
	Longitude     float64   `json:"longitude"`
	Precisao      float64   `json:"precisao"`
	Status        string    `json:"status"`
	Observacao    string    `json:"observacao"`
	CreatedAt     time.Time `json:"created_at"`
	SyncedAt      time.Time `json:"synced_at"`
}

func RegisterRoutes(r *chi.Mux) {
	r.Post("/api/sync", handleSync)
	r.Get("/api/diligencias", listDiligencias)
}

// handleSync: Agora faz o UPSERT (Insere se for novo, Atualiza se ela marcou o GPS num contato antigo)
func handleSync(w http.ResponseWriter, r *http.Request) {
	var data []Diligencia

	if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
		http.Error(w, "JSON inválido enviado pelo frontend", http.StatusBadRequest)
		return
	}

	for _, d := range data {
		// A MÁGICA DO UPSERT ENTRA AQUI!
		// Passamos o ID (gerado no iPad) explicitamente. Se der conflito nesse ID, ele atualiza as coordenadas.
		_, err := dbPool.Exec(context.Background(),
			`INSERT INTO diligencias (id, nome_alvo, telefone, numero_mandado, latitude, longitude, precisao, status, observacao, created_at, synced_at)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
			 ON CONFLICT (id) DO UPDATE 
			 SET latitude = EXCLUDED.latitude, 
				 longitude = EXCLUDED.longitude, 
				 precisao = EXCLUDED.precisao,
				 telefone = EXCLUDED.telefone,
				 observacao = EXCLUDED.observacao,
				 synced_at = NOW()`,
			d.ID, d.NomeAlvo, d.Telefone, d.NumeroMandado, d.Latitude, d.Longitude, d.Precisao, d.Status, d.Observacao, d.CreatedAt)

		if err != nil {
			log.Printf("Erro ao salvar/atualizar registro '%s': %v", d.NomeAlvo, err)
		}
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"status": "Sincronização concluída"})
}

// listDiligencias: Traz o telefone na consulta também
func listDiligencias(w http.ResponseWriter, r *http.Request) {
	rows, err := dbPool.Query(context.Background(),
		`SELECT id, nome_alvo, telefone, numero_mandado, latitude, longitude, precisao, status, observacao, created_at 
		 FROM diligencias ORDER BY created_at DESC`)

	if err != nil {
		http.Error(w, "Erro ao consultar o banco de dados", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var lista []Diligencia
	for rows.Next() {
		var d Diligencia
		err := rows.Scan(&d.ID, &d.NomeAlvo, &d.Telefone, &d.NumeroMandado, &d.Latitude, &d.Longitude, &d.Precisao, &d.Status, &d.Observacao, &d.CreatedAt)
		if err != nil {
			log.Printf("Erro ao ler linha: %v", err)
			continue
		}
		lista = append(lista, d)
	}

	if lista == nil {
		lista = []Diligencia{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(lista)
}
