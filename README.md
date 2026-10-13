## Publicerad sajt
http://ec2-32-199-182-33.compute-1.amazonaws.com

## JWT och säkrare inloggning

### Hur du startar projektet lokalt

1. Klona repot och gå in i projektmappen.
2. Skapa en `.env`-fil i projektets root med `JWT_SECRET` (se nedan för vilka variabler som behövs).
3. Skapa även en `.env`-fil i `backend/` med samma `JWT_SECRET` (används om du kör backend direkt med `npm run dev`, utan Docker).
4. Kör:

docker compose up -d --build

5. Frontend är igång på `http://localhost:3000`, backend på `http://localhost:3001`.

### Miljövariabler som behövs

| Variabel | Beskrivning | Var den används |
|---|---|---|
| `JWT_SECRET` | Hemlig nyckel (minst 32 byte) som signerar och verifierar JWT-tokens | Lokalt (`.env` i root och i `backend/`), GitHub Actions (repository secret), EC2 (`.env` i `~/Docker-bank-sajt`) |
| `DB_PASSWORD` | Lösenord för MySQL-användaren `bank_app` | `docker-compose.yml` |
| `MYSQL_ROOT_PASSWORD` | Root-lösenord för MySQL-containern | `docker-compose.yml` |

Generera en ny nyckel med:

openssl rand -hex 32


Använd **olika** nycklar lokalt, i CI och på EC2 — dela aldrig produktionsnyckeln.

### Hur du kör testerna

**Vitest (backend):**

cd backend
npm test


**Playwright (E2E):**

docker compose -f docker-compose.test.yml up -d --build
cd frontend
npx playwright test
cd ..
docker compose -f docker-compose.test.yml down -v


### Länk till en grön GitHub Actions-körning

https://github.com/mrAli2025/banksajt-jwt/actions/runs/38219954820

### Säkerhetsfrågor

**1. Varför kan du läsa en JWT-payload utan signeringsnyckeln, och vad skyddar signaturen?**

Payloaden är bara Base64url-kodad, inte krypterad — vem som helst kan avkoda den utan att veta någon hemlighet. Signaturen skyddar inte innehållet från att läsas, utan garanterar att det inte gått att ändra utan att upptäckas: signaturen beräknas med header + payload + hemlig nyckel, så om någon ändrar ett enda tecken i payloaden stämmer inte signaturen längre och `jwt.verify()` avvisar token.

**2. Vad händer om någon stjäl en giltig token innan den går ut? Stoppar en signatur den personen?**

Nej, en stulen giltig token fungerar precis lika bra för tjuven som för den riktiga användaren fram tills den går ut. Signaturen skyddar bara mot förfalskning, inte mot stöld. Det är därför vi satt en kort livslängd (15 minuter): det begränsar hur länge en stulen token kan missbrukas.

**3. Vad är skillnaden mellan att hasha ett lösenord och att signera en token?**

Hashning (bcrypt) är enkelriktad — man kan aldrig räkna ut lösenordet från hashen, bara jämföra ett nytt försök mot den sparade hashen. Signering (JWT) är i praktiken tvåvägs: innehållet är fullt läsbart för alla, bara verifierbarheten är skyddad. Man hashar sådant man aldrig behöver läsa tillbaka (lösenord), och signerar sådant man behöver kunna läsa men lita på är äkta (tokens).

**4. Vilken risk finns med att lagra en token i `localStorage` om sidan får en XSS-sårbarhet?**

`localStorage` är tillgängligt för all JavaScript som körs på sidan, inklusive skadlig kod som smugglats in via en XSS-sårbarhet. Om en angripare kan köra egen JS kan den läsa token och skicka den till sin egen server — då har de full åtkomst till kontot tills token går ut. Därför sparar vi token i React state (försvinner vid omladdning) i stället för `localStorage`.

**5. Varför kan servern inte automatiskt veta att en JWT ska sluta gälla när användaren klickar på Logga ut?**

JWT är stateless — servern sparar ingen lista över aktiva tokens, den bara verifierar signaturen och utgångstiden matematiskt vid varje anrop. Det finns ingen central plats att radera token ifrån. "Logga ut" innebär bara att klienten glömmer token; den är fortfarande giltig till den löper ut om någon annan har en kopia av den.

**6. Vilka hemligheter finns i ert projekt, och var ska de lagras lokalt, i GitHub Actions och på EC2?**

Hemligheten är `JWT_SECRET`, plus databasens lösenord (`DB_PASSWORD`, `MYSQL_ROOT_PASSWORD`).
- Lokalt: i en `.env`-fil i projektets root och i `backend/`, aldrig incheckad i Git.
- GitHub Actions: som ett repository secret, en egen separat nyckel.
- EC2: i en `.env`-fil direkt på servern (`~/Docker-bank-sajt/.env`), också en egen nyckel.



