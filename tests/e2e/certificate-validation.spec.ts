import { expect, test } from "@playwright/test";

test("certificate form validates required and conditional fields before submission", async ({ page }) => {
  let submitted: Record<string, unknown> | undefined;
  await page.route("**/api/blockchain/create", async route => {
    submitted = route.request().postDataJSON();
    await route.fulfill({
      json: {
        success: true,
        blockchainId: "synthetic-blockchain-id",
        certificateNumber: "synthetic-certificate",
        blockchainHash: "synthetic-hash",
        verificationStatus: "pending",
        aiVerificationStatus: "pending",
        message: "Created",
      },
    });
  });

  await page.goto("/blockchain");
  await page.getByTestId("button-skip-upload").click();
  await page.getByTestId("button-create-blockchain").click();
  await expect(page.getByText("Full legal name is required")).toBeVisible();
  expect(submitted).toBeUndefined();

  await page.getByTestId("input-submitter-name").fill("Test Submitter");
  await page.getByTestId("input-submitter-org").fill("Test Organization");
  await page.getByTestId("input-submitter-email").fill("test@example.invalid");
  await page.getByTestId("input-deceased-name").fill("Test Person");
  await page.getByTestId("input-dob").fill("01011950");
  await page.getByTestId("input-dod").fill("01012020");
  await page.getByTestId("select-state").click();
  await page.getByRole("option", { name: "CA", exact: true }).click();
  await page.getByTestId("input-county").fill("Test County");
  await page.getByTestId("input-issuing-authority").fill("Test Authority");

  await page.getByTestId("switch-is-next-of-kin").click();
  await page.getByTestId("button-create-blockchain").click();
  await expect(page.getByText("Next of kin name is required")).toBeVisible();
  expect(submitted).toBeUndefined();

  await page.getByTestId("switch-is-next-of-kin").click();
  await page.getByTestId("button-create-blockchain").click();
  await expect(page.getByTestId("text-blockchain-id")).toHaveText("synthetic-blockchain-id");
  expect(submitted).toMatchObject({
    deceasedName: "Test Person",
    submitterIsNextOfKin: true,
    nextOfKinName: "Test Submitter",
    nextOfKinEmail: "test@example.invalid",
  });
});
