# Workspace MCP × React — Fiches Pays

Espace de travail **React** piloté en temps réel par un **agent AI** via un serveur **MCP** (Streamable HTTP) et **SSE**.

## Structure

- **`server/data/countries/*.json`** : Fiches pays au format JSON uniforme (chargées dynamiquement).
- **`server/src/`** : Backend Express + MCP (`POST /mcp`, `GET /events`, `GET /session`, `GET /health`).
  - `lister_pays` : liste les fiches JSON disponibles sur le serveur.
  - `afficher_fiche_pays(countryId, sessionId?)` : affiche une fiche dans la session du chat (crée une nouvelle `sessionId` au 1er appel du chat) et retourne le lien `?session=<sessionId>`.
  - `reinitialiser_session(sessionId)` : vide la session courante.
- **`client/src/`** : Interface React (Vite + TypeScript) affichant la fiche active et l'historique de la session.

## Démarrage

```bash
npm install
npm run dev
```

Ouvre [http://localhost:5173](http://localhost:5173).

## Exposer en HTTPS (optionnel)

Un seul tunnel sur le port `5173` expose l'app React et le endpoint MCP (`/mcp`) via le proxy Vite :

```bash
cloudflared tunnel --url http://localhost:5173
```

## Connexion dans un agent AI

Renseigne l'URL MCP unique :

```text
https://<url-tunnel>/mcp
```

*(En local : `http://localhost:5173/mcp` ou `http://localhost:3001/mcp`.)*

### Exemple de prompt

> *« Je cherche un pays d'Asie connu pour le Mont Fuji, les cerisiers en fleurs et les sushis. Affiche sa fiche. »*
