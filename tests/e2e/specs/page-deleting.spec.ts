import { test, expect } from '../fixtures/base-test';
import { AppPage } from '../pages/AppPage';
import { PageListPage } from '../pages/PageListPage';
import { TestData } from '../data/TestData';

test.describe('Page Deleting', () => {
  let app: AppPage;
  let pageList: PageListPage;

  test.beforeEach(async ({ page }) => {
    app = new AppPage(page);
    pageList = new PageListPage(page);
    await app.goto();
  });

  test('should delete a single page and persist after reload', async ({ page }) => {
    // 1. Upload files
    await pageList.uploadAndWaitReady([TestData.files.samplePNG(), TestData.files.sampleJPG()]);
    const initialCount = await pageList.getPageCount();
    expect(initialCount).toBe(2);

    // 2. Delete the first page
    const pageItem = page.locator('.page-item').first();
    await pageItem.hover();
    await pageItem.locator('button[title="Delete page"]').click();

    // Confirm deletion
    const dialog = page.locator('.n-dialog.n-modal');
    await expect(dialog).toBeVisible();
    await dialog.locator('button:has-text("Confirm")').click();

    // Verify page count decreased
    await pageList.waitForPagesLoaded({ count: initialCount - 1 });

    // Verify success notification (using helper if available, or direct check)
    await expect(page.locator('.n-message:has-text("deleted")')).toBeVisible();

    // 3. Reload page to verify persistence
    await page.reload();
    await app.waitForAppReady();
    await pageList.waitForPagesLoaded({ count: initialCount - 1 });
    await pageList.waitForThumbnailsReady();
  });

  test('should delete multiple pages and persist after reload', async ({ page }) => {
    // 1. Upload multiple files
    await pageList.uploadAndWaitReady([
      TestData.files.samplePNG(), 
      TestData.files.sampleJPG(),
      TestData.files.samplePNG()
    ]);
    
    // Explicitly wait for 3 pages to be sure
    await pageList.waitForPagesLoaded({ count: 3 });
    
    const totalCount = await pageList.getPageCount();
    expect(totalCount).toBe(3);

    // 2. Select 2 pages
    await pageList.selectPage(0);
    await pageList.selectPage(1);
    
    // 3. Delete selected
    await pageList.deleteSelected();

    // 4. Verify page count
    const remainingCount = totalCount - 2;
    await pageList.waitForPagesLoaded({ count: remainingCount });

    // 5. Reload to verify persistence
    await page.reload();
    await app.waitForAppReady();
    await pageList.waitForPagesLoaded({ count: remainingCount });
  });

  test('should delete all pages and show empty state', async ({ page }) => {
    // 1. Upload files
    await pageList.uploadAndWaitReady([TestData.files.samplePNG(), TestData.files.sampleJPG()]);
    
    // 2. Select all
    await pageList.selectAll();
    
    // 3. Delete all
    await pageList.deleteSelected();

    // 4. Verify empty state
    await pageList.waitForPagesLoaded({ count: 0 });
    expect(await app.isEmptyState()).toBeTruthy();

    // 5. Reload to verify empty state persists
    await page.reload();
    await app.waitForAppReady();
    expect(await app.isEmptyState()).toBeTruthy();
  });
});
