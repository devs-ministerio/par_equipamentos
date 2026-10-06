import { expect, test } from "@playwright/test";

test("clone local: login, dados oficiais, instrumentos e painel reais", async ({
  page,
}) => {
  const base = process.env.E2E_BASE_URL;
  test.skip(
    !base || !process.env.E2E_EMAIL || !process.env.E2E_SENHA,
    "Exige ambiente local explícito",
  );
  expect(new URL(base!).hostname).toBe("127.0.0.1");
  const falhas: number[] = [];
  page.on("response", (resposta) => {
    if (
      new URL(resposta.url()).origin === "http://127.0.0.1:8001" &&
      resposta.status() >= 500
    ) {
      falhas.push(resposta.status());
    }
  });
  await page.goto("/login");
  await page.getByLabel("Email").fill(process.env.E2E_EMAIL!);
  await page.getByLabel("Senha").fill(process.env.E2E_SENHA!);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/monitoramento-equipamentos$/, {
    timeout: 20_000,
  });
  for (const [rota, titulo] of [
    ["/monitoramento-equipamentos", /Instrumentos e repasses/i],
    [
      "/monitoramento-equipamentos/instrumentos",
      /Instrumentos|Mesa de trabalho/i,
    ],
    ["/monitoramento-equipamentos/painel", /Painel de gestão/i],
  ] as const) {
    await page.goto(rota);
    await expect(
      page.getByRole("heading", { level: 1, name: titulo }),
    ).toBeVisible();
    await expect(
      page.getByText("Não foi possível carregar os dados", { exact: true }),
    ).toHaveCount(0);
  }
  await expect(
    page.getByRole("heading", { name: "Prazos e pendências" }),
  ).toBeVisible();
  expect(falhas).toEqual([]);
});
