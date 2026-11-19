import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getCountryById, listCountrySummaries } from "./countries.js";
import {
  displayCountryInSession,
  getSseClientCount,
  normalizeSessionId,
  resetSession,
} from "./store.js";

export function createMcpServer(baseUrl = "http://localhost:5173"): McpServer {
  const cleanBaseUrl = baseUrl.replace(/\/$/, "");

  const server = new McpServer({
    name: "poc-workspace-pays",
    version: "2.0.0",
  });

  server.registerTool(
    "lister_pays",
    {
      description:
        "Récupère la liste de toutes les fiches pays (fichiers JSON) disponibles sur le serveur avec leur id, nom, capitale, continent et résumé. " +
        "Utilise d'abord cet outil quand l'utilisateur décrit un pays afin d'identifier le bon countryId, puis appelle afficher_fiche_pays.",
    },
    async () => {
      const countries = listCountrySummaries();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                total: countries.length,
                pays: countries,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.registerTool(
    "afficher_fiche_pays",
    {
      description:
        "Affiche le contenu complet d'une fiche pays (par son countryId) dans la session de travail web React et retourne le lien direct de la session. " +
        "RÈGLE IMPORTANTE : lors du TOUT PREMIER appel dans une nouvelle conversation, ne passe PAS de sessionId afin que le serveur crée une nouvelle session dédiée à ce chat. " +
        "Pour TOUS les appels suivants dans la MÊME conversation, repasse OBLIGATOIREMENT le sessionId retourné précédemment.",
      inputSchema: {
        countryId: z
          .string()
          .min(1)
          .describe("Identifiant de la fiche pays obtenu via lister_pays (ex. 'france', 'japon', 'maroc')."),
        sessionId: z
          .string()
          .optional()
          .describe(
            "Identifiant de la session de travail de cette conversation. Omettre au 1er appel du chat pour créer une nouvelle session ; repasser obligatoirement le sessionId reçu pour tous les appels suivants du même chat."
          ),
      },
    },
    async ({ countryId, sessionId }) => {
      const country = getCountryById(countryId);
      if (!country) {
        const availableIds = listCountrySummaries()
          .map((c) => c.id)
          .join(", ");
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Aucune fiche pays trouvée pour l'identifiant "${countryId}". Identifiants disponibles : ${availableIds || "aucun"}.`,
            },
          ],
        };
      }

      const isNewSession = !sessionId || !sessionId.trim();
      const targetSessionId = isNewSession ? randomUUID().slice(0, 12) : normalizeSessionId(sessionId);
      displayCountryInSession(targetSessionId, country);

      const clients = getSseClientCount(targetSessionId);
      const plural = clients > 1 ? "s" : "";
      const sessionUrl = `${cleanBaseUrl}/?session=${encodeURIComponent(targetSessionId)}`;

      return {
        content: [
          {
            type: "text",
            text: [
              isNewSession
                ? `Nouvelle session créée et fiche "${country.drapeau} ${country.nom}" affichée.`
                : `Fiche "${country.drapeau} ${country.nom}" affichée dans la session existante.`,
              `countryId : ${country.id}`,
              `sessionId : ${targetSessionId}`,
              `Lien de la session : ${sessionUrl}`,
              `Diffusé à ${clients} navigateur${plural} connecté${plural}.`,
              `Note pour l'assistant : conserve sessionId="${targetSessionId}" et repasse-le dans tous les prochains appels d'outils de cette conversation.`,
            ].join("\n"),
          },
        ],
      };
    }
  );

  server.registerTool(
    "reinitialiser_session",
    {
      description:
        "Réinitialise la session de travail de cette conversation (efface la fiche affichée et l'historique).",
      inputSchema: {
        sessionId: z
          .string()
          .min(1)
          .describe("Identifiant de la session de travail de cette conversation à réinitialiser."),
      },
    },
    async ({ sessionId }) => {
      const targetSessionId = normalizeSessionId(sessionId);
      resetSession(targetSessionId);
      const clients = getSseClientCount(targetSessionId);
      const plural = clients > 1 ? "s" : "";
      const sessionUrl = `${cleanBaseUrl}/?session=${encodeURIComponent(targetSessionId)}`;

      return {
        content: [
          {
            type: "text",
            text: [
              `Session "${targetSessionId}" réinitialisée (${clients} navigateur${plural} connecté${plural} notifié${plural}).`,
              `Lien de la session : ${sessionUrl}`,
            ].join("\n"),
          },
        ],
      };
    }
  );

  return server;
}