## CI/CD med GitHub Actions
Push till main triggar automatiskt:
1. Frontend-kontroller (npm ci, lint, build)
2. Deployment till EC2 via SSH + Docker Compose

## Feature flag
NEXT_PUBLIC_FEATURE_NEW_DASHBOARD styr en informationsbanner på kontosidan.
- false = Deployment (koden finns, funktionen dold)
- true = Release (funktionen synlig)

## Tester

### Vitest (backend, enhetstester)
Testar valideringslogiken för insättning och uttag (`backend/src/validateAmount.js`), utan att starta hela applikationen.

```bash
cd backend
npm test
```

### Playwright (frontend, E2E-tester)
Testar riktiga användarflöden i en webbläsare mot en separat testmiljö (egen databas, egna portar), startad med Docker Compose.

```bash
# Starta testmiljön
docker compose -f docker-compose.test.yml up -d --build

# Kör testerna
cd frontend
npx playwright test

# Stäng ner testmiljön
cd ..
docker compose -f docker-compose.test.yml down -v
```

Testerna täcker bland annat:
- Att en ej inloggad besökare inte kan se konto- eller transaktionssidan
- Registrering → inloggning → insättning → rätt saldo och historik
- Att historik finns kvar efter omladdning och ny inloggning
- Att ett ogiltigt belopp inte ändrar saldo eller historik
- Att ett lyckat uttag minskar saldot och syns i historiken
- Att ett uttag större än saldot nekas utan att ändra saldo eller historik

### CI (GitHub Actions)
Varje push och pull request till `main` kör `frontend`, `backend` och `e2e` som separata jobb. `deploy` till EC2 körs bara vid push till `main`, och bara om alla tre testjobb är gröna.

## Nya funktioner sedan tidigare uppgift
- **Transaktionshistorik** (`/transactions`): visar alla insättningar och uttag för den inloggade användaren, nyast först.
- **Uttag** med skydd mot övertrassering: ett uttag nekas om beloppet är ogiltigt eller större än saldot, och ändrar då varken saldo eller historik.
- **JWT-autentisering**: lösenord hashas med bcrypt, inloggning ger en kortlivad JWT (Bearer-token) istället för en 6-siffrig engångskod, token sparas i React state (inte localStorage).

# Skapa en Banksajt och publicera på aws

I dagens uppgift ska vi öva på att skapa en react-sajt med backend i express och publicera den på en ec2 instans i aws.

### Data i backend

I bankens backend finns tre arrayer: En array `users` för användare, en array `accounts` för bankkonton och en array `sessions` för engångslösenord`.

**Users**
Varje användare har ett id, ett användarnamn och ett lösenord.

[{id: 101, username: “Joe”, password: “hemligt” }, ...]


**Accounts**
Varje bankkonto har ett id, ett användarid och ett saldo.

[{id: 1, userId: 101, amount: 200 }, ...]


**Sessions**
När en användare loggar in skapas ett engångslösenord. Engångslösenordet och användarid läggs i sessions arrayen.

[{userId: 101, token: “nwuefweufh” }, ...]


### Sidor på sajten

Banken har följande sidor på sin sajt:

**Landningssida**
Ska innehålla navigering med länkar till Hem, logga in och skapa användare och en hero-section med knapp till skapa användare

**Skapa användare**
Ett fält för användarnamn och ett för lösenord. Datat ska sparas i arrayen users i backend och ett bankkonto skapas i backend med 0 kr som saldo.

**Logga in**
Ett fält för användarnamn och ett för lösenord och en logga in knapp. När man klickat på knappen ska man få tillbaka sitt engångslösenord i response och skickas till kontosidan med useRouter.

**Kontosida**
Här kan man se sitt saldo och sätta in pengar på kontot. För att göra detta behöver man skicka med sitt engångslösenord till backend.

## Hur du klarar uppgiften

1. Klicka på knappen i uppgfiten för att kopiera repot till ditt github-konto
2. Klona repot till din dator med `git clone ...`

### Skapa frontend

1. Skriv `npx create-next-app frontend`.
2. Gå in i projektet: `cd frontend`.

### Skapa backend

1. Backa en nivå med `cd ..`.
1. Skapa en folder: backend och gå med `cd` in i foldern.
1. Skriv `npm init` och tryck Enter på alla frågor.
1. Lägg till `"type": "module"`i package.json
1. I scripts i package.json lägg till: `"start": "node server.js", "dev": "nodemon server.js"`
1. Installera dependencies: `npm i express cors body-parser`
1. Installera nodemon som dev dependency: `npm i -D nodemon`
1. Börja skriva kod i `server.js`

### Endpoints och arrayer

1. I backend skapa tre tomma arrayer: `users`, `accounts` och `sessions`.
2. Skapa endpoints för:

- Skapa användare (POST): "/users"
- Logga in (POST): "/sessions"
- Visa salodo (POST): "/me/accounts"
- Sätt in pengar (POST): "/me/accounts/transactions"

3. När man loggar in ska ett engångslösenord skapas och skickas tillbaka i response.
4. När man hämtar saldot ska samma engångslösenord skickas med i Post.

### Startkod för server.js i backend

import express from ‘express’;
import bodyParser from ‘body-parser’;
import cors from ‘cors’;

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Generera engångslösenord
function generateOTP() {
// Generera en sexsiffrig numerisk OTP
const otp = Math.floor(100000 + Math.random() * 900000);
return otp.toString();
}

// Din kod här. Skriv dina arrayer

// Din kod här. Skriv dina routes:

// Starta servern
app.listen(port, () => {
console.log(Bankens backend körs på http://localhost:${port});
});


### Exempel på fetch för POST i frontend

fetch(‘http://localhost:3001/users’, {
method: ‘POST’,
headers: {
‘Content-Type’: ‘application/json’,
},
body: JSON.stringify({
username: ‘Användarnamn’,
password: ‘Lösenord’,
}),
})
.then(response => response.json())
.then(data => console.log(data))
.catch((error) => {
console.error(‘Error:’, error);
});


## Automatiska tester – Filstruktur för godkänt nivå

Repositoryt innehåller automatiska tester som körs med GitHub Actions. För att testerna ska kunna starta och använda din lösning måste du följa strukturen nedan. Du får organisera koden inuti mapparna som du vill.

### Projektstruktur och kommandon

```text
frontend/                 # Next.js-projekt
  package.json
  package-lock.json
