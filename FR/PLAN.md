# Plan d'action – PCF « Saisie d'adresse » (Canvas App)

> Réalisation **étape par étape** : chaque étape se termine par une validation avant de passer à la suivante.
> Référence fonctionnelle : [BESOIN.md](BESOIN.md). Skills : `pcf` et `photon`.

| # | Étape | Livrable | Validation |
|---|---|---|---|
| 0 | Prérequis et décisions | Outils vérifiés, noms arrêtés | `pac`, `node`, `dotnet` répondent |
| 1 | Initialisation | Projet React généré | `npm run build` passe sur le squelette |
| 2 | Manifest | Propriétés déclarées, types générés | `npm run refreshTypes` sans erreur |
| 3 | Service Photon | Client, types, normalisation | Test réel sur 3 à 4 adresses |
| 4 | Interface React | Composant du champ | Rendu correct dans le harness |
| 5 | Intégration | `index.ts` branché, sorties alimentées | Les sorties changent à la sélection |
| 6 | Tests en local | Scénarios du harness passés | Liste de la section 6 cochée |
| 7 | Build de production | `bundle.js` | Build et lint sans erreur |
| 8 | Packaging | `solutions.zip` | Fichier généré en Release |
| 9 | Déploiement et test Canvas | Composant utilisé dans une app | Scénarios Canvas passés |

---

## Étape 0 – Prérequis et décisions

**Vérifications**
```bash
node --version      # LTS
npm --version
pac --version       # Power Platform CLI
dotnet --version    # SDK .NET (ou msbuild des Build Tools)
```

**Réglage d'environnement (à faire par un administrateur) :** activer
*« Power Apps component framework for canvas apps »* dans les paramètres de l'environnement
cible, sinon le composant ne s'importe pas dans une Canvas App.

**Décisions arrêtées**
- [x] Namespace : `FWL` · Composant : `AddressFieldFr`
- [x] Éditeur de solution : `fwl` (nom et préfixe)
- [x] Fluent UI **v9**
- [x] Toutes les sorties facultatives sont retenues (BESOIN.md, section 3)
- [x] Environnement cible : `https://orgc0a99ad7.crm12.dynamics.com/` (DEV LPE)
- [x] Éléments d'interface facultatifs (BESOIN.md, section 5) : tous retenus

**Outils vérifiés (2026-11-10)**
- Node v24.11.0, npm 11.6.1, .NET SDK 9.0.304, git 2.51.1
- `pac` 2.11.2 (extension VS Code, accessible dans le PATH) ; profil actif sur DEV LPE
- `msbuild` absent du PATH : le packaging utilisera `dotnet build`
- Node 24 est très récent : si `npm install` ou le build échoue, basculer sur Node LTS 22

---

## Étape 1 – Initialisation ✅ (2026-11-10)

Réalisée à la racine du dossier : `pac pcf init --namespace FWL --name AddressFieldFr --template field --framework react --run-npm-install`.
Résultat : `AddressFieldFr/` (manifest, `index.ts`, `HelloWorld.tsx`), `FR.pcfproj`, `package.json`, `.gitignore`. Dépôt git initialisé, `npm run build` réussi.

```bash
pac pcf init --namespace <NS> --name <Nom> --template field --framework react --run-npm-install
git init
```

- Vérifier la structure générée (`ControlManifest.Input.xml`, `index.ts`, `generated/`).
- Ajouter un `.gitignore` (`node_modules/`, `out/`, `obj/`, `bin/`).
- Contrôle : `npm run build` sur le squelette vide.
- Ne pas installer React ni Fluent via npm au-delà des `devDependencies` : ils sont fournis par la plateforme.

---

## Étape 2 – Manifest ✅ (2026-11-10)

Manifest écrit : 1 propriété liée (`Value`), 12 entrées, 14 sorties, `external-service-usage` sur `photon.komoot.io`.
`npm run refreshTypes` et `npm run build` réussis. Les valeurs par défaut (URL, seuils, `FR`, `fr`, 5, `house,street`) ne peuvent pas être déclarées dans le manifest : elles seront appliquées dans le code à l'étape 5.

Dans `ControlManifest.Input.xml` :
- `control-type="virtual"`.
- Propriétés d'entrée et de sortie de BESOIN.md (sections 2 et 3).
- `<platform-library name="React" version="16.14.0" />` et `<platform-library name="Fluent" version="9.46.2" />` (une seule version de Fluent). **Ne pas garder le `9.68.0` généré par `pac` 2.11.2** : l'import Dataverse le refuse (corrigé à l'étape 9, voir ci-dessous).
- `<external-service-usage enabled="true"><domain>photon.komoot.io</domain></external-service-usage>`.
- Valeurs par défaut documentées dans les descriptions des propriétés.

Puis : `npm run refreshTypes`. Contrôle : `IInputs` et `IOutputs` reflètent le manifest.

---

## Étape 3 – Service Photon (sans interface) ✅ (2026-11-10)

