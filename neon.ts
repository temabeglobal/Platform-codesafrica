import { defineConfig } from "@neon/config/v1";

/* Services Neon de la plateforme. Chaque branche a les siens : development (local), test (site de test), production.
   Déploiement sur la branche liée (.neon) : `npx neon@latest deploy --env .env.local`. */
export default defineConfig({
  preview: {
    realtime: true,
  },
  auth: true,
  aiGateway: true,
  functions: {
    api: {
      name: "CODES Africa API",
      source: "./api/index.ts",
      env: {
        // Origines autorisées à appeler l'API (adresse de la plateforme pour cette branche), séparées par des virgules.
        ALLOWED_ORIGINS: { value: process.env.ALLOWED_ORIGINS, required: true },
        AI_MODEL: process.env.AI_MODEL ?? "claude-haiku-4-5",
        // Secret du temps réel de la branche (non injecté automatiquement dans les fonctions ; lu depuis .env.local).
        // Clé Anthropic de Sonia (facultative, lue depuis .env.local, jamais dans le dépôt).
        ANTHROPIC_API_KEY: { value: process.env.ANTHROPIC_API_KEY, required: false },
        SONIA_MODEL: process.env.SONIA_MODEL ?? "claude-sonnet-5-5",
        // Ou clé OpenAI de Sonia (facultative, lue depuis .env.local).
        OPENAI_API_KEY: { value: process.env.OPENAI_API_KEY, required: false },
        OPENAI_MODEL: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
        // Sonia sans compte : « on » sur la branche test uniquement (fichier .env.test.local), désactivé ailleurs.
        PUBLIC_AI: process.env.PUBLIC_AI ?? "off",
        REALTIME_SECRET: { value: process.env.REALTIME_SECRET ?? process.env.NEON_REALTIME_SECRET, required: true },
      },
    },
  },
  buckets: {
    // Pièces jointes privées : lues seulement par lien temporaire signé.
    uploads: { access: "private" },
  },
  branch: (branch) => {
    if (branch.isDefault) return {};
    if (!branch.exists) return { ttl: "7d" };
    return {};
  },
});
