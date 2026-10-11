import { test, expect } from '@playwright/test';

function uniqueUsername() {
  return `e2euser_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

test.describe('Banksajt E2E', () => {
  test('en besökare utan inloggning kan inte se kontosidan eller transaktionshistoriken', async ({ page }) => {
    await page.goto('/account');
    await page.waitForURL('**/login');
    await expect(page.getByRole('button', { name: /logga in/i })).toBeVisible();

    await page.goto('/transactions');
    await page.waitForURL('**/login');
    await expect(page.getByRole('button', { name: /logga in/i })).toBeVisible();
  });

  test('en ny användare kan registrera sig, logga in, sätta in pengar och se rätt saldo och historik', async ({ page }) => {
    const username = uniqueUsername();
    const password = 'test12345';

    await page.goto('/register');
    await page.getByLabel(/användarnamn/i).fill(username);
    await page.getByLabel(/lösenord/i).fill(password);
    await page.getByRole('button', { name: /skapa användare/i }).click();

    await page.waitForURL('**/login');
    await page.getByLabel(/användarnamn/i).fill(username);
    await page.getByLabel(/lösenord/i).fill(password);
    await page.getByRole('button', { name: /logga in/i }).click();

    await page.waitForURL('**/account');
    await expect(page.getByText(/saldo: 0 kr/i)).toBeVisible();
    await page.getByLabel(/^belopp$/i).fill('250');
    await page.getByRole('button', { name: /sätt in pengar/i }).click();
    await expect(page.getByText(/saldo: 250 kr/i)).toBeVisible();

    await page.getByRole('link', { name: /transaktionshistorik/i }).click();
    await page.waitForURL('**/transactions');
    await expect(page.getByText(/250 kr/i).first()).toBeVisible();
  });

  test('historiken finns kvar efter ny inloggning och ogiltigt belopp ändrar inte saldo eller historik', async ({ page }) => {
    const username = uniqueUsername();
    const password = 'test12345';

    await page.goto('/register');
    await page.getByLabel(/användarnamn/i).fill(username);
    await page.getByLabel(/lösenord/i).fill(password);
    await page.getByRole('button', { name: /skapa användare/i }).click();

    await page.waitForURL('**/login');
    await page.getByLabel(/användarnamn/i).fill(username);
    await page.getByLabel(/lösenord/i).fill(password);
    await page.getByRole('button', { name: /logga in/i }).click();
    await page.waitForURL('**/account');

    await page.getByLabel(/^belopp$/i).fill('100');
    await page.getByRole('button', { name: /sätt in pengar/i }).click();
    await expect(page.getByText(/saldo: 100 kr/i)).toBeVisible();

    // Ogiltigt belopp ska inte ändra saldot (fortfarande inloggad i samma session)
    await page.getByLabel(/^belopp$/i).fill('-50');
    await page.getByRole('button', { name: /sätt in pengar/i }).click();
    await expect(page.getByText(/saldo: 100 kr/i)).toBeVisible();

    // Omladdning tar bort token ur React state - ska skicka till /login
    await page.reload();
    await page.waitForURL('**/login');

    // Logga in på nytt - saldo och historik ska ha funnits kvar i databasen
    await page.getByLabel(/användarnamn/i).fill(username);
    await page.getByLabel(/lösenord/i).fill(password);
    await page.getByRole('button', { name: /logga in/i }).click();
    await page.waitForURL('**/account');
    await expect(page.getByText(/saldo: 100 kr/i)).toBeVisible();

    await page.getByRole('link', { name: /transaktionshistorik/i }).click();
    await page.waitForURL('**/transactions');
    await expect(page.getByText(/100 kr/i).first()).toBeVisible();
  });

  test('ett lyckat uttag minskar saldot och syns i historiken', async ({ page }) => {
    const username = uniqueUsername();
    const password = 'test12345';

    await page.goto('/register');
    await page.getByLabel(/användarnamn/i).fill(username);
    await page.getByLabel(/lösenord/i).fill(password);
    await page.getByRole('button', { name: /skapa användare/i }).click();

    await page.waitForURL('**/login');
    await page.getByLabel(/användarnamn/i).fill(username);
    await page.getByLabel(/lösenord/i).fill(password);
    await page.getByRole('button', { name: /logga in/i }).click();
    await page.waitForURL('**/account');

    await page.getByLabel(/^belopp$/i).fill('500');
    await page.getByRole('button', { name: /sätt in pengar/i }).click();
    await expect(page.getByText(/saldo: 500 kr/i)).toBeVisible();

    await page.getByLabel(/ta ut belopp/i).fill('200');
    await page.getByRole('button', { name: /ta ut pengar/i }).click();
    await expect(page.getByText(/saldo: 300 kr/i)).toBeVisible();

    await page.getByRole('link', { name: /transaktionshistorik/i }).click();
    await page.waitForURL('**/transactions');
    await expect(page.getByText(/uttag/i).first()).toBeVisible();
    await expect(page.getByText(/-200 kr/i).first()).toBeVisible();
  });

  test('ett uttag större än saldot nekas och ändrar varken saldo eller historik', async ({ page }) => {
    const username = uniqueUsername();
    const password = 'test12345';

    await page.goto('/register');
    await page.getByLabel(/användarnamn/i).fill(username);
    await page.getByLabel(/lösenord/i).fill(password);
    await page.getByRole('button', { name: /skapa användare/i }).click();

    await page.waitForURL('**/login');
    await page.getByLabel(/användarnamn/i).fill(username);
    await page.getByLabel(/lösenord/i).fill(password);
    await page.getByRole('button', { name: /logga in/i }).click();
    await page.waitForURL('**/account');

    await page.getByLabel(/^belopp$/i).fill('100');
    await page.getByRole('button', { name: /sätt in pengar/i }).click();
    await expect(page.getByText(/saldo: 100 kr/i)).toBeVisible();

    await page.getByLabel(/ta ut belopp/i).fill('500');
    await page.getByRole('button', { name: /ta ut pengar/i }).click();
    await expect(page.getByText(/saldo: 100 kr/i)).toBeVisible();

    await page.getByRole('link', { name: /transaktionshistorik/i }).click();
    await page.waitForURL('**/transactions');
    await expect(page.getByText(/uttag/i)).toHaveCount(0);
  });

  test('saldo och historik efter uttag finns kvar efter ny inloggning', async ({ page }) => {
    const username = uniqueUsername();
    const password = 'test12345';

    await page.goto('/register');
    await page.getByLabel(/användarnamn/i).fill(username);
    await page.getByLabel(/lösenord/i).fill(password);
    await page.getByRole('button', { name: /skapa användare/i }).click();

    await page.waitForURL('**/login');
    await page.getByLabel(/användarnamn/i).fill(username);
    await page.getByLabel(/lösenord/i).fill(password);
    await page.getByRole('button', { name: /logga in/i }).click();
    await page.waitForURL('**/account');

    await page.getByLabel(/^belopp$/i).fill('400');
    await page.getByRole('button', { name: /sätt in pengar/i }).click();
    await expect(page.getByText(/saldo: 400 kr/i)).toBeVisible();

    await page.getByLabel(/ta ut belopp/i).fill('150');
    await page.getByRole('button', { name: /ta ut pengar/i }).click();
    await expect(page.getByText(/saldo: 250 kr/i)).toBeVisible();

    await page.reload();
    await page.waitForURL('**/login');

    await page.getByLabel(/användarnamn/i).fill(username);
    await page.getByLabel(/lösenord/i).fill(password);
    await page.getByRole('button', { name: /logga in/i }).click();
    await page.waitForURL('**/account');
    await expect(page.getByText(/saldo: 250 kr/i)).toBeVisible();

    await page.getByRole('link', { name: /transaktionshistorik/i }).click();
    await page.waitForURL('**/transactions');
    await expect(page.getByText(/-150 kr/i).first()).toBeVisible();
  });

  test('utloggning tar bort åtkomst till kontosidan', async ({ page }) => {
    const username = uniqueUsername();
    const password = 'test12345';

    await page.goto('/register');
    await page.getByLabel(/användarnamn/i).fill(username);
    await page.getByLabel(/lösenord/i).fill(password);
    await page.getByRole('button', { name: /skapa användare/i }).click();

    await page.waitForURL('**/login');
    await page.getByLabel(/användarnamn/i).fill(username);
    await page.getByLabel(/lösenord/i).fill(password);
    await page.getByRole('button', { name: /logga in/i }).click();
    await page.waitForURL('**/account');

    await page.getByRole('button', { name: /logga ut/i }).click();
    await page.waitForURL('**/login');

    await page.goto('/account');
    await page.waitForURL('**/login');
  });
    test('ett kontoanrop fungerar med giltig token men nekas utan eller med ändrad token', async ({ page, request }) => {
    const username = uniqueUsername();
    const password = 'test12345';

    await page.goto('/register');
    await page.getByLabel(/användarnamn/i).fill(username);
    await page.getByLabel(/lösenord/i).fill(password);
    await page.getByRole('button', { name: /skapa användare/i }).click();

    await page.waitForURL('**/login');

    const sessionResponsePromise = page.waitForResponse(
      (response) => response.url().endsWith('/sessions') && response.request().method() === 'POST'
    );
    await page.getByLabel(/användarnamn/i).fill(username);
    await page.getByLabel(/lösenord/i).fill(password);
    await page.getByRole('button', { name: /logga in/i }).click();
    const sessionResponse = await sessionResponsePromise;
    const { token } = await sessionResponse.json();

    const apiUrl = 'http://127.0.0.1:3011';

    // Giltig token ska fungera
    const okResponse = await request.post(`${apiUrl}/me/accounts`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(okResponse.ok()).toBe(true);

    // Ingen token ska nekas
    const noTokenResponse = await request.post(`${apiUrl}/me/accounts`);
    expect(noTokenResponse.status()).toBe(401);

    // Ändrad token ska nekas
    const tamperedToken = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a');
    const tamperedResponse = await request.post(`${apiUrl}/me/accounts`, {
      headers: { Authorization: `Bearer ${tamperedToken}` },
    });
    expect(tamperedResponse.status()).toBe(401);
  });
});