# Dashboard Design System

## Direction

- Visual thesis: cockpit sombre, très structuré, inspiré des dashboards financiers haut de gamme.
- Product thesis: lisible en scan rapide, dense sans bruit, avec des surfaces plus proches d'un back-office premium que d'une mosaïque de cartes.
- Interaction thesis: shell stable, hover states courts, aucune animation décorative.

## Tokens

### Color

- `--background`: ivoire chaud pour laisser respirer les données.
- `--foreground`: ardoise brune pour éviter le contraste noir pur.
- `--primary`: bleu acier pour les actions et liens structurants.
- `--accent`: cuivre doux réservé aux marqueurs de relief et aux badges secondaires.
- `--surface-0` à `--surface-3`: paliers de profondeur pour shell, panneaux et sous-panneaux.
- `--success`, `--warning`, `--danger`: états opérationnels.

### Dark Runtime Mode

- Fond principal quasi noir.
- Sidebar encore plus dense que le workspace.
- Bordures fines comme outil principal de séparation.
- Accent bleu froid réservé aux actions et liens.

### Typography

- Typeface: `Geist Variable`.
- Page title: `dashboard-heading`.
- Section eyebrow / labels: `dashboard-kicker`.
- Metric numbers: `metric-value`.
- Body copy: `dashboard-copy`.

### Spacing

- Base scale: `--space-1` à `--space-12`.
- Vertical rhythm principal: `24px` et `32px`.
- Panel padding par défaut: `20px`.
- Rayon principal: `--radius: 1.15rem`.

## Layout Primitives

- `dashboard-shell`: fond global et respiration du produit.
- `dashboard-page`: rythme vertical du contenu principal.
- `dashboard-grid`: surface principale + rail contextuel.
- `dashboard-rail`: empilement des panneaux secondaires.
- `dashboard-panel`: panneau principal avec bordure douce et blur léger.
- `dashboard-subtle-panel`: sous-surface pour listes, notes et états vides.

## Qonto-Inspired Constraints

- Sidebar flush, sans flottement ni ombre.
- Header sobre, orienté commande et contexte.
- Tables très plates, lignes séparées par de simples traits.
- Badges compacts, jamais dominants.
- Les panneaux KPI restent utiles mais ne doivent pas ressembler à une galerie de widgets.

## Rules

- Pas de grille de cartes comme pattern dominant.
- Les headings doivent orienter l'action, pas vendre une promesse.
- Une seule couleur d'accent active à l'écran à la fois.
- Les surfaces secondaires restent mates; l'accent ne sert pas de fond principal.
- Les états de runtime doivent rester lisibles sans dépendre uniquement de la couleur.
