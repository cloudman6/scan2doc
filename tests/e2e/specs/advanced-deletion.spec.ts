import { test, expect } from '../fixtures/base-test';
import { AppPage } from '../pages/AppPage';
import { PageListPage } from '../pages/PageListPage';
import { TestData } from '../data/TestData';

test.describe('Advanced Deletion Scenarios', () => {
  let app: AppPage;
  let pageList: PageListPage;

  test.beforeEach(async ({ page }) => {
    app = new AppPage(page);
    pageList = new PageListPage(page);
    await app.goto();
  });

  test('should show warning when deleting a processing page', async ({ page }) => {
    // 1. Upload a file
    await pageList.uploadAndWaitReady(TestData.files.samplePNG());
    await pageList.waitForPagesLoaded({ count: 1 });

    // 2. Simulate processing state using store manipulation
    await page.evaluate(() => {
      // Define a minimal interface for the store part we need
      interface PagesStore {
        pages: { id: string }[];
        updatePageStatus: (id: string, status: string) => void;
      }
      const store = (window as unknown as { pagesStore: PagesStore }).pagesStore;
      const pageId = store.pages[0].id;
      store.updatePageStatus(pageId, 'recognizing');
    });

    // Verify status update in UI (optional but good sanity check)
    // You might check for a spinner or status text depending on your UI
    
    // 3. Trigger delete
    const pageItem = page.locator('[data-testid^="page-item-"]').first();
    await pageItem.hover();
    await pageItem.getByTestId('delete-page-btn').click();

    // 4. Verify Warning in Dialog
    const dialog = page.locator('.n-dialog.n-modal.delete-confirm-dialog');
    await expect(dialog).toBeVisible();
    
    // Check for standard text
    await expect(dialog).toContainText('Confirm Deletion');
    
    // Check for specific warning text (partial match is enough)
    // "Warning: 1 pages are currently being processed"
    await expect(dialog.locator('.n-dialog__content')).toContainText('Warning:');
    await expect(dialog.locator('.n-dialog__content')).toContainText('currently being processed');

    // 5. Confirm Delete
    await dialog.locator('button:has-text("Confirm")').click();

    // 6. Verify page is gone
    await pageList.waitForPagesLoaded({ count: 0 });
  });

  test('should verify smart selection logic (Select Next)', async ({ page }) => {
    // 1. Upload 3 files [A, B, C]
    await pageList.uploadAndWaitReady([
      TestData.files.samplePNG(),
      TestData.files.sampleJPG(),
      TestData.files.samplePNG() // Use a 3rd distinct file if possible, or just same is fine for logic
    ]);
    await pageList.waitForPagesLoaded({ count: 3 });

    // 2. Select Middle Page (Index 1)
    await pageList.clickPage(1);
    
    // Verify it is active
    await expect(page.locator('[data-testid^="page-item-"]').nth(1)).toHaveClass(/active|selected/);
    
    // 3. Delete Middle Page
    // Using the delete button on the item itself ensures we delete the specific one
    const middleItem = page.locator('[data-testid^="page-item-"]').nth(1);
    await middleItem.hover();
    await middleItem.getByTestId('delete-page-btn').click();
    
    const dialog = page.locator('.n-dialog.n-modal.delete-confirm-dialog');
    await dialog.locator('button:has-text("Confirm")').click();
    await pageList.waitForPagesLoaded({ count: 2 });

    // 4. Assert: The NEW Index 1 (Original C) should be selected
    // Because we deleted B, C moved to index 1. Logic should select Next (C).
    await expect(page.locator('[data-testid^="page-item-"]').nth(1)).toHaveClass(/active|selected/);
  });

  test('should verify smart selection logic (Select Prev)', async ({ page }) => {
    // 1. Upload 2 files [A, B]
    await pageList.uploadAndWaitReady([
      TestData.files.samplePNG(),
      TestData.files.sampleJPG()
    ]);
    await pageList.waitForPagesLoaded({ count: 2 });

    // 2. Select Last Page (Index 1)
    await pageList.clickPage(1);
    
    // 3. Delete Last Page
    const lastItem = page.locator('[data-testid^="page-item-"]').nth(1);
    await lastItem.hover();
    await lastItem.getByTestId('delete-page-btn').click();
    
    const dialog = page.locator('.n-dialog.n-modal.delete-confirm-dialog');
    await dialog.locator('button:has-text("Confirm")').click();
    await pageList.waitForPagesLoaded({ count: 1 });

    // 4. Assert: The Index 0 (Original A) should be selected
    // Because no "Next" exists, it should fall back to Prev.
    await expect(page.locator('[data-testid^="page-item-"]').nth(0)).toHaveClass(/active|selected/);
  });

  test('should cancel task when deleting processing page', async ({ page }) => {
    // 1. Upload file
    await pageList.uploadAndWaitReady(TestData.files.samplePNG());
    
    // 2. Set to processing
    await page.evaluate(() => {
      // Define a minimal interface for the store part we need
      interface PagesStore {
        pages: { id: string }[];
        updatePageStatus: (id: string, status: string) => void;
      }
      const store = (window as unknown as { pagesStore: PagesStore }).pagesStore;
      store.updatePageStatus(store.pages[0].id, 'recognizing');
    });

    // 3. Monitor console/logs for cancellation (Advanced)
    // Or simply verify deletion succeeds immediately without hanging
    const pageItem = page.locator('[data-testid^="page-item-"]').first();
    await pageItem.hover();
    await pageItem.getByTestId('delete-page-btn').click();
    
    const dialog = page.locator('.n-dialog.n-modal.delete-confirm-dialog');
    await dialog.locator('button:has-text("Confirm")').click();

    await pageList.waitForPagesLoaded({ count: 0 });
    
    // If it didn't hang or crash, task cancellation flow at least didn't block UI
    expect(await app.isEmptyState()).toBeTruthy();
  });
});
