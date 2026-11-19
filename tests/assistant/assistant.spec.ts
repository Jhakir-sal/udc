import {
  test, expect, caseA, caseB, paste, account, harnessPath, assistantPath, analyzePath,
  importPath, respond, defer, openAssistant, send, switchCase, hitAndClick,
} from "./fixtures";

test("one auto-analysis per paste; explicit review saves only approved metadata to the current case", async ({ page, stub }) => {
  respond(stub, analyzePath(), { accounts: [account], warnings: [] });
  respond(stub, importPath(), { created: [{ id: "synthetic-account" }], skipped: 0, message: "" });
  respond(stub, assistantPath(), { reply: "Synthetic summary" });
  await openAssistant(page);
  await send(page, paste);
  await expect(page.getByTestId("reviewfields")).toBeVisible();
  expect(stub.calls.filter((c) => c.path === analyzePath())).toEqual([{ path: analyzePath(), body: { text: paste } }]);
  expect(stub.calls.filter((c) => c.path === assistantPath())).toHaveLength(0);
  await expect(page.getByTestId("confirm")).not.toBeChecked();
  await expect(page.getByTestId("create")).toBeDisabled();
  expect(stub.calls.filter((c) => c.path === importPath())).toHaveLength(0);

  await page.getByTestId("confirm").check();
  // Editing reviewed data must revoke the earlier confirmation.
  await page.getByTestId("review-name-0").fill("Synthetic Reviewed Bank");
  await expect(page.getByTestId("confirm")).not.toBeChecked();
  await expect(page.getByTestId("create")).toBeDisabled();
  await page.getByTestId("confirm").check();
  await page.getByTestId("create").click();
  await expect(page.getByText("Account intake complete", { exact: true })).toBeVisible();
  expect(stub.calls.filter((c) => c.path === importPath())).toEqual([{
    path: importPath(caseA),
    body: { confirmed: true, accounts: [{ ...account, accountName: "Synthetic Reviewed Bank" }] },
  }]);
  expect(stub.calls.filter((c) => c.path === analyzePath())).toHaveLength(1);

  await page.getByTestId("button-assistant-back-to-chat").click();
  await expect(page.getByTestId("assistant-chat-mode")).not.toContainText(paste);
  await send(page, "Summarize this case.");
  await expect(page.getByTestId("message-assistant")).toHaveText("Synthetic summary");
  expect(stub.calls.find((c) => c.path === assistantPath())!.body).toEqual({
    messages: [{ role: "user", content: "Summarize this case." }],
  });
  // A second paste is a new intent, but still receives just one analysis.
  await send(page, paste);
  await expect(page.getByTestId("reviewfields")).toBeVisible();
  expect(stub.calls.filter((c) => c.path === analyzePath())).toHaveLength(2);
  await expect(page.getByTestId("confirm")).not.toBeChecked();
});

test("summaries, account questions, and email drafts stay in advisory chat with normal history", async ({ page, stub }) => {
  respond(stub, assistantPath(), { reply: "Synthetic advisory reply" });
  await openAssistant(page);
  await page.getByTestId("button-quick-summarize-case").click();
  await expect(page.getByTestId("message-assistant")).toHaveCount(1);
  await send(page, "What is the status of the checking account ending 1012?");
  await expect(page.getByTestId("message-assistant")).toHaveCount(2);
  await send(page, "Draft an email to Synthetic Community Bank about account ending 1012.");
  await expect(page.getByTestId("message-assistant")).toHaveCount(3);
  expect(stub.calls).toHaveLength(3);
  expect(stub.calls.every((c) => c.path === assistantPath())).toBe(true);
  expect(stub.calls[2].body.messages.map((m: { role: string }) => m.role))
    .toEqual(["user", "assistant", "user", "assistant", "user"]);
  await expect(page.getByTestId("assistant-account-intake-mode")).toHaveCount(0);
});

