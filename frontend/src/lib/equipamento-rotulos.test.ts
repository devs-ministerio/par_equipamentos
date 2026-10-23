import { describe, expect, it } from "vitest";
import type { ItemEquipamento } from "@/services/entregas-equipamento";
import { nomeSemCodigo, posicaoEntreIguais } from "./equipamento-rotulos";

const item = (id: number, descricao: string, codigo = "010925") =>
  ({ id, descricao, codigo_item: codigo }) as ItemEquipamento;

describe("rótulos de equipamento", () => {
  it("remove o código que prefixa a descrição", () => {
    expect(nomeSemCodigo("000253-Arco Cirúrgico")).toBe("Arco Cirúrgico");
    expect(nomeSemCodigo("Mamógrafo")).toBe("Mamógrafo");
  });

  it("itens com mesmo código e nome são distintos e numerados", () => {
    const pos = posicaoEntreIguais([
      item(1, "010925-Mamógrafo"),
      item(2, "Mamógrafo"),
      item(3, "Colposcópio", "000378"),
    ]);
    expect(pos.get(1)).toBe("1/2");
    expect(pos.get(2)).toBe("2/2");
    expect(pos.get(3)).toBeNull();
  });
});
