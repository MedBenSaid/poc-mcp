import { type FormEvent, useEffect, useState } from "react";

interface CountrySheet {
  id: string;
  nom: string;
  capitale: string;
  continent: string;
  population: string;
  superficieKm2: number;
  langue: string;
  monnaie: string;
  drapeau: string;
  resume: string;
  pointsCles: string[];
  specialites: string[];
}

interface DisplayedCountry {
  entryId: string;
  country: CountrySheet;
  displayedAt: string;
}

interface SessionSnapshot {
  sessionId: string;
  currentEntry: DisplayedCountry | null;
  history: DisplayedCountry[];
}

type ConnectionStatus = "connecting" | "connected" | "reconnecting";

const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") || "";
const STORAGE_KEY = "poc-mcp-session";

function normalizeSessionId(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 64);
}

function generateSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().slice(0, 12);
  }
  return Math.random().toString(36).slice(2, 14);
}

function getInitialSession(): string {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = normalizeSessionId(params.get("session") ?? "");
  if (fromUrl) return fromUrl;

  try {
    const fromStorage = normalizeSessionId(window.localStorage.getItem(STORAGE_KEY) ?? "");
    if (fromStorage) return fromStorage;
  } catch {
    // localStorage peut être indisponible
  }

  return generateSessionId();
}

function syncSessionToBrowser(sessionId: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, sessionId);
  } catch {
    // Ignorer si localStorage est bloqué
  }

  const url = new URL(window.location.href);
  if (url.searchParams.get("session") !== sessionId) {
    url.searchParams.set("session", sessionId);
    window.history.replaceState(null, "", url.toString());
  }
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("fr-FR").format(value);
}

function formatTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function App() {
  const [sessionId, setSessionId] = useState<string>(getInitialSession);
  const [sessionInput, setSessionInput] = useState<string>(sessionId);
  const [copied, setCopied] = useState<boolean>(false);
  const [currentEntry, setCurrentEntry] = useState<DisplayedCountry | null>(null);
  const [history, setHistory] = useState<DisplayedCountry[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");

  const mcpBaseUrl = API_URL || window.location.origin;
  const mcpUrl = `${mcpBaseUrl}/mcp`;

  useEffect(() => {
    syncSessionToBrowser(sessionId);
    setSessionInput(sessionId);
  }, [sessionId]);

  useEffect(() => {
    let isMounted = true;
    setCurrentEntry(null);
    setHistory([]);
    setStatus("connecting");

    const encodedSession = encodeURIComponent(sessionId);

    fetch(`${API_URL}/session?session=${encodedSession}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((snapshot: SessionSnapshot) => {
        if (!isMounted) return;
        setCurrentEntry(snapshot.currentEntry ?? null);
        setHistory(Array.isArray(snapshot.history) ? snapshot.history : []);
      })
      .catch(() => {
        // Le serveur peut ne pas encore être disponible ; l'EventSource tentera de se reconnecter.
      });

    const eventSource = new EventSource(`${API_URL}/events?session=${encodedSession}`);

    eventSource.onopen = () => {
      if (isMounted) setStatus("connected");
    };

    eventSource.addEventListener("connected", () => {
      if (isMounted) setStatus("connected");
    });

    eventSource.addEventListener("session_update", (event: MessageEvent<string>) => {
      if (!isMounted) return;
      try {
        const snapshot = JSON.parse(event.data) as SessionSnapshot;
        setCurrentEntry(snapshot.currentEntry ?? null);
        setHistory(Array.isArray(snapshot.history) ? snapshot.history : []);
      } catch {
        // Ignorer un payload JSON invalide
      }
    });

    eventSource.addEventListener("reset", () => {
      if (isMounted) {
        setCurrentEntry(null);
        setHistory([]);
      }
    });

    eventSource.onerror = () => {
      if (isMounted) {
        setStatus("reconnecting");
      }
    };

    return () => {
      isMounted = false;
      eventSource.close();
    };
  }, [sessionId]);

  const handleSessionSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const next = normalizeSessionId(sessionInput);
    if (next) {
      setSessionId(next);
    } else {
      setSessionInput(sessionId);
    }
  };

  const handleGenerateSession = () => {
    setSessionId(generateSessionId());
  };

  const handleCopyMcpUrl = async () => {
    try {
      await navigator.clipboard.writeText(mcpUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API peut nécessiter HTTPS ou une permission
    }
  };

  const statusLabel =
    status === "connected" ? "Connecté" : status === "connecting" ? "Connexion..." : "Reconnexion...";

  const activeCountry = currentEntry?.country ?? null;

  return (
    <div className="app-container">
      <header className="app-header">
        <div>
          <h1>Workspace MCP × Fiches Pays</h1>
          <p className="subtitle">Session de travail pilotée en temps réel par un agent AI</p>
        </div>
        <span className={`status-badge status-${status}`} aria-live="polite">
          <span className="status-dot" />
          {statusLabel}
        </span>
      </header>

      <main className="app-main">
        <section className="room-card" aria-label="Configuration de la session">
          <div className="room-header">
            <span className="section-label">Session de travail</span>
            <span className="room-badge">{sessionId}</span>
          </div>

          <form className="room-form" onSubmit={handleSessionSubmit}>
            <input
              type="text"
              className="room-input"
              value={sessionInput}
              onChange={(e) => setSessionInput(e.target.value)}
              placeholder="Identifiant de session (sessionId)"
              aria-label="Identifiant de session"
              maxLength={64}
            />
            <button type="submit" className="btn btn-primary">
              Rejoindre
            </button>
            <button type="button" className="btn btn-secondary" onClick={handleGenerateSession}>
              Nouvelle
            </button>
          </form>

          <div className="mcp-url-row">
            <span className="mcp-url-label">
              URL MCP unique pour toute l&apos;équipe (ton agent AI te retournera le lien de ta session) :
            </span>
            <div className="mcp-url-box">
              <code className="mcp-url-code">{mcpUrl}</code>
              <button type="button" className="btn btn-copy" onClick={handleCopyMcpUrl}>
                {copied ? "Copié !" : "Copier"}
              </button>
            </div>
          </div>
        </section>

        <section className="country-section" aria-label="Fiche pays active">
          <div className="section-label">Fiche pays affichée</div>
          {currentEntry && activeCountry ? (
            <article className="country-card" key={currentEntry.entryId}>
              <div className="country-hero">
                <div className="country-title-group">
                  <span className="country-flag" role="img" aria-label={`Drapeau ${activeCountry.nom}`}>
                    {activeCountry.drapeau}
                  </span>
                  <div>
                    <h2 className="country-name">{activeCountry.nom}</h2>
                    <span className="country-continent">{activeCountry.continent}</span>
                  </div>
                </div>
                <span className="country-id-tag">id: {activeCountry.id}</span>
              </div>

              <p className="country-summary">{activeCountry.resume}</p>

              <dl className="metrics-grid">
                <div className="metric-item">
                  <dt>Capitale</dt>
                  <dd>{activeCountry.capitale}</dd>
                </div>
                <div className="metric-item">
                  <dt>Population</dt>
                  <dd>{activeCountry.population}</dd>
                </div>
                <div className="metric-item">
                  <dt>Superficie</dt>
                  <dd>{formatNumber(activeCountry.superficieKm2)} km²</dd>
                </div>
                <div className="metric-item">
                  <dt>Langue</dt>
                  <dd>{activeCountry.langue}</dd>
                </div>
                <div className="metric-item">
                  <dt>Monnaie</dt>
                  <dd>{activeCountry.monnaie}</dd>
                </div>
              </dl>

              <div className="country-details-grid">
                <div className="detail-block">
                  <h3>Points clés</h3>
                  <ul className="key-points-list">
                    {activeCountry.pointsCles.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                </div>

                <div className="detail-block">
                  <h3>Spécialités</h3>
                  <div className="tags-list">
                    {activeCountry.specialites.map((item) => (
                      <span className="tag-pill" key={item}>
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <footer className="latest-meta">
                Affichée le <time dateTime={currentEntry.displayedAt}>{formatDateTime(currentEntry.displayedAt)}</time>
              </footer>
            </article>
          ) : (
            <div className="empty-state">
              <p>Aucune fiche pays chargée dans cette session...</p>
              <span className="empty-hint">
                Décris un pays à ton agent AI (il utilisera <code>lister_pays</code> puis{" "}
                <code>afficher_fiche_pays</code>), puis ouvre le lien de session qu&apos;il te retourne.
              </span>
            </div>
          )}
        </section>

        {history.length > 1 && (
          <section className="history-section" aria-label="Fiches consultées dans cette session">
            <div className="section-label">Fiches consultées dans la session ({history.length})</div>
            <ul className="country-history-list">
              {history.map((entry) => {
                const isActive = currentEntry?.entryId === entry.entryId;
                return (
                  <li key={entry.entryId}>
                    <button
                      type="button"
                      className={`country-history-btn ${isActive ? "is-active" : ""}`}
                      onClick={() => setCurrentEntry(entry)}
                    >
                      <span className="country-history-left">
                        <span className="country-history-flag">{entry.country.drapeau}</span>
                        <span className="country-history-name">{entry.country.nom}</span>
                        <span className="country-history-meta">{entry.country.capitale}</span>
                      </span>
                      <time className="history-item-time" dateTime={entry.displayedAt}>
                        {formatTime(entry.displayedAt)}
                      </time>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
