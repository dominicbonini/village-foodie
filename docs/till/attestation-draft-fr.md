# PROJET — Attestation individuelle de l’éditeur (modèle BOI-LETTRE-000242)

> **PROJET pour relecture par Dominic — non publié, non affiché dans l’application, non signé.**
> Texte du modèle repris **mot pour mot** de BOI-LETTRE-000242 (version en vigueur du 25/03/2026,
> <https://bofip.impots.gouv.fr/bofip/10692-PGP.html>, contenu sous licence etalab-2.0). Seuls les champs que le modèle laisse à
> remplir sont complétés ; les mentions entre crochets `[…]` restent à compléter par Dominic.
> ⚠️ **À ne signer qu’une fois le garde-fou en mode « enforce » (till-pack-3)** : tant qu’il observe sans refuser, une correction
> après clôture est tracée mais pas empêchée (docs/till-law-1-report.md, § 2 point 3).

**Identification de l’éditeur** (hors modèle, pour le dossier) : HatchGrab Ltd, société immatriculée en Angleterre et au pays de
Galles sous le numéro [numéro d’immatriculation], dont le siège social est [adresse du siège social].

---

LETTRE - TVA - Modèle d’attestation individuelle relative à l’utilisation d’un logiciel ou d’un système de caisse sécurisé

Les volets 1 et 2 de cette attestation doivent être présentés à l’administration fiscale en cas de contrôle. Elle n’a de valeur que si son volet 2 est dûment complété et signé par l’entreprise utilisatrice du logiciel / système.

## I. Volet 1 : Partie à remplir par l’éditeur ou intégrateur du logiciel ou du système de caisse

Je soussigné, [Full name], représentant légal de la société HatchGrab Ltd, éditeur du logiciel / système de caisse « HatchGrab, till module » (le module de caisse du logiciel HatchGrab, accessible par le site hatchgrab.com et par les applications HatchGrab pour iOS et Android, qui chargent le même site), atteste que les fonctionnalités de caisse de ce logiciel/système (1), mis sur le marché à compter du [DATE de mise en service de la version 1.0.0], dans sa version n° 1.0.0, sous le numéro de licence [identifiant HatchGrab du camion de l’entreprise utilisatrice] (2), satisfont aux conditions d’inaltérabilité, de sécurisation, de conservation et d’archivage des données en vue du contrôle de l’administration fiscale, prévues au 3° bis du I de l’article 286 du code général des impôts.

[J’atteste que la dernière version majeure de ce logiciel ou système est identifiée avec la racine suivante : 1 et que les versions mineures développées ultérieurement à cette version majeure sont ou seront identifiées par les subdivisions suivantes de cette racine : 1.y.z. Je m’engage à ce que ces subdivisions ne soient utilisées par HatchGrab Ltd de l’éditeur que pour l’identification des versions mineures ultérieures, à l’exclusion de toute version majeure. Les versions majeures et mineures du logiciel ou système s’entendent au sens du III-A § 340 du BOI-TVA-DECLA-30-10-30] (3)

Le périmètre couvert par cette attestation concerne les fonctionnalités suivantes : (1) l’enregistrement des commandes et de leurs versions successives (au comptoir, en ligne et hors connexion), l’enregistrement des règlements (encaissements, remboursements, annulations d’encaissement), les corrections par opérations de plus et de moins, le chaînage et le scellement des enregistrements, les clôtures journalières, mensuelles et annuelles (ou par exercice) avec leurs grands totaux, la conservation des données, la génération des archives et leur vérification.

Les fonctionnalités suivantes ne sont pas couvertes par cette attestation : (1) la présentation des menus et des produits, le marketing (publications, réseaux sociaux, avis, fidélité), la gestion du planning et des événements, les messageries, le fichier de facturation électronique (e-reporting) et la facturation entre professionnels, ainsi que tout logiciel ou terminal de paiement de tiers.

Fait à [VILLE], Le [DATE],

Signature du représentant légal de l’éditeur du logiciel ou système de caisse :

[Full name], director, HatchGrab Ltd

(1) À adapter et à compléter selon le cas ;

(2) Quand il existe une licence ;

(3) Mention facultative à stipuler par l’éditeur pour permettre l’application de la tolérance prévue au III-B § 380 du BOI-TVA-DECLA-30-10-30.

Remarque : Il est rappelé que l’établissement d’une fausse attestation est un délit pénal passible de trois ans d’emprisonnement et de 45 000 € d’amende (code pénal [C. pén.], art. 441-1). L’usage d’une fausse attestation est passible des mêmes peines.

## II. Volet 2 : Partie à remplir par l’entreprise qui utilise le logiciel ou le système de caisse

Je soussigné, NOM Prénom, représentant légal de la société RAISON SOCIALE, certifie avoir acquis ou téléchargé le DATE, auprès de HatchGrab Ltd, le logiciel / système de caisse mentionné au volet 1 de cette attestation.

J’atteste utiliser ce logiciel / système de caisse pour enregistrer les règlements de mes clients particuliers, conformément à la réglementation fiscale en vigueur, depuis le DATE.

Fait à (Ville), Le (DATE),

Signature du représentant légal :

Remarque : Il est rappelé que l’établissement d’une fausse attestation est un délit pénal passible de trois ans d’emprisonnement et de 45 000 € d’amende (C. pén., art. 441-1). L’usage d’une fausse attestation est passible des mêmes peines.

---

## Notes de préparation (hors attestation)

- **Ce qui a été rempli, et pourquoi.**
  - « les fonctionnalités de caisse de ce logiciel/système » plutôt que « ce logiciel/système » : HatchGrab fait plus qu’une caisse (menus, planning, marketing), et le périmètre ci-dessus dit lesquelles sont couvertes.
  - « satisfont », accordé.
  - Le **numéro de licence** est l’identifiant HatchGrab du camion : un par entreprise utilisatrice, ce qui rend l’attestation nominative (§ 370).
  - La **racine** est « 1 » et les subdivisions « 1.y.z » (lib/till/version.ts ; règle de version dans docs/till/technical-document-fr.md § 7).
  - Le **distributeur** du volet 2 est HatchGrab Ltd, qui distribue lui-même.
- **Ce qui reste à remplir par Dominic :** le nom complet, le numéro d’immatriculation, l’adresse du siège, la date de mise sur le marché de la version 1.0.0, la ville et la date de signature.
- **Par camion** (écran à venir, hors de ce lot) : le numéro de licence ; le volet 2, signé électroniquement par le représentant légal du camion, avec la date de téléchargement (son inscription) et la date de début d’utilisation (son `till_started_at`).
- **Langue :** rédigée en français, donc sans traduction certifiée (§ 365). La copie anglaise (attestation-draft-en.md) n’est qu’une aide à la lecture.
- **Une nouvelle version majeure** (2.0.0 …) appelle une nouvelle attestation pour chaque camion (§ 380). Le contrôle de version (scripts/till-version-pin.cjs) empêche toute modification fiscale sans changement de version majeure.