test("manual account action analyzes existing pasted text once and never sends it to chat", async ({ page, stub }) => {
  respond(stub, analyzePath(), { accounts: [account], warnings: [] });
  await openAssistant(page);
  await page.getByTestId("input-assistant-message").fill(paste);
  await page.getByTestId("button-assistant-read-accounts").click();
  await expect(page.getByTestId("reviewfields")).toBeVisible();
  expect(stub.calls).toEqual([{ path: analyzePath(), body: { text: paste } }]);
  await page.getByTestId("button-assistant-back-to-chat").click();
  await expect(page.getByTestId("input-assistant-message")).toHaveValue("");
  await expect(page.getByTestId("assistant-chat-mode")).not.toContainText("987654321012");
  await page.getByTestId("button-assistant-read-accounts").click();
  await expect(page.getByTestId("paste")).toHaveValue("");
  await expect(page.getByTestId("analyze")).toBeDisabled();
  expect(stub.calls).toHaveLength(1);
});

test("late old-case chat reply cannot appear in a new case or its outbound history", async ({ page, stub }) => {
  const release = defer(stub, assistantPath());
  respond(stub, assistantPath(caseB), { reply: "Blair summary" });
  await openAssistant(page);
  await send(page, "Summarize Alex's case.");
  await expect.poll(() => stub.calls.length).toBe(1);
  await switchCase(page, caseB);
  const finished = page.waitForResponse((r) => r.url().endsWith(assistantPath()) && r.status() === 200);
  release({ reply: "OLD_CASE_CHAT_DO_NOT_SHOW" });
  await finished;
  await expect(page.getByTestId("button-send-assistant")).toBeDisabled();
  await send(page, "Summarize Blair's case.");
  await expect(page.getByTestId("message-assistant")).toHaveText("Blair summary");
  await expect(page.getByRole("dialog")).not.toContainText("OLD_CASE_CHAT_DO_NOT_SHOW");
  expect(stub.calls[1]).toEqual({
    path: assistantPath(caseB), body: { messages: [{ role: "user", content: "Summarize Blair's case." }] },
  });
});

test("late old-case analysis cannot populate or save into a new case", async ({ page, stub }) => {
  const release = defer(stub, analyzePath());
  const newAccount = { ...account, accountName: "Blair Synthetic Savings", accountType: "Savings" };
  respond(stub, analyzePath(caseB), { accounts: [newAccount], warnings: [] });
  respond(stub, importPath(caseB), { created: [{ id: "blair-account" }], skipped: 0, message: "" });
  await openAssistant(page);
  await send(page, paste);
  await expect.poll(() => stub.calls.length).toBe(1);
  await switchCase(page, caseB);
  await page.getByTestId("button-assistant-read-accounts").click();
  await expect(page.getByTestId("paste")).toHaveValue("");
  const finished = page.waitForResponse((r) => r.url().endsWith(analyzePath()) && r.status() === 200);
  release({ accounts: [{ ...account, accountName: "OLD_CASE_ACCOUNT_DO_NOT_SHOW" }], warnings: [] });
  await finished;
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  await expect(page.getByTestId("reviewfields")).toHaveCount(0);
  await expect(page.getByTestId("paste")).toHaveValue("");
  await expect(page.getByRole("dialog")).not.toContainText("OLD_CASE_ACCOUNT_DO_NOT_SHOW");
  await page.getByTestId("paste").fill("Synthetic savings account ending 2222");
  await page.getByTestId("analyze").click();
  await expect(page.getByTestId("review-name-0")).toHaveValue(newAccount.accountName);
  await expect(page.getByTestId("confirm")).not.toBeChecked();
  await expect(page.getByRole("dialog")).not.toContainText("OLD_CASE_ACCOUNT_DO_NOT_SHOW");
  await page.getByTestId("confirm").check();
  await page.getByTestId("create").click();
  await expect(page.getByText("Account intake complete", { exact: true })).toBeVisible();
  expect(stub.calls.filter((c) => c.path.endsWith("/import"))).toEqual([{
    path: importPath(caseB), body: { confirmed: true, accounts: [newAccount] },
  }]);
});

