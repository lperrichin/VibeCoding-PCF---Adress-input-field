# Besoin – PCF « Saisie d'adresse » pour Canvas App

> Ce fichier liste les fonctionnalités du composant à développer.
> **Statuts :** ✅ décidé · ❓ à valider · ⏳ à définir

## 1. Objectif

Un composant code PCF de type **field**, utilisable dans une **Canvas App**, qui permet de
saisir une adresse avec autocomplétion et d'en restituer les éléments à l'app sous forme de champs séparés.

Le service de géocodage est **Photon** (OpenStreetMap). Voir le skill `.claude/skills/photon/`.

## 2. Propriétés d'entrée

| Propriété | Type | Statut | Détail |
|---|---|---|---|
| `PhotonBaseUrl` | `SingleLine.Text` | ✅ | URL de base du service. Défaut `https://photon.komoot.io` |
| `MinCharsNumeric` | `Whole.None` | ✅ | Seuil de déclenchement si la saisie commence par un chiffre. Défaut **8** |
| `MinCharsText` | `Whole.None` | ✅ | Seuil de déclenchement sinon. Défaut **3** |
| `DebounceMs` | `Whole.None` | ✅ | Temporisation après la dernière frappe. Défaut **500** |
| `CountryCodes` | `SingleLine.Text` | ✅ | Pays autorisés. Défaut **`FR`** : le périmètre est la France |
| `Language` | `SingleLine.Text` | ✅ | `fr` par défaut. Photon n'accepte que `default`, `de`, `en`, `fr` |
| `MaxResults` | `Whole.None` | ✅ | Nombre de suggestions affichées. Défaut 5, maximum 50 |
| `Layers` | `SingleLine.Text` | ✅ | Types de résultats. Défaut `house,street` (adresses et rues) |
| `BiasLatitude`, `BiasLongitude` | `FP` | ✅ | Point qui favorise les résultats proches (ex. position de l'agence), sans les restreindre |
| `DefaultValue` | `SingleLine.Text` | ✅ | Adresse préremplie (ex. enregistrement existant). Affichée telle quelle, sans appel à Photon |

## 3. Propriétés de sortie

| Propriété | Type | Statut | Exemple |
|---|---|---|---|
| `FullAddress` | `SingleLine.Text` | ✅ | `10 Rue de Rivoli, 75004 Paris` |
| `HouseNumber` | `SingleLine.Text` | ✅ | `10` (texte : peut valoir `10bis`) |
| `Street` | `SingleLine.Text` | ✅ | `Rue de Rivoli` |
| `PostCode` | `SingleLine.Text` | ✅ | `75004` (texte : les zéros initiaux comptent) |
| `City` | `SingleLine.Text` | ✅ | `Paris` |
| `Country` | `SingleLine.Text` | ✅ | `France` |
| `Latitude` | `FP` | ✅ | `48.8554814` |
| `Longitude` | `FP` | ✅ | `2.3604077` |
| `CountryCode` | `SingleLine.Text` | ❓ | `FR` : plus fiable que le nom pour des tests ou des filtres |
| `County` | `SingleLine.Text` | ❓ | Département, ex. `Somme` |
| `State` | `SingleLine.Text` | ❓ | Région, ex. `Hauts-de-France` |
| `District` | `SingleLine.Text` | ❓ | Arrondissement ou quartier, ex. `Le Marais` |
| `IsValidated` | `TwoOptions` | ❓ | `true` uniquement si l'utilisateur a **choisi** une suggestion, `false` pour une saisie libre. Permet de bloquer un envoi de formulaire sur une adresse non vérifiée |
| `OsmId` | `SingleLine.Text` | ❓ | Identifiant stable (ex. `N703432291`), utile pour dédoublonner ou retrouver l'adresse |

Le texte affiché dans le champ est la propriété liée `Value` (= `FullAddress`).

## 4. Comportement

| Fonction | Statut | Détail |
|---|---|---|
| Autocomplétion | ✅ | Suggestions sous le champ pendant la frappe, via `/api` de Photon (seul endpoint utilisé) |
| Seuil de déclenchement | ✅ | 8 caractères si la saisie commence par un chiffre, 3 sinon |
| Temporisation | ✅ | 500 ms après la dernière frappe. La requête précédente encore en cours est annulée |
| Sélection d'une suggestion | ✅ | Remplit toutes les sorties et déclenche `OnChange` **une seule fois** |
| Saisie libre si Photon est indisponible | ❓ | Le texte tapé est conservé, `IsValidated = false`, message discret à l'utilisateur |
| Modification après sélection | ❓ | Toute frappe remet `IsValidated` à `false` |
| Bouton d'effacement | ✅ | Vide le champ et toutes les sorties |
| ~~Recherche structurée~~ | ❌ | Écartée : pas d'appel à `/structured` |
| ~~Bouton « Ma position »~~ | ❌ | Écarté : pas de géocodage inverse (`/reverse`) |

## 5. Interface

| Élément | Statut | Détail |
|---|---|---|
| Libellé de suggestion | ✅ | `10 Rue de Rivoli, 75004 Paris` (voir le skill Photon) |
| Seconde ligne grise | ❓ | Département et région, pour distinguer les homonymes |
| Texte indicatif (placeholder) | ❓ | Propriété d'entrée `Placeholder` |
| Champ désactivé / lecture seule | ❓ | Respecte `context.mode.isControlDisabled` |
| Navigation clavier et accessibilité | ❓ | Combobox ARIA : ↑ ↓ Entrée Échap |
| Mention « © OpenStreetMap contributors » | ✅ | Obligatoire (licence ODbL), en pied de liste |
| Bibliothèque UI | ✅ | **React + Fluent UI** (composant virtuel). Version 8 ou 9 : voir section 8 |
| Thème et taille | ⏳ | À définir |

## 6. Contraintes techniques

- ✅ Composant **premium** : licence confirmée. Déclarer `<external-service-usage>` dans le manifest.
- ✅ L'instance `photon.komoot.io` est une démonstration : débit limité, sans garantie. Usage de test uniquement.
- ⏳ Instance de production : à définir (auto-hébergée ou fournisseur compatible). Seule `PhotonBaseUrl` change.
- ✅ `limit` maximum 50 ; `lang` limité à `default|de|en|fr`.
- ✅ Framework : **React + Fluent UI** (`pac pcf init ... -fw react`, template `field`).
- ✅ Périmètre géographique : **France uniquement** (`countrycode=FR`).

## 7. Hors périmètre

- Bouton « Ma position » et géocodage inverse (`/reverse`).
- Recherche structurée par champs séparés (`/structured`).
- À compléter. Exemples possibles : carte, calcul d'itinéraire, validation postale certifiée (La Poste / BAN).

## 8. Décisions et points à définir

- ✅ **Fluent UI v9** (≤ 9.46.2 pour la compatibilité avec la plateforme, voir `references/05-react.md` du skill `pcf`).
- ✅ **Toutes les sorties facultatives de la section 3 sont retenues** (`CountryCode`, `County`, `State`, `District`, `IsValidated`, `OsmId`).
- ✅ Namespace `FWL`, composant `AddressFieldFr`, éditeur `fwl`.
- ✅ Éléments d'interface facultatifs de la section 5 : tous retenus.