Fichiers dans `AddressFieldFr/services/` : `photonTypes.ts`, `addressFormat.ts`, `photonConfig.ts`, `PhotonClient.ts`.
Lint propre, 22 vérifications passées (logique pure + 5 requêtes réelles espacées d'une seconde). Le test est volontairement
hors du dépôt (dossier temporaire) : aucun framework de test n'est installé dans le projet.

Dossier `components/` ou `services/` : fichiers purs TypeScript, sans React.
- `photonTypes.ts` : types GeoJSON et `NormalizedAddress`.
- `normalize()` et `formatLabelFr()` (skill `photon`, `02-response.md`).
- `PhotonClient.ts` : `search()`, seuil 8 caractères si la saisie commence par un chiffre, 3 sinon, annulation par `AbortController`, cache, erreurs typées (`PhotonError`).
- Pas de `reverse()` ni de `/structured` (hors périmètre).

Contrôle : script de test qui interroge Photon sur quelques adresses (« 10 rue de rivoli paris »,
« Lyon », une adresse avec `bis`, une rue sans numéro) en **un petit nombre de requêtes**.

---

## Étape 4 – Interface React ✅ validée dans le harness (2026-11-10)

> Le harness liste toutes les propriétés du manifest sous « Data Inputs », y compris les sorties : c'est un choix d'affichage du harness. `IInputs` / `IOutputs` générés sont corrects.
> Valeurs de test injectées par le harness, à neutraliser à l'étape 5 : `Layers = "val"`, `Placeholder = "val"`, `BiasLatitude = BiasLongitude = 0`, `MaxResults = 50`.

Fichier : `AddressFieldFr/components/AddressField.tsx` (Fluent UI v9 `Combobox` en saisie libre, bouton d'effacement, états recherche / aucun résultat / erreur / désactivé, seconde ligne grise, mention OpenStreetMap, ARIA et clavier fournis par Fluent).
`index.ts` est câblé de façon **provisoire** (texte seul) pour voir l'interface ; le câblage complet est l'étape 5. `HelloWorld.tsx` supprimé.
Filtre ajouté à l'étape 3 : les résultats `house` sans numéro sont écartés.

- Champ de saisie avec liste de suggestions (Fluent UI v9, `Combobox` en mode libre, ou `Input` + liste).
- Bouton d'effacement.
- États : chargement, aucun résultat, erreur (saisie libre conservée).
- Mention « © OpenStreetMap contributors » en pied de liste.
- Accessibilité clavier (↑ ↓ Entrée Échap), état désactivé.
- Styles avec `makeStyles` de Fluent v9.
- Temporisation de 500 ms dans le composant, annulation au démontage.

---

## Étape 5 – Intégration dans `index.ts` ✅ (2026-11-10)

Fichiers : `index.ts`, `services/componentConfig.ts` (entrées vers configuration valide), `services/outputs.ts` (construction des 14 sorties), garde-fous dans `photonConfig.ts`.
Lint et build réussis ; 36 vérifications passées (configuration, sorties, comportement de `index.ts` avec un contexte simulé).

Règles retenues :
- `Value` et `FullAddress` portent toujours le texte du champ ; les détails (numéro, rue, code postal, ville, pays, coordonnées, département, région, arrondissement, `OsmId`) ne sont renseignés que pour une suggestion choisie, et vidés à la première frappe suivante.
- `IsValidated` est vrai uniquement après le choix d'une suggestion. Une valeur venant du Canvas (formule, `DefaultValue`) n'est jamais validée.
- Une valeur renvoyée par le Canvas pendant 1,5 s après une notification et différente du texte courant est ignorée (écho périmé).
- Temporisation bornée à 100–5000 ms, seuils à 1–50, `MaxResults` à 1–50, couches et pays invalides retombent sur les défauts, biais (0, 0) ignoré.

À vérifier dans une vraie Canvas App (étape 9) : le vidage des sorties numériques (`Latitude`, `Longitude` renvoyées `undefined`) et le déclenchement de `OnChange` au chargement d'une valeur existante.

- Lecture des entrées (`PhotonBaseUrl`, pays, langue, seuils…) et création du client **seulement quand la configuration change**.
- `updateView` retourne un `React.ReactElement`.
- Sélection d'une suggestion : alimenter toutes les sorties, `IsValidated = true`, **un seul** `notifyOutputChanged()`.
- Toute frappe ou effacement : `IsValidated = false`, sorties vidées si besoin.
- `DefaultValue` affichée telle quelle, sans appel à Photon.
- `getOutputs()` renvoie tous les champs ; `destroy()` annule temporisation et requête.

---

## Étape 6 – Tests en local ✅ (2026-11-10)

```bash
npm start watch      # test harness sur http://localhost:8181
```

Validation manuelle dans le harness par l'utilisateur (« très bien »). Les cas ci-dessous sont aussi couverts par des tests automatiques sur le service et `index.ts` (hors dépôt, dossier temporaire), sauf mention contraire.

- [x] « 10 rue de rivoli paris » : suggestion correcte, 14 sorties alimentées *(auto + manuel)*
- [x] « Lyon » : déclenche à 3 caractères *(auto + manuel)*
- [x] « 12 » seul : aucun appel *(auto + manuel)*
- [x] Frappe rapide : une seule requête partie (temporisation 500 ms) *(manuel ; l'annulation de la requête précédente est testée en auto)*
- [x] Aucun résultat : message clair *(manuel ; le service renvoie bien une liste vide, test auto)*
- [x] URL invalide ou réseau coupé : saisie libre, `IsValidated = false` *(service : erreur `TypeError` / `PhotonError` bien distinguée de l'annulation ; affichage du message : manuel)*
- [x] Effacement : champ et sorties vidés *(auto + manuel)*
- [x] Champ désactivé *(manuel)*
- [x] Navigation au clavier *(manuel)*

Non couvert : aucun test automatisé de l'interface elle-même (rendu, clavier), car il faudrait installer un environnement de test DOM dans le projet.

---

## Étape 7 – Build de production ✅ (2026-11-10)

`npm run lint` et `npm run build -- --buildMode production` réussis. `bundle.js` : 14,5 Ko (minifié) ; React et Fluent restent externes (`Reactv16`, `FluentUIReactv940`).
Manifest compilé vérifié : version **1.0.0** (première version livrée), `external-service-usage` sur `photon.komoot.io`, 27 propriétés dont 14 sorties, bibliothèques React 16.14.0 et Fluent 9.68.0 (**valeur remplacée par 9.46.2 à l'étape 9**).

```bash
npm run build -- --buildMode production
npm run lint
```

Contrôler la taille du `bundle.js` (React et Fluent ne doivent pas y figurer) et **incrémenter la version** du manifest.

---

## Étape 8 – Packaging ✅ (2026-11-10)

Réalisé : `pac solution init --publisher-name fwl --publisher-prefix fwl`, `pac solution add-reference --path ..`, puis `dotnet build --configuration Release` (0 avertissement, 0 erreur).
Résultat : **`Solutions/bin/Release/Solutions.zip`** (8,9 Ko), solution **non managée**, nom unique **`AddressFieldFr`**, version `1.0.0.0`, éditeur `fwl` (préfixe `fwl`), composant `fwl_FWL.AddressFieldFr` (type 66, contrôle personnalisé).
Corrections apportées au gabarit : type de paquet forcé à `Unmanaged` dans `Solutions.cdsproj` (le gabarit était à « Both »), `Managed=0`, nom unique `Solutions` remplacé par `AddressFieldFr` (non modifiable après le premier import).

```bash
mkdir Solutions && cd Solutions
pac solution init --publisher-name <Éditeur> --publisher-prefix <préfixe>
pac solution add-reference --path ..
dotnet build /property:configuration=Release     # ou msbuild
```

Résultat : `Solutions/bin/Release/solutions.zip`. Choisir **non managée** (dev/test) ou
**managée** (production) avant le build final.

---

## Étape 9 – Déploiement et test dans la Canvas App

**Import réalisé le 2026-11-10 sur DEV LPE** : `pac solution import --path Solutions\bin\Release\Solutions.zip --publish-changes` → *Imported successfully* + *Published All Customizations*. La solution `AddressFieldFr` 1.0.0.0 (non managée) apparaît dans `pac solution list`.
Deux échecs d'import ont précédé, corrigés (aucun n'avait modifié l'environnement) :
1. **Apostrophes interdites** dans les attributs `description-key` du manifest (schéma XSD `noAposStringType`). Non détecté par le build local.
2. **Fluent 9.68.0 refusé** par la plateforme. Remplacé par **9.46.2** dans le manifest et `package.json`.
Message sans gravité à l'import : *« Translated labels for 1033 could not be imported »* (l'anglais n'est pas activé sur l'organisation).
Une autre solution existe déjà dans l'environnement : `demo_addressfield_fr` (« Demo AddressFieldFR »).

**Reste à faire (côté Power Apps Studio)** : ajouter le composant à une app et dérouler les tests ci-dessous.

```bash
pac auth create --url https://<org>.crm.dynamics.com
pac solution import --path Solutions\bin\Release\solutions.zip --publish-changes
```

Dans Power Apps Studio :
1. Insérer → Obtenir plus de composants → Code → ajouter le composant.
2. Renseigner `PhotonBaseUrl` et les autres entrées.
3. Lire les sorties dans les formules, par exemple `AddressField1.City`, `AddressField1.Latitude`.
4. Tester : sélection, saisie libre, effacement, mode désactivé, enregistrement dans une source de données.

Pour chaque mise à jour : incrémenter la version, rebuild, réimporter.

---

## Risques à suivre

| Risque | Parade |
|---|---|
| Instance publique Photon limitée ou indisponible | Saisie libre conservée ; instance dédiée avant la production (seule `PhotonBaseUrl` change) |
| Domaine bloqué par une politique réseau ou DLP | Tester tôt dans l'environnement cible |
| Fluent v9 ou React incompatibles avec la version de la plateforme | React 16.14.0 et Fluent **9.46.2** (le 9.68.0 généré par `pac` est refusé à l'import) |
| Composants code désactivés sur l'environnement | Réglage administrateur de l'étape 0 |
| Cache du composant après mise à jour | Incrémenter la version à chaque déploiement |
