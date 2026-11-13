import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MetodologiaPage } from "./metodologia-page";

describe("MetodologiaPage", () => {
  it("PET-CT mostra o próprio parâmetro, sem herdar o do tomógrafo", () => {
    render(<MetodologiaPage equipmentFamily="PET_CT" />);

    expect(screen.getByText(/Pop. SUS-dep. \/ 1.500.000/)).toBeInTheDocument();
    expect(screen.getByText(/1,5 milhão de habitantes/)).toBeInTheDocument();
    expect(screen.queryByText(/100.000$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/raio ≤ 75 km/)).not.toBeInTheDocument();
  });

  it("Tomógrafo informa que a distância não altera o status populacional", () => {
    render(<MetodologiaPage equipmentFamily="TOMOGRAFO" />);

    expect(screen.getByText(/Pop. SUS-dep. \/ 100.000/)).toBeInTheDocument();
    expect(
      screen.getByText(/informativa e não altera o status populacional/),
    ).toBeInTheDocument();
  });

  it("família sem metodologia mostra indisponibilidade, não a de outra família", () => {
    render(<MetodologiaPage equipmentFamily="ULTRASSOM" />);

    expect(
      screen.getByText(/ainda não está documentada nesta página/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Pop. SUS-dep./)).not.toBeInTheDocument();
  });
});
