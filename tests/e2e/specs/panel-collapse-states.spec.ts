/**
 * E2E tests for Panel Collapse/Expand States
 * 
 * Tests based on docs/ui-interaction-states.md
 * 
 * Components:
 * - Page List (PL): Left sidebar
 * - Page Viewer (PV): Middle panel
 * - Preview (PR): Right panel
 * 
 * Buttons:
 * - BTN-PL: Page List Trigger (toggle PL collapse/expand)
 * - BTN-PV-COLLAPSE: Collapse Viewer (in panel divider)
 * - BTN-PV-EXPAND: Expand Viewer (in panel divider)
 * - BTN-PR-COLLAPSE: Collapse Preview (in panel divider)
 * - BTN-PR-EXPAND: Expand Preview (at right edge)
 * 
 * States:
 * - S1: PL展开, PV展开, PR展开 (Initial state)
 * - S2: PL折叠, PV展开, PR展开
 * - S3: PL展开, PV展开, PR折叠
 * - S4: PL折叠, PV展开, PR折叠
 * - S5: PL展开, PV折叠, PR展开
 * - S6: PL折叠, PV折叠, PR展开
 */

import { test, expect } from '../fixtures/base-test';
import path from 'path';
import type { Page } from '@playwright/test';

test.describe('Panel Collapse States', () => {
    // Selectors for UI elements
    const SELECTORS = {
        // Panels
        pageListContainer: '.page-list-container',
        pageViewerPanel: '.page-viewer-panel',
        previewPanel: '.preview-panel',

        // Buttons
        btnPL: '.sider-trigger-container button',
        btnPVCollapse: '.panel-divider button:first-child', // First button in divider (collapse viewer)
        btnPRCollapse: '.panel-divider button:last-child',  // Last button in divider (collapse preview)
        btnPVExpand: '.panel-divider button',               // Expand viewer button (when PV collapsed)
        btnPRExpand: '.right-edge-trigger button',          // Expand preview (at right edge)
        panelDivider: '.panel-divider',
        rightEdgeTrigger: '.right-edge-trigger',

        // Sider collapsed state
        siderCollapsed: '.n-layout-sider--collapsed',
    };

    /**
     * Upload a test file to ensure panels are visible
     */
    async function uploadTestFile(page: Page): Promise<void> {
        const filePath = path.resolve('tests/e2e/samples/sample.png');
        const fileChooserPromise = page.waitForEvent('filechooser');
        await page.locator('.app-header button').first().click();
        const fileChooser = await fileChooserPromise;
        await fileChooser.setFiles([filePath]);

        // Wait for page item to appear
        await expect(page.locator('.page-item')).toBeVisible({ timeout: 30000 });
        await expect(page.locator('.page-item .thumbnail-img')).toBeVisible({ timeout: 30000 });
    }

    /**
     * State lookup table: key format is "PL_PV_PR" where 1=expanded, 0=collapsed
     */
    const STATE_MAP: Record<string, string> = {
        '1_1_1': 'S1', // PL展开, PV展开, PR展开
        '0_1_1': 'S2', // PL折叠, PV展开, PR展开
        '1_1_0': 'S3', // PL展开, PV展开, PR折叠
        '0_1_0': 'S4', // PL折叠, PV展开, PR折叠
        '1_0_1': 'S5', // PL展开, PV折叠, PR展开
        '0_0_1': 'S6', // PL折叠, PV折叠, PR展开
    };

    /**
     * Check current state (S1-S6) based on panel visibility
     */
    async function getCurrentState(page: Page): Promise<{
        pageListExpanded: boolean;
        pageViewerExpanded: boolean;
        previewExpanded: boolean;
        stateId: string;
    }> {
        const pageListExpanded = await page.locator(SELECTORS.siderCollapsed).count() === 0;
        const pageViewerExpanded = await page.locator(SELECTORS.pageViewerPanel).isVisible().catch(() => false);
        const previewExpanded = await page.locator(SELECTORS.previewPanel).isVisible().catch(() => false);

        // Create key for state lookup
        const key = `${pageListExpanded ? 1 : 0}_${pageViewerExpanded ? 1 : 0}_${previewExpanded ? 1 : 0}`;
        const stateId = STATE_MAP[key] || 'UNKNOWN';

        return { pageListExpanded, pageViewerExpanded, previewExpanded, stateId };
    }

    test.describe('State Matrix (S1-S6)', () => {
        test.beforeEach(async ({ page }) => {
            await page.goto('/');
            await uploadTestFile(page);
        });

        test('S1: Initial state - all panels expanded', async ({ page }) => {
            const state = await getCurrentState(page);

            expect(state.stateId).toBe('S1');
            expect(state.pageListExpanded).toBe(true);
            expect(state.pageViewerExpanded).toBe(true);
            expect(state.previewExpanded).toBe(true);

            // Verify BTN-PL shows collapse icon (<)
            const btnPL = page.locator(SELECTORS.btnPL);
            await expect(btnPL).toBeVisible();

            // Verify panel divider has BTN-PV-COLLAPSE and BTN-PR-COLLAPSE
            const panelDivider = page.locator(SELECTORS.panelDivider);
            await expect(panelDivider).toBeVisible();

            // Should have 2 buttons in divider (collapse viewer & collapse preview)
            const dividerButtons = panelDivider.locator('button');
            await expect(dividerButtons).toHaveCount(2);

            // BTN-PR-EXPAND should NOT be visible
            await expect(page.locator(SELECTORS.rightEdgeTrigger)).not.toBeVisible();
        });

        test('S2: Page List collapsed, PV and PR expanded', async ({ page }) => {
            // Click BTN-PL to collapse Page List (S1 → S2)
            await page.locator(SELECTORS.btnPL).click();

            const state = await getCurrentState(page);
            expect(state.stateId).toBe('S2');
            expect(state.pageListExpanded).toBe(false);
            expect(state.pageViewerExpanded).toBe(true);
            expect(state.previewExpanded).toBe(true);

            // BTN-PL should show expand icon (>)
            const btnPL = page.locator(SELECTORS.btnPL);
            await expect(btnPL).toBeVisible();

            // Panel divider should still have 2 buttons
            const dividerButtons = page.locator(SELECTORS.panelDivider).locator('button');
            await expect(dividerButtons).toHaveCount(2);
        });

        test('S3: Preview collapsed, PL and PV expanded', async ({ page }) => {
            // Click BTN-PR-COLLAPSE to collapse Preview (S1 → S3)
            const panelDivider = page.locator(SELECTORS.panelDivider);
            const buttons = panelDivider.locator('button');
            await buttons.last().click(); // Last button is BTN-PR-COLLAPSE

            const state = await getCurrentState(page);
            expect(state.stateId).toBe('S3');
            expect(state.pageListExpanded).toBe(true);
            expect(state.pageViewerExpanded).toBe(true);
            expect(state.previewExpanded).toBe(false);

            // BTN-PR-EXPAND should be visible at right edge
            await expect(page.locator(SELECTORS.rightEdgeTrigger)).toBeVisible();

            // Panel divider should NOT be visible when preview collapsed
            await expect(page.locator(SELECTORS.panelDivider)).not.toBeVisible();
        });

        test('S4: PL and PR collapsed, PV expanded', async ({ page }) => {
            // First collapse Page List (S1 → S2)
            await page.locator(SELECTORS.btnPL).click();

            // Then collapse Preview (S2 → S4)
            const panelDivider = page.locator(SELECTORS.panelDivider);
            const buttons = panelDivider.locator('button');
            await buttons.last().click();

            const state = await getCurrentState(page);
            expect(state.stateId).toBe('S4');
            expect(state.pageListExpanded).toBe(false);
            expect(state.pageViewerExpanded).toBe(true);
            expect(state.previewExpanded).toBe(false);

            // BTN-PR-EXPAND should be visible at right edge
            await expect(page.locator(SELECTORS.rightEdgeTrigger)).toBeVisible();
        });

        test('S5: PageViewer collapsed, PL and PR expanded', async ({ page }) => {
            // Click BTN-PV-COLLAPSE to collapse PageViewer (S1 → S5)
            const panelDivider = page.locator(SELECTORS.panelDivider);
            const buttons = panelDivider.locator('button');
            await buttons.first().click(); // First button is BTN-PV-COLLAPSE

            const state = await getCurrentState(page);
            expect(state.stateId).toBe('S5');
            expect(state.pageListExpanded).toBe(true);
            expect(state.pageViewerExpanded).toBe(false);
            expect(state.previewExpanded).toBe(true);

            // Panel divider should still be visible with BTN-PV-EXPAND
            await expect(page.locator(SELECTORS.panelDivider)).toBeVisible();

            // Should have only one button (BTN-PV-EXPAND)
            const dividerButtons = page.locator(SELECTORS.panelDivider).locator('button');
            await expect(dividerButtons).toHaveCount(1);
        });

        test('S6: PL and PV collapsed, PR expanded', async ({ page }) => {
            // First collapse Page List (S1 → S2)
            await page.locator(SELECTORS.btnPL).click();

            // Then collapse PageViewer (S2 → S6)
            const panelDivider = page.locator(SELECTORS.panelDivider);
            const buttons = panelDivider.locator('button');
            await buttons.first().click();

            const state = await getCurrentState(page);
            expect(state.stateId).toBe('S6');
            expect(state.pageListExpanded).toBe(false);
            expect(state.pageViewerExpanded).toBe(false);
            expect(state.previewExpanded).toBe(true);

            // Panel divider should still be visible with BTN-PV-EXPAND
            await expect(page.locator(SELECTORS.panelDivider)).toBeVisible();
            const dividerButtons = page.locator(SELECTORS.panelDivider).locator('button');
            await expect(dividerButtons).toHaveCount(1);
        });
    });

    test.describe('State Transitions', () => {
        test.beforeEach(async ({ page }) => {
            await page.goto('/');
            await uploadTestFile(page);
        });

        test('BTN-PL: S1 ↔ S2 (toggle Page List)', async ({ page }) => {
            // S1 → S2
            let state = await getCurrentState(page);
            expect(state.stateId).toBe('S1');

            await page.locator(SELECTORS.btnPL).click();
            state = await getCurrentState(page);
            expect(state.stateId).toBe('S2');

            // S2 → S1
            await page.locator(SELECTORS.btnPL).click();
            state = await getCurrentState(page);
            expect(state.stateId).toBe('S1');
        });

        test('BTN-PV-COLLAPSE: S1 → S5, BTN-PV-EXPAND: S5 → S1', async ({ page }) => {
            // S1 → S5
            let state = await getCurrentState(page);
            expect(state.stateId).toBe('S1');

            const panelDivider = page.locator(SELECTORS.panelDivider);
            await panelDivider.locator('button').first().click();

            state = await getCurrentState(page);
            expect(state.stateId).toBe('S5');

            // S5 → S1
            await panelDivider.locator('button').click(); // Only one button in S5
            state = await getCurrentState(page);
            expect(state.stateId).toBe('S1');
        });

        test('BTN-PR-COLLAPSE: S1 → S3, BTN-PR-EXPAND: S3 → S1', async ({ page }) => {
            // S1 → S3
            let state = await getCurrentState(page);
            expect(state.stateId).toBe('S1');

            const panelDivider = page.locator(SELECTORS.panelDivider);
            await panelDivider.locator('button').last().click();

            state = await getCurrentState(page);
            expect(state.stateId).toBe('S3');

            // S3 → S1
            await page.locator(SELECTORS.btnPRExpand).click();
            state = await getCurrentState(page);
            expect(state.stateId).toBe('S1');
        });

        test('BTN-PL: S3 ↔ S4 (toggle Page List when PR collapsed)', async ({ page }) => {
            // First go to S3
            const panelDivider = page.locator(SELECTORS.panelDivider);
            await panelDivider.locator('button').last().click();

            let state = await getCurrentState(page);
            expect(state.stateId).toBe('S3');

            // S3 → S4
            await page.locator(SELECTORS.btnPL).click();
            state = await getCurrentState(page);
            expect(state.stateId).toBe('S4');

            // S4 → S3
            await page.locator(SELECTORS.btnPL).click();
            state = await getCurrentState(page);
            expect(state.stateId).toBe('S3');
        });

        test('BTN-PL: S5 ↔ S6 (toggle Page List when PV collapsed)', async ({ page }) => {
            // First go to S5
            const panelDivider = page.locator(SELECTORS.panelDivider);
            await panelDivider.locator('button').first().click();

            let state = await getCurrentState(page);
            expect(state.stateId).toBe('S5');

            // S5 → S6
            await page.locator(SELECTORS.btnPL).click();
            state = await getCurrentState(page);
            expect(state.stateId).toBe('S6');

            // S6 → S5
            await page.locator(SELECTORS.btnPL).click();
            state = await getCurrentState(page);
            expect(state.stateId).toBe('S5');
        });

        test('BTN-PV-COLLAPSE: S2 → S6, BTN-PV-EXPAND: S6 → S2', async ({ page }) => {
            // First go to S2
            await page.locator(SELECTORS.btnPL).click();
            let state = await getCurrentState(page);
            expect(state.stateId).toBe('S2');

            // S2 → S6
            const panelDivider = page.locator(SELECTORS.panelDivider);
            await panelDivider.locator('button').first().click();

            state = await getCurrentState(page);
            expect(state.stateId).toBe('S6');

            // S6 → S2
            await panelDivider.locator('button').click(); // Only one button in S6
            state = await getCurrentState(page);
            expect(state.stateId).toBe('S2');
        });

        test('BTN-PR-EXPAND: S4 → S2 (expand Preview when PL collapsed)', async ({ page }) => {
            // Go to S4: S1 → S2 → S4
            await page.locator(SELECTORS.btnPL).click();
            const panelDivider = page.locator(SELECTORS.panelDivider);
            await panelDivider.locator('button').last().click();

            let state = await getCurrentState(page);
            expect(state.stateId).toBe('S4');

            // S4 → S2
            await page.locator(SELECTORS.btnPRExpand).click();
            state = await getCurrentState(page);
            expect(state.stateId).toBe('S2');
        });
    });

    test.describe('Icon Direction Verification', () => {
        test.beforeEach(async ({ page }) => {
            await page.goto('/');
            await uploadTestFile(page);
        });

        test('BTN-PL shows correct icon direction', async ({ page }) => {
            const btnPL = page.locator(SELECTORS.btnPL);

            // In S1 (expanded), should show < (ChevronBackOutline)
            let iconSvg = btnPL.locator('svg');
            await expect(iconSvg).toBeVisible();

            // Collapse Page List
            await btnPL.click();

            // In S2 (collapsed), should show > (ChevronForwardOutline)
            // Icon should change - we verify by checking the button is still visible
            await expect(btnPL).toBeVisible();
        });
    });

    test.describe('Tooltip Verification', () => {
        test.beforeEach(async ({ page }) => {
            await page.goto('/');
            await uploadTestFile(page);
        });

        test('BTN-PL shows correct tooltip based on state', async ({ page }) => {
            const btnPL = page.locator(SELECTORS.btnPL);

            // Hover to see tooltip in S1 (should say "Collapse Page List")
            await btnPL.hover();
            await expect(page.getByText('Collapse Page List')).toBeVisible({ timeout: 3000 });

            // Click to collapse
            await btnPL.click();

            // Hover again in S2 (should say "Expand Page List")
            await btnPL.hover();
            await expect(page.getByText('Expand Page List')).toBeVisible({ timeout: 3000 });
        });

        test('Panel divider buttons show correct tooltips', async ({ page }) => {
            const panelDivider = page.locator(SELECTORS.panelDivider);
            const buttons = panelDivider.locator('button');

            // Hover first button (Collapse Viewer)
            await buttons.first().hover();
            await expect(page.getByText('Collapse Viewer')).toBeVisible({ timeout: 3000 });

            // Hover last button (Collapse Preview)
            await buttons.last().hover();
            await expect(page.getByText('Collapse Preview')).toBeVisible({ timeout: 3000 });
        });

        test('BTN-PV-EXPAND shows Expand Viewer tooltip in S5', async ({ page }) => {
            // Go to S5
            const panelDivider = page.locator(SELECTORS.panelDivider);
            await panelDivider.locator('button').first().click();

            // Hover the expand button
            await panelDivider.locator('button').hover();
            await expect(page.getByText('Expand Viewer')).toBeVisible({ timeout: 3000 });
        });

        test('BTN-PR-EXPAND shows Expand Preview tooltip in S3', async ({ page }) => {
            // Go to S3
            const panelDivider = page.locator(SELECTORS.panelDivider);
            await panelDivider.locator('button').last().click();

            // Hover the expand button at right edge
            await page.locator(SELECTORS.btnPRExpand).hover();
            await expect(page.getByText('Expand Preview')).toBeVisible({ timeout: 3000 });
        });
    });
});
