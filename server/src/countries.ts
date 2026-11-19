import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface CountrySheet {
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

export interface CountrySummary {
  id: string;
  nom: string;
  capitale: string;
  continent: string;
  drapeau: string;
  resume: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COUNTRIES_DIR = path.resolve(__dirname, "../data/countries");

export function loadAllCountries(): CountrySheet[] {
  let entries: string[];
  try {
    entries = readdirSync(COUNTRIES_DIR).filter((file) => file.endsWith(".json"));
  } catch (error) {
    console.error(`Impossible de lire le dossier des pays (${COUNTRIES_DIR}) :`, error);
    return [];
  }

  const countries: CountrySheet[] = [];
  for (const file of entries) {
    try {
      const raw = readFileSync(path.join(COUNTRIES_DIR, file), "utf-8");
      const parsed = JSON.parse(raw) as CountrySheet;
      if (parsed && typeof parsed.id === "string" && typeof parsed.nom === "string") {
        countries.push(parsed);
      }
    } catch (error) {
      console.error(`Fichier pays invalide (${file}) :`, error);
    }
  }

  return countries.sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
}

export function listCountrySummaries(): CountrySummary[] {
  return loadAllCountries().map(({ id, nom, capitale, continent, drapeau, resume }) => ({
    id,
    nom,
    capitale,
    continent,
    drapeau,
    resume,
  }));
}

export function getCountryById(countryId: string): CountrySheet | undefined {
  const normalized = countryId.trim().toLowerCase();
  return loadAllCountries().find((country) => country.id.toLowerCase() === normalized);
}
