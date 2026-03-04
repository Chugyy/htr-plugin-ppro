# Grammalecte API Documentation

## Démarrage du serveur

### Construction de l'image Docker
```bash
docker build -t grammalecte:latest .
```

### Lancement du conteneur
```bash
docker run --rm -p 8080:8080 --name gr grammalecte:latest
```

### Arrêt du conteneur
```bash
docker stop gr
```

## Endpoints disponibles

### 1. Analyse grammaticale

**Endpoint:** `POST /gc_text/fr`

**Description:** Analyse un texte et retourne les erreurs grammaticales et orthographiques.

**Paramètres:**
- `text` (string, requis): Texte à analyser
- `tf` (boolean, optionnel): Appliquer le formateur de texte avant analyse
- `options` (JSON string, optionnel): Options de correction au format JSON

**Exemple:**
```bash
curl -X POST http://localhost:8080/gc_text/fr \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "text=J'en aie mare de luii."
```

**Réponse:**
```json
{
  "program": "grammalecte-fr",
  "version": "2.3.0",
  "lang": "fr",
  "error": "",
  "data": [
    {
      "iParagraph": 1,
      "lGrammarErrors": [
        {
          "nStart": 5,
          "nEnd": 8,
          "sLineId": "#37010",
          "sRuleId": "gv2__vmode_sujet_indicatif__b2_a1_1",
          "sType": "vmode",
          "aColor": [133, 71, 133],
          "sMessage": "Le verbe ne devrait pas être au subjonctif mais à l'indicatif.",
          "aSuggestions": ["ai", "avais", "eus", "aurai"],
          "URL": ""
        }
      ],
      "lSpellingErrors": [
        {
          "i": 4,
          "sType": "WORD",
          "sValue": "luii",
          "nStart": 17,
          "nEnd": 21
        }
      ]
    }
  ]
}
```

### 2. Lister les options

**Endpoint:** `GET /get_options/fr`

**Description:** Retourne la liste des options de correction disponibles.

**Exemple:**
```bash
curl http://localhost:8080/get_options/fr
```

**Réponse:**
```json
{
  "values": {
    "apos": true,
    "bs": true,
    "conf": true,
    "conj": true,
    ...
  },
  "labels": {
    "apos": "Apostrophe typographique",
    "bs": "Populaire",
    ...
  }
}
```

### 3. Définir les options

**Endpoint:** `POST /set_options/fr`

**Description:** Configure les options de correction pour l'utilisateur courant.

**Paramètres:**
- `options` (JSON string, requis): Options au format JSON

**Exemple:**
```bash
curl -X POST http://localhost:8080/set_options/fr \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode 'options={"conf": true, "typo": false}'
```

### 4. Réinitialiser les options

**Endpoint:** `POST /reset_options/fr`

**Description:** Restaure les options par défaut.

**Exemple:**
```bash
curl -X POST http://localhost:8080/reset_options/fr
```

### 5. Suggestions orthographiques (GET)

**Endpoint:** `GET /suggest/fr/<token>`

**Description:** Retourne des suggestions orthographiques pour un mot.

**Exemple:**
```bash
curl http://localhost:8080/suggest/fr/bonjour
```

### 6. Suggestions orthographiques (POST)

**Endpoint:** `POST /suggest/fr`

**Description:** Retourne des suggestions orthographiques pour un mot.

**Paramètres:**
- `token` (string, requis): Mot à corriger

**Exemple:**
```bash
curl -X POST http://localhost:8080/suggest/fr \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "token=bonjour"
```

**Réponse:**
```json
{
  "suggestions": ["bonjour", "bon jour", "Bonjour"]
}
```

## Types d'erreurs

- `apos`: Apostrophe typographique
- `conf`: Confusions et faux-amis
- `conj`: Conjugaisons
- `gn`: Accords (genre et nombre)
- `ppas`: Participes passés
- `vmode`: Modes verbaux
- `typo`: Signes typographiques
- `maj`: Majuscules
- `esp`: Espaces surnuméraires
- `nbsp`: Espaces insécables

## Options principales

- `apos`: true - Apostrophe typographique
- `conf`: true - Confusions et faux-amis
- `conj`: true - Conjugaisons
- `gn`: true - Accords (genre et nombre)
- `ppas`: true - Participes passés, adjectifs
- `typo`: true - Signes typographiques
- `maj`: true - Majuscules
- `html`: false - Mode HTML
- `latex`: false - Mode LaTeX

## Page de test

Accessible sur `http://localhost:8080` avec l'option `-t` activée (déjà incluse dans le Dockerfile).
