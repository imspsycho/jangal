# Jàngal — developer shortcuts
.PHONY: demo test up down logs clean seed smoke ui

up:
	docker compose up --build -d
	@echo "app: http://localhost:3000 (seed runs on first boot)"

down:
	docker compose down

clean:
	docker compose down -v

logs:
	docker compose logs -f app

# end-to-end test against a running instance (docker or mock)
smoke:
	cd backend && node src/smoke.js

# UI development without containers (simulated LND)
ui:
	cd backend && LND_MODE=mock node src/index.js &
	cd frontend && npm run dev

# full e2e in containers: boot, wait, test, leave running
demo:
	docker compose up --build -d
	@echo "waiting for seed (wallets + channel)…"
	@for i in $$(seq 1 60); do curl -sf http://localhost:3000/api/health >/dev/null && break; sleep 3; done
	cd backend && node src/smoke.js
	@echo "✔ demo ready at http://localhost:3000 (codes: 1111 parent · 3333 school · 2222 family)"
