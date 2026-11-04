import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

interface InfoIconProps {
  children: ReactNode;
  /** Mantido por compatibilidade; o posicionamento agora se ajusta ao espaço disponível. */
  align?: "left" | "right";
}

const MARGEM = 8;
const DISTANCIA = 6;

/** Ícone "!" com popup de ajuda. O popup é desenhado fora do contêiner (portal
 * no `body`, posição fixa) para não ser cortado por `overflow` de faixas ou
 * tabelas, e se ajusta às bordas da janela. Abre por mouse, foco ou clique/Enter;
 * fecha com Escape. O clique no ícone nunca chega ao elemento que o contém
 * (ex.: indicador que filtra). */
export function InfoIcon({ children }: InfoIconProps) {
  const [hover, setHover] = useState(false);
  const [fixo, setFixo] = useState(false);
  const [posicao, setPosicao] = useState<{ top: number; left: number } | null>(
    null,
  );
  const disparador = useRef<HTMLSpanElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const popupId = useId();
  const aberto = hover || fixo;

  const reposicionar = useCallback(() => {
    const alvo = disparador.current;
    const caixa = popup.current;
    if (!alvo || !caixa) return;
    const r = alvo.getBoundingClientRect();
    const largura = caixa.offsetWidth;
    const altura = caixa.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = r.left + r.width / 2 - largura / 2;
    left = Math.max(MARGEM, Math.min(left, vw - largura - MARGEM));
    let top = r.bottom + DISTANCIA;
    if (top + altura > vh - MARGEM && r.top - DISTANCIA - altura >= MARGEM) {
      top = r.top - DISTANCIA - altura;
    }
    setPosicao({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (!aberto) {
      setPosicao(null);
      return;
    }
    reposicionar();
  }, [aberto, reposicionar]);

  useEffect(() => {
    if (!aberto) return;
    const fechar = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        setHover(false);
        setFixo(false);
      }
    };
    document.addEventListener("keydown", fechar);
    window.addEventListener("resize", reposicionar);
    window.addEventListener("scroll", reposicionar, true);
    return () => {
      document.removeEventListener("keydown", fechar);
      window.removeEventListener("resize", reposicionar);
      window.removeEventListener("scroll", reposicionar, true);
    };
  }, [aberto, reposicionar]);

  function alternar(e: MouseEvent | KeyboardEvent) {
    // Consultar a ajuda não pode acionar o elemento que contém o ícone.
    e.stopPropagation();
    e.preventDefault();
    setFixo((v) => !v);
  }

  return (
    <span
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <span
        ref={disparador}
        role="button"
        tabIndex={0}
        aria-label="Mais informações"
        aria-expanded={aberto}
        aria-describedby={aberto ? popupId : undefined}
        onFocus={() => setHover(true)}
        onBlur={() => {
          setHover(false);
          setFixo(false);
        }}
        onClick={alternar}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") alternar(e);
          else if (e.key === "Escape") {
            setHover(false);
            setFixo(false);
          }
        }}
        style={{
          width: 15,
          height: 15,
          borderRadius: "50%",
          border: "1.5px solid var(--muted-foreground)",
          color: "var(--muted-foreground)",
          fontSize: 9,
          fontWeight: 700,
          cursor: "help",
          lineHeight: 1,
          padding: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        !
      </span>
      {aberto &&
        createPortal(
          <div
            ref={popup}
            id={popupId}
            role="tooltip"
            style={{
              position: "fixed",
              top: posicao?.top ?? 0,
              left: posicao?.left ?? 0,
              visibility: posicao ? "visible" : "hidden",
              background: "var(--foreground)",
              color: "var(--background)",
              borderRadius: 8,
              padding: "12px 14px",
              minWidth: 220,
              maxWidth: `min(280px, calc(100vw - ${MARGEM * 2}px))`,
              zIndex: 3000,
              fontSize: 12,
              lineHeight: 1.6,
              fontWeight: 400,
              textTransform: "none",
              letterSpacing: 0,
              // whiteSpace explícito: cabeçalhos de coluna usam nowrap e a
              // propriedade é herdada; sem isto o texto nunca quebra linha.
              whiteSpace: "normal",
              boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
              pointerEvents: "none",
            }}
          >
            {children}
          </div>,
          document.body,
        )}
    </span>
  );
}
