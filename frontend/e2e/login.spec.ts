import { test, expect } from '@playwright/test';

test.describe('Login Page', () => {
  test('should display login form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText('登录')).toBeVisible();
  });

  test('should redirect to login when not authenticated', async ({ page }) => {
    await page.goto('/projects');
    await expect(page).toHaveURL(/.*login/);
  });

  test('should show validation errors on empty submit', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /登录/ }).click();
    // Should show form validation messages
    await expect(page.locator('.ant-form-item-explain')).toBeVisible();
  });
});
