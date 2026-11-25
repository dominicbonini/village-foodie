# « HatchGrab, till module » — document technique (PROJET)

> PROJET pour relecture — version du module : **1.0.0** — 25 novembre 2026. Non publié. Il décrit comment le module satisfait aux
> conditions d’inaltérabilité, de sécurisation, de conservation et d’archivage des données (CGI art. 286 I 3° bis ;
> BOI-TVA-DECLA-30-10-30), son périmètre, ses règles de version et la façon dont un agent de l’administration peut vérifier les
> enregistrements. Les références « § » renvoient au BOI-TVA-DECLA-30-10-30 (version du 25/03/2026).
> ⚠️ Tant que le garde-fou est en mode « observe » (avant till-pack-3), une modification après clôture est **tracée** mais pas
> **refusée** : l’attestation ne doit pas être signée avant le passage en mode « enforce ».

## 1. Identification

- **Logiciel :** « HatchGrab, till module », le module de caisse du logiciel HatchGrab. **Éditeur :** HatchGrab Ltd, qui détient le
  code source et maîtrise ses paramètres (§ 300).
- **Version :** 1.0.0 — racine de version majeure « 1 », versions mineures « 1.y.z » (§ 7). Étiquette du code source :
  `till-module-1.0.0`.
- **Où il fonctionne :** un seul produit (§ 280) — le site hatchgrab.com et les applications HatchGrab pour iOS et Android, qui chargent le même
  site ; la file hors connexion des applications (`lib/native/`) en fait partie. Les données sont dans une base PostgreSQL (Supabase) ;
  les fonctions qui scellent, chaînent, clôturent et archivent sont des fonctions de cette base (fichiers de migration listés au § 7).
- **Licence :** un numéro par entreprise utilisatrice — l’identifiant HatchGrab de son camion.

## 2. Périmètre

**Couvert :** l’enregistrement des commandes et de leurs versions (au comptoir, en ligne, hors connexion), des règlements
(encaissements, remboursements, annulations d’encaissement), des corrections ; le chaînage et le scellement ; les clôtures
journalières, mensuelles et annuelles (ou par exercice) et leurs grands totaux ; la conservation ; les archives et leur vérification.

**Non couvert :** les menus et les produits, le marketing (publications, avis, fidélité), le planning et les événements, les
messageries, le fichier de facturation électronique (e-reporting) et la facturation entre professionnels, les logiciels et terminaux
de paiement de tiers.

**Qui est concerné :** une entreprise assujettie à la TVA qui enregistre les règlements de clients particuliers (§ 1, § 30). Les
entreprises en franchise en base, ou qui ne vendent qu’à des professionnels, sont hors du champ (§ 10, § 25).

## 3. Inaltérabilité (§ 80 – § 100)

- **Moment du scellement.** Une commande est scellée dès son **acceptation** (une vente au comptoir est acceptée à sa création ; une
  commande en ligne quand le camion la confirme), puis à chaque changement d’un champ scellé. Une commande « en attente » n’est pas
  encore une vente. Les commandes restantes sont scellées à la clôture du jour.
- **Ce qui est scellé** (§ 50) : le numéro de justificatif, les dates (avec le fuseau horaire du camion), la caisse (`till_id` : la
  camionnette, `web` pour une commande en ligne, l’appareil pour une vente hors connexion), le montant TTC, chaque ligne (libellé,
  quantité, prix unitaire, taux de TVA, total TTC et hors taxe de la ligne), la TVA par taux, l’état, le mode de règlement de chaque
  paiement, et l’entrée d’**identité** en vigueur (raison sociale, adresse, SIREN/SIRET, n° de TVA, régime) — de sorte qu’un
  justificatif émis avant un changement de ces mentions peut être reconstitué.
- **Corrections par plus et moins** (§ 90). Chaque nouvelle version d’une commande enregistre son **delta** : les lignes et montants
  retirés (moins) et ajoutés (plus), avec l’heure et le rôle de l’auteur (propriétaire, équipe, système). L’enregistrement d’origine
  reste dans la chaîne. Un paiement n’est jamais supprimé : son annulation est une nouvelle ligne « annulation » qui pointe vers lui ;
  un remboursement est une nouvelle ligne.
- **Après la clôture**, une journée n’est jamais rouverte : un enregistrement tardif (une vente hors connexion synchronisée après la
  clôture, un remboursement ultérieur) est compté dans la clôture du jour où il est enregistré, et listé avec sa journée d’origine.
- **Le garde-fou** (déclencheurs de la base) enregistre chaque changement ; en mode « enforce » (till-pack-3) il refuse toute
  modification d’une vente close, qui ne peut alors être corrigée que par un remboursement.
- **Données exclues du scellé :** les données personnelles des clients (nom, e-mail, téléphone, notes). Elles ne portent aucun montant
  fiscal et sont effacées selon la politique de confidentialité ; le scellé n’en contient aucune.

## 4. Sécurisation (§ 120 – § 140)

- **Chaînage par camion.** Chaque enregistrement scellé est une entrée numérotée sans trou (seq 1, 2, 3 …). Pour chaque entrée :
  `payload_hash = sha256(payload)` et `hash = sha256(prev_hash|seq|kind|ref|payload_hash)`, `prev_hash` étant le `hash` de l’entrée
  précédente (64 zéros pour la première). Modifier ou retirer une entrée casse toutes les suivantes.
- **Tables en ajout seul.** La chaîne, les clôtures, les signatures, les archives et le journal d’audit refusent toute modification,
  suppression et troncature (déclencheurs) ; aucun rôle d’API n’a le droit d’y écrire directement.
- **Signature.** Chaque clôture et chaque manifeste d’archive est signé en **Ed25519** par une clé privée détenue **hors de la base**
  (variable serveur). La base ne contient que la clé publique — identifiant `ff6ea8b232e9bc8e`, publiée dans
  docs/till-signing-public-key.md. Le texte signé est l’empreinte sha256 (64 caractères hexadécimaux) de la clôture ou du manifeste.
- **Vérification automatique.** Après chaque clôture, la chaîne entière est vérifiée et le résultat est lui-même enregistré dans la
  chaîne (événement « verify »). Les changements de version, les clôtures, les archives et les vérifications sont des événements
  chaînés.

## 5. Conservation (§ 155, § 170)

- **Clôtures** journalière (après 06 h 00 le lendemain, heure du camion), mensuelle et annuelle — l’année étant l’**exercice** du
  camion (sa propre date de fin, sinon l’année fiscale de son pays, sinon le 31 décembre). Une journée sans activité n’a pas de
  clôture ; les clôtures mensuelles et annuelles sont toujours écrites, même à zéro.
- **Contenu d’une clôture :** par taux de TVA (TTC, HT, TVA), par mode de règlement, les remboursements, les encaissements reçus pour
  des journées ultérieures, les commandes acceptées sans paiement, les enregistrements tardifs, les annulations neutralisées, la plage
  des numéros de justificatif, et les **grands totaux** : perpétuel TTC, perpétuel HT, perpétuel absolu (toutes opérations en valeur
  absolue) — jamais remis à zéro — et le total de l’exercice.
- **Jamais purgées.** Les données scellées et les clôtures ne sont jamais supprimées : ni par la suppression d’un compte (qui efface
  seulement les données personnelles, hors du scellé), ni par la suppression d’un camion (refusée tant qu’il a des enregistrements de
  caisse).

## 6. Archivage (§ 220 – § 250)

- **Quand :** chaque année, après la clôture de l’exercice ; à la demande (API réservée au propriétaire du camion et aux
  administrateurs) ; et une archive finale avant la fermeture d’un compte — si elle échoue, la fermeture s’arrête.
- **Contenu** (un fichier ZIP par archive ; formats ouverts — CSV en UTF-8 avec BOM, JSON Lines) : la chaîne complète depuis
  l’entrée 1 ; chaque version scellée des commandes de la période avec ses lignes, sa TVA, son delta, sa caisse et son entrée
  d’identité ; chaque paiement (avec remboursements et annulations) ; les clôtures et leurs signatures ; les archives précédentes ; les
  empreintes des appareils hors connexion ; le rôle derrière chaque correction ; les résultats de vérification ; la clé publique ; un
  fichier `SHA256SUMS.txt` ; une **notice en français** (README-FR.txt) et en anglais ; et un **manifeste** qui liste chaque fichier
  avec son empreinte sha256, la période, l’exercice, la version du logiciel, la tête de chaîne couverte et la **tête de chaîne de
  chaque jour**.
- **Intégrité dans le temps :** l’empreinte du manifeste est signée (Ed25519) et **enregistrée dans la chaîne** (entrée « archive »),
  ce qui donne une date certaine et rend toute modification détectable.
- **Où et combien de temps :** dans un espace de stockage **privé** (`till-archives` : aucun accès public, aucune règle d’accès pour
  les utilisateurs), **au moins 10 ans**. Un déclencheur de la base refuse toute modification ou suppression d’une archive stockée,
  quel que soit le demandeur.
- **Remise à l’utilisateur** (§ 250) : chaque archive est envoyée par e-mail au propriétaire du camion — un lien de téléchargement
  valable 7 jours et l’empreinte de l’archive ; un nouveau lien peut être demandé à tout moment.

## 7. Règles de version (§ 340, § 380)

- Numérotation **MAJEURE.MINEURE.CORRECTIF**. La version **majeure** change à **toute** modification d’un fichier fiscal (ci-dessous) ;
  une modification qui ne touche aucun fichier fiscal ne change que la version mineure ou le correctif. Une nouvelle version majeure
  appelle une **nouvelle attestation** pour chaque entreprise utilisatrice ; les modifications fiscales sont donc regroupées.
- **Fichiers fiscaux (les « paramètres ») :** les migrations `20261129_till_pack_1.sql`, `20261133_till_pack_2.sql`,
  `20261140_till_pack_4.sql`, `20261150_till_pack_5_6.sql` ; `lib/till/` (version, clôtures, exécution des clôtures, signature,
  archive, fichiers d’archive, erreurs du garde-fou, rôle de l’auteur, empreinte d’appareil) ; `lib/accounts/daily-totals.ts` et
  `daily-inputs.ts` (les chiffres d’une clôture) ; `lib/payments/reversals.ts` ; le vérificateur `scripts/till-verify.cjs` et
  `scripts/_till-sealed-mirror.cjs`.
- **Contrôle automatique :** l’empreinte sha256 de ces fichiers est enregistrée pour chaque version (`lib/till/version-pins.json`) ;
  le contrôle `scripts/till-version-pin.cjs`, exécuté à chaque vérification du code, **échoue** si un fichier fiscal change sans
  nouvelle version, ou si une modification fiscale n’augmente pas la version majeure.
- **Conservation du code** (LPF L102 D, L96 J) : pour chaque version, une étiquette du code source et une archive du code dont
  l’empreinte sha256 est enregistrée ; elles sont conservées jusqu’à la fin de la troisième année suivant l’arrêt de la diffusion de la
  version, et présentées sur demande.
- La version figure sur chaque entrée de chaîne, chaque clôture et chaque archive.

## 8. Contrôle : comment vérifier les enregistrements

- **Sur place** (LPF L80 O) : l’entreprise présente l’attestation (volets 1 et 2) et la version utilisée ; une page « Contrôle » dans
  l’application est prévue (attestation, version, licence, date de début, terminaux de paiement).
- **Accès aux données** (§ 60, § 230) : les clôtures, les opérations d’une période et les archives, exportables ; les archives se lisent
  avec un tableur.
- **Vérifier une archive sans connexion, sans logiciel HatchGrab :**
  1. `sha256sum -c SHA256SUMS.txt`, et chaque fichier listé dans `manifest.json` a l’empreinte indiquée ;
  2. la signature de `manifest.sig.json` vérifie, avec la clé publique publiée, l’empreinte sha256 de `manifest.json` ;
  3. `chain.jsonl` : pour chaque entrée, `payload_hash`, `hash` et `prev_hash` selon les formules du § 4, numéros sans trou depuis 1 ;
  4. chaque clôture est l’entrée de chaîne de même numéro et de même empreinte ; sa signature vérifie ; sa tête de chaîne existe ;
  5. chaque tête de chaîne journalière du manifeste est une entrée de la chaîne.
  L’outil `node scripts/till-verify.cjs --archive <archive.zip> --pub <clé publique>` fait ces cinq contrôles (Node.js seul).

## 9. Ce que l’entreprise utilisatrice doit faire

Enregistrer toutes ses ventes dans HatchGrab (espèces comprises), indiquer le mode de règlement, conserver les archives reçues au
moins 10 ans, et ne pas fermer son compte pendant la durée de conservation sans avoir téléchargé son archive finale.

## 10. Points ouverts

- Le passage du garde-fou en mode « enforce » (till-pack-3) — **préalable à la signature**.
- La page « Contrôle » et la signature électronique du volet 2 par chaque camion (écrans à venir).
- La norme de restitution des données que l’administration doit fixer (CGI art. 286 modifié par la loi n° 2026-534) ; le passage de
  la TVA au CIBS au 1er janvier 2027 ; les questions posées à un conseil fiscal (docs/till-law-1-report.md § 4).
