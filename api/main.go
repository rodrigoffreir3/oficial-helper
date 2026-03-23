package main

import (
	"context"
	"log"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
)

// dbPool será usado globalmente para as consultas (Simplicidade)
var dbPool *pgxpool.Pool

func main() {
	// 1. Carrega as variáveis do .env
	if err := godotenv.Load(); err != nil {
		log.Println("Aviso: Arquivo .env não encontrado. Usando variáveis de ambiente do sistema.")
	}

	// 2. Conecta ao PostgreSQL
	connStr := os.Getenv("DATABASE_URL")
	var err error
	dbPool, err = pgxpool.New(context.Background(), connStr)
	if err != nil {
		log.Fatalf("Erro fatal: Não foi possível conectar ao banco de dados: %v\n", err)
	}
	defer dbPool.Close()

	log.Println("Conectado ao PostgreSQL com sucesso!")

	// 3. Configura o Roteador (Chi)
	r := chi.NewRouter()

	// Middlewares básicos para estabilidade e log
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	// Configuração do CORS (Vital para o React/Vite não ser bloqueado)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"http://localhost:5173"}, // Porta padrão do Vite
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Rota de teste para garantir que o server está de pé
	r.Get("/ping", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("pong - Oficial Helper API operante!"))
	})

	RegisterRoutes(r)

	// 4. Inicia o Servidor
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Servidor rodando na porta :%s\n", port)
	http.ListenAndServe(":"+port, r)
}