backend/                  # Express-projekt
  package.json
  package-lock.json
  server.js
```

- Använd `npm` så att båda projekten innehåller en `package-lock.json`.
- `npm run dev` i `frontend` ska starta Next.js på port `3000`.
- `npm run build` i `frontend` ska bygga projektet utan fel.
- `npm start` i `backend` ska starta Express på port `3001`.
- Frontend ska anropa backend på `http://127.0.0.1:3001`.

### Sidor och formulär

Följande routes ska finnas:

- `/` – landningssida med rubrik, navigation och hero-knapp eller länk.
- `/register` – skapa användare.
- `/login` – logga in.
- `/account` – visa saldo och sätt in pengar.

Alla formulärfält ska ha en kopplad `label` så att de går att hitta med sitt namn. Använd tydliga svenska eller engelska namn, exempelvis `Användarnamn`, `Lösenord` och `Belopp`. Efter en lyckad inloggning ska användaren skickas till `/account`. Saldot ska visas med valutan `kr` eller `SEK` och uppdateras efter en insättning.

### API-format

Alla endpoints tar emot och svarar med JSON. Ett lyckat anrop ska ge en statuskod inom `200`–`299`.

```text
POST /users
Body: { "username": "Joe", "password": "hemligt" }

POST /sessions
Body: { "username": "Joe", "password": "hemligt" }
Response: { "token": "123456" }

POST /me/accounts
Body: { "token": "123456" }
Response: { "amount": 0 }

POST /me/accounts/transactions
Body: { "token": "123456", "amount": 250 }
Response: { "amount": 250 }
```

Engångslösenordet ska vara en sträng med sex siffror. En ogiltig token till `/me/accounts` ska ge status `401` eller `403`.

### Kör samma tester lokalt

Installera först dependencies i alla tre mappar och bygg frontend:

```bash
npm ci --prefix frontend
npm ci --prefix backend
npm ci --prefix tests
cd tests && npx playwright install chromium && cd ..
npm run build --prefix frontend
npm test --prefix tests
```

Testkommandot startar frontend och backend automatiskt och stänger dem efter testkörningen.

## Publicera på aws

1. Överför hela projektet till din ec2-instans med t.ex. `rsync`

2. Logga in på din instans med ssh och gå med cd dit projektet ligger.

3. Installera Node.js om det inte redan är installerat.

4. Navigera till din backend-mapp och starta din server med node server.js.

5. Navigera till din frontend-mapp i ett nytt terminalfönster. Kör följande:

npm install
npm run build
npm run start


6. Testa att det funkar genom att gå till din sajt i en webbläsare.

---

### :boom: Success!

Efter denna uppgift ska ni kunna skapa en fullstack sajt med api och publicera på aws.

---

### :runner: VG - uppgift

1. Googla eller fråga ai hur du kan köra frontend och backend i bakgrunden, så att inte sajten går ner när du stänger terminalen. Detta kan t.ex. göras med `pm2`. Skriv sedan länken till din sajt i README.md