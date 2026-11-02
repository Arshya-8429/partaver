import { test, expect } from '@playwright/test';
import ExcelJS from 'exceljs';
import { mkdir } from 'node:fs/promises';

test('PartAvar application separates public site and supports custom mobile part suggestions', async ({ page }) => {
  await page.goto('/app');
  await expect(page.locator('h1')).toContainText('PartAvar');
  await expect(page.locator('[data-area="invoices"]')).toBeVisible();
  await expect(page.locator('#catalogueStatusText')).toHaveAttribute('data-state','online');
  await page.setViewportSize({width:390,height:844});
  await page.locator('#vehicle').fill('X33 Cross CVT');
  await expect(page.locator('.vehicleOption').first()).toBeVisible();
  await page.locator('#vehicle').press('Enter');
  await page.locator('#partQuery').fill('سپر');
  await expect(page.locator('#partList')).toHaveAttribute('role','listbox');
  await expect(page.locator('#partList [role="option"]').first()).toBeVisible();
  expect(await page.locator('#partQuery').getAttribute('list')).toBeNull();
  await page.locator('#partQuery').press('ArrowDown');
  await page.locator('#partQuery').press('Enter');
  await expect(page.locator('#cards .resultCard').first()).toBeVisible();
  await expect(page.locator('#cards .invoiceAction').first()).toBeVisible();
  await page.locator('#partQuery').fill('قطعه‌ای که وجود ندارد 987654321');
  await page.locator('#partClearBtn').click();
  await expect(page.locator('#partList')).toBeHidden();
});

test('package edits keep exact logistics and manual price through saved history, invoice, XLSX and A4 print',async({page})=>{
  await mkdir('reports/partavar',{recursive:true});const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/app');await expect(page.locator('#catalogueStatusText')).toHaveAttribute('data-state','online');
  await page.getByRole('tab',{name:'کد یا نام قطعه'}).click();
  await page.locator('#codeQuery').fill('111100001AA');await page.locator('#codeSearchBtn').click();await expect(page.locator('#cards .resultCard').first()).toBeVisible();
  const cards=page.locator('#cards .resultCard');const identities=await cards.evaluateAll(rows=>rows.slice(0,2).map(row=>({tech:row.querySelectorAll('.codeValue')[0]?.textContent,log:row.querySelectorAll('.codeValue')[1]?.textContent})));
  expect(identities.length).toBe(2);
  await cards.first().locator('.packageAction').click();await expect(page.locator('#toast')).toContainText('افزوده شد');
  await page.locator('[data-area="packages"]').click();const line=page.locator('.docLine').first();await expect(line).toContainText(identities[0]!.log!);
  const manual=line.locator('input[data-doc-key^="price-"]');await manual.fill('12345678901234567890');await manual.dispatchEvent('change');
  const quantity=line.locator('input[data-doc-key^="quantity-"]');await quantity.fill('3');await quantity.dispatchEvent('change');
  await expect(line.locator('.docLineTotal')).toContainText('۳۷٬۰۳۷٬۰۳۶٬۷۰۳٬۷۰۳٬۷۰۳٬۶۷۰');
  await page.reload();await page.locator('[data-area="packages"]').click();await expect(page.locator('.docLine input[data-doc-key^="price-"]').first()).toHaveValue('12345678901234567890');
  await page.locator('.docActions .primary').first().click();await expect(page.locator('.docHistoryItem')).toBeVisible();
  await page.locator('.docHistoryItem button', {hasText:'افزودن به فاکتور'}).click();await expect(page.locator('.docLine')).toHaveCount(1);await expect(page.locator('.docLine .docCode').nth(1).locator('bdi')).toContainText(identities[0]!.log!);
  const invoicePrice=page.locator('.docLine input[data-doc-key^="price-"]').first();await expect(invoicePrice).toHaveValue('12345678901234567890');await expect(page.locator('.docLine input[data-doc-key^="quantity-"]').first()).toHaveValue('3');
  const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'خروجی Excel (.xlsx)'}).click()]);
  const path=await download.path();expect(path).toBeTruthy();const workbook=new ExcelJS.Workbook();await workbook.xlsx.readFile(path!);const worksheet=workbook.worksheets[0]!;
  const rowText=JSON.stringify(worksheet.getRow(5).values);expect(rowText).toContain('12345678901234567890');expect(rowText).toContain(identities[0]!.log!);
  await page.getByRole('button',{name:'نمای چاپ / PDF'}).click();await expect(page.locator('#partavarPrintView')).toBeVisible();await expect(page.locator('#partavarPrintView')).toContainText(identities[0]!.log!);
  const pdf=await page.pdf({format:'A4',printBackground:true});await mkdir('reports/partavar',{recursive:true});const {writeFile}=await import('node:fs/promises');await writeFile('reports/partavar/integrated-invoice.pdf',pdf);await page.screenshot({path:'reports/partavar/integrated-invoice-print.png',fullPage:true});
  expect(errors).toEqual([]);
});
