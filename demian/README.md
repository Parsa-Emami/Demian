# Demian Game Platform 8.1

Cumulative final release containing phases 1 through 8 in one Laravel/Vite project.

## Included games and platform modules

- Shared renderer, deterministic runtime, input contexts and game registry
- Responsive Game Shell and transactional lifecycle
- Tetris with deterministic replay
- Shared collision, interaction and navigation
- Hide & Seek
- Data-driven Event Framework and Laravel event APIs
- Role Play with dialogue, quests, inventory, jobs and versioned saves
- Expanded Open World with chunk streaming, world map, minimap and save points
- Final mobile UX: stable viewport modes and native scroll-snap rails for game/character selection

## Setup

```bash
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate --seed
npm ci
npm run test:js
npm run validate:final
npm run build
php artisan serve
```

See `docs/FINAL-INTEGRATION-AND-MOBILE-UX.fa.md` for the Persian implementation guide.
