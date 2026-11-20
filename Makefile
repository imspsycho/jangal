# Jàngal — developer shortcuts
.PHONY: demo test up down logs clean seed smoke unit e2e ui verify

up:
	docker compose up --build -d
	@echo "app: http://localhost:3000 (seed runs on first boot)"

down:
	docker compose down

clean:
	docker compose down -v

logs:
	docker compose logs -f app

# unit tests (no server needed)
unit:
	cd backend && node src/unit-tests.js

# end-to-end test against a running instance (docker or mock)
smoke:
	cd backend && node src/smoke.js

# extended e2e: RBAC, races, tampering, rate limits (against a running instance)
e2e:
	cd backend && node src/e2e-full.js

# ALL suites: boots a fresh mock instance, runs unit + smoke + e2e, then stops it
test:
	cd backend && node src/unit-tests.js
	@echo "=== booting fresh mock instance for live suites ==="
	cd backend && rm -rf data && (LND_MODE=mock PORT=3199 node src/index.js > /tmp/jangal-test.log 2>&1 & echo $$! > /tmp/jangal-test.pid)
	sleep 5
	cd backend && node src/smoke.js http://localhost:3199 && node src/e2e-full.js http://localhost:3199; \
	rc=$$?; kill $$(cat /tmp/jangal-test.pid) 2>/dev/null; exit $$rc

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