test("switching cases discards a completed, confirmed review instead of reusing its save", async ({ page, stub }) => {
  respond(stub, analyzePath(), { accounts: [account], warnings: [] });
  await openAssistant(page);
  await send(page, paste);
  await expect(page.getByTestId("reviewfields")).toBeVisible();
  await page.getByTestId("confirm").check();
  await expect(page.getByTestId("create")).toBeEnabled();
  await switchCase(page, caseB);
  await page.getByTestId("button-assistant-read-accounts").click();
  await expect(page.getByTestId("paste")).toHaveValue("");
  await expect(page.getByTestId("reviewfields")).toHaveCount(0);
  expect(stub.calls.filter((c) => c.path.endsWith("/import"))).toHaveLength(0);
});

test("attachments remain advisory and show the pasted-text-only account action warning", async ({ page, stub }) => {
  respond(stub, assistantPath(), { reply: "Synthetic attachment analysis" });
  await openAssistant(page);
  const attachment = {
    name: "synthetic-statement.png", mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=", "base64"),
  };
  await page.getByTestId("input-assistant-file").setInputFiles(attachment);
  await expect(page.getByTestId("badge-attachment")).toContainText("synthetic-statement.png");
  await expect(page.getByTestId("button-assistant-read-accounts")).toBeDisabled();
  await expect(page.getByText("Remove the attached file before opening account intake. Your attachment will stay here.")).toBeVisible();
  await send(page, "Analyze the attached statement.");
  await expect(page.getByTestId("message-assistant")).toHaveText("Synthetic attachment analysis");
  expect(stub.calls).toHaveLength(1);
  expect(stub.calls[0].path).toBe(assistantPath());
  expect(stub.calls[0].body).toMatchObject({
    documentName: "synthetic-statement.png",
    messages: [{ role: "user", content: "Analyze the attached statement." }],
  });
  expect(stub.calls[0].body.documentDataUrl).toMatch(/^data:image\/png;base64,/);
  await expect(page.getByTestId("badge-attachment")).toHaveCount(0);
  await expect(page.getByTestId("button-assistant-read-accounts")).toBeEnabled();
  await page.getByTestId("input-assistant-file").setInputFiles(attachment);
  await expect(page.getByTestId("button-assistant-read-accounts")).toBeDisabled();
  await page.getByTestId("button-remove-attachment").click();
  await expect(page.getByTestId("button-assistant-read-accounts")).toBeEnabled();
  await page.getByTestId("button-assistant-read-accounts").click();
  await expect(page.getByTestId("paste")).toHaveValue("");
  expect(stub.calls).toHaveLength(1);
});

test("Sally already open does not block the case composer; standalone toggle and close still work", async ({ page, stub }) => {
  respond(stub, assistantPath(), { reply: "Case composer works" });
  respond(stub, "/api/sally/chat", { reply: "Standalone Sally works" });
  await page.goto(harnessPath);
  const toggle = page.getByTestId("button-sally-toggle");
  await hitAndClick(page, toggle);
  await expect(page.getByTestId("input-sally-message")).toBeFocused();
  await page.getByTestId("input-sally-message").fill("How do I upload a document?");
  await page.getByTestId("button-sally-send").click();
  await expect(page.getByTestId("panel-sally-chat")).toContainText("Standalone Sally works");
  await page.getByTestId("button-open-assistant").click();
  const composer = page.getByTestId("input-assistant-message");
  await hitAndClick(page, composer);
  await composer.pressSequentially("Summarize this case.");
  await expect(composer).toBeFocused();
  await hitAndClick(page, page.getByTestId("button-send-assistant"));
  await expect(page.getByTestId("message-assistant")).toHaveText("Case composer works");
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByTestId("panel-sally-chat")).toBeVisible();
  await expect(page.getByTestId("panel-sally-chat")).toContainText("Standalone Sally works");
  await hitAndClick(page, page.getByTestId("button-sally-close"));
  await expect(page.getByTestId("panel-sally-chat")).toHaveCount(0);
  await hitAndClick(page, toggle);
  await expect(page.getByTestId("input-sally-message")).toBeFocused();
  await expect(page.getByTestId("panel-sally-chat")).toContainText("Standalone Sally works");
  await hitAndClick(page, toggle);
  await expect(page.getByTestId("panel-sally-chat")).toHaveCount(0);
  expect(stub.calls.filter((c) => c.path === "/api/sally/chat")).toHaveLength(1);
  expect(stub.calls.filter((c) => c.path === assistantPath())).toHaveLength(1);
});
