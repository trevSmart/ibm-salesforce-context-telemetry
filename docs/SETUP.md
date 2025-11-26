# Guia de Configuració del Servidor de Telemetria

Aquesta guia t'explica pas a pas com muntar i desplegar el servidor de telemetria.

## 📋 Requisits Previs

Abans de començar, assegura't de tenir instal·lat:

- **Node.js** (versió 18 o superior)
  - Comprova si el tens: `node --version`
  - Si no el tens, descarrega'l de: https://nodejs.org/

- **npm** (normalment ve amb Node.js)
  - Comprova si el tens: `npm --version`

## 🚀 Pas 1: Instal·lar les Dependències

Obre una terminal a la carpeta del projecte i executa:

```bash
npm install
```

Això instal·larà totes les llibreries necessàries (express, cors, etc.) a la carpeta `node_modules/`.

## 🧪 Pas 2: Provar el Servidor Localment

### Executar el servidor

```bash
npm start
```

Hauries de veure un missatge com:
```
Telemetry server listening on port 3000
```

### Provar que funciona

Obre una altra terminal i prova els endpoints:

**1. Provar l'endpoint principal:**
```bash
curl http://localhost:3000/
```

Hauries de veure: `MCP Telemetry server is running ✅`

**2. Provar l'endpoint de health:**
```bash
curl http://localhost:3000/health
```

Hauries de veure: `ok`

**3. Provar l'endpoint de telemetria (POST):**
```bash
curl -X POST http://localhost:3000/telemetry \
  -H "Content-Type: application/json" \
  -d '{"event":"test","timestamp":"2024-01-15T10:30:00.000Z"}'
```

Hauries de veure: `{"status":"ok"}`

I a la terminal on corre el servidor, hauries de veure el log:
```
Telemetry event: {"event":"test","timestamp":"2024-01-15T10:30:00.000Z"}
```

### Aturar el servidor

Prem `Ctrl + C` a la terminal on corre el servidor per aturar-lo.

## 🌐 Pas 3: Desplegar a Render

Render és un servei gratuït (amb limitacions) per desplegar aplicacions web. Segueix aquests passos:

### 3.1. Crear compte a Render

1. Ves a https://render.com
2. Crea un compte (pots fer servir GitHub per registrar-te ràpidament)

### 3.2. Connectar el repositori GitHub

1. Assegura't que el teu codi està pujat a GitHub
2. A Render, clica a "New +" → "Web Service"
3. Connecta el teu repositori de GitHub
4. Selecciona el repositori `ibm-salesforce-context-telemetry`

### 3.3. Configurar el servei

Omple aquests camps:

- **Name**: `ibm-salesforce-context-telemetry` (o el nom que vulguis)
- **Environment**: `Node`
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Plan**: Free (per començar)

### 3.4. Variables d'entorn (opcional)

Si vols canviar el port, afegeix una variable d'entorn:
- **Key**: `PORT`
- **Value**: `3000` (o el port que vulguis)

### 3.5. Desplegar

1. Clica a "Create Web Service"
2. Render començarà a construir i desplegar el teu servidor
3. Espera uns minuts mentre es desplega
4. Quan acabi, tindràs una URL com: `https://ibm-salesforce-context-telemetry.onrender.com`

### 3.6. Provar el desplegament

Un cop desplegat, prova la URL:

```bash
curl https://ibm-salesforce-context-telemetry.onrender.com/
```

Hauries de veure: `MCP Telemetry server is running ✅`

## 🔧 Configuració Avançada

### Canviar el port localment

Si vols executar el servidor en un port diferent:

```bash
PORT=8080 npm start
```

O crea un fitxer `.env`:
```
PORT=8080
```

### Executar en segon pla (background)

Si vols que el servidor segueixi corrent després de tancar la terminal:

**macOS/Linux:**
```bash
nohup npm start &
```

O usa `pm2` per gestionar el procés:
```bash
npm install -g pm2
pm2 start index.js
pm2 list  # Veure processos actius
pm2 stop index.js  # Aturar
```

## 🐛 Solucionar Problemes

### Error: "Port already in use"

Si el port 3000 està ocupat:

1. Troba quin procés l'està usant:
   ```bash
   lsof -i :3000
   ```
2. Mata el procés o canvia el port:
   ```bash
   PORT=3001 npm start
   ```

### Error: "Cannot find module"

Assegura't d'haver executat `npm install` abans de `npm start`.

### El servidor no respon

1. Comprova que el servidor està corrent (hauries de veure el missatge de "listening")
2. Comprova que no hi ha errors a la terminal
3. Prova de reiniciar el servidor

## 📝 Següents Passos

Un cop el servidor estigui funcionant:

1. **Connectar el servidor MCP**: Configura l'IBM Salesforce Context MCP server per enviar telemetria a aquesta URL
2. **Afegir base de dades**: Quan necessitis guardar les dades, pots afegir PostgreSQL o MongoDB
3. **Millorar el logging**: Afegir millors logs i monitoring
4. **Afegir autenticació**: Si necessites seguretat, afegeix autenticació API

## 💡 Consells

- **Desenvolupament local**: Sempre prova localment abans de desplegar
- **Logs**: Revisa els logs a Render per veure què passa
- **Versions**: Assegura't que la versió de Node.js a Render sigui compatible
- **Free tier**: El pla gratuït de Render pot "dormir" després d'inactivitat. El primer cop pot trigar uns segons a "despertar"

## 🆘 Necessites Ajuda?

Si tens problemes:
1. Revisa els logs del servidor
2. Comprova que totes les dependències estan instal·lades
3. Assegura't que el port no està ocupat
4. Verifica que la URL de Render és correcta
