import { forwardRef } from "react";
import { Link, type LinkProps, useLocation } from "react-router-dom";
import { caminhoAtual, urlDetalheInstrumento } from "@/lib/navegacao-retorno";

/** Link único para o detalhe do instrumento.
 *
 * Toda origem passa seu caminho atual pela query `retorno`; a página de
 * detalhe o valida e oferece a volta para o mesmo recorte. */
export const LinkDetalheInstrumento = forwardRef<
  HTMLAnchorElement,
  Omit<LinkProps, "to"> & { nrConvenio: string }
>(({ nrConvenio, ...props }, ref) => {
  const location = useLocation();

  return (
    <Link
      ref={ref}
      to={urlDetalheInstrumento(nrConvenio, caminhoAtual(location))}
      {...props}
    />
  );
});

LinkDetalheInstrumento.displayName = "LinkDetalheInstrumento";
