"use client";

import { useState } from "react";

/**
 * Partilha a fatura pelo WhatsApp (ou outra app do telemóvel). Tenta enviar o PDF
 * diretamente; se o aparelho não suportar, partilha o link; no PC abre o WhatsApp Web.
 */
export function ShareInvoice({ url, number, child }: { url: string; number: string; child: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const text = `Fatura ${number} de ${child}`;

  async function share() {
    const absolute = new URL(url, window.location.origin).toString();
    try {
      const res = await fetch(url, { credentials: "same-origin" });
      if (res.ok && navigator.canShare) {
        const blob = await res.blob();
        const file = new File([blob], `fatura-${number}.pdf`, { type: "application/pdf" });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: text, text });
          return;
        }
      }
      if (navigator.share) {
        await navigator.share({ title: text, text: `${text}\n${absolute}`, url: absolute });
        return;
      }
      window.open(`https://wa.me/?text=${encodeURIComponent(`${text}\n${absolute}`)}`, "_blank", "noopener");
    } catch (e) {
      // o utilizador cancelou a partilha: não é erro
      if (e instanceof DOMException && e.name === "AbortError") return;
      setMsg("Não foi possível partilhar. Abra o PDF e envie-o manualmente.");
    }
  }

  return (
    <>
      <button type="button" onClick={share} className="btn btn-secondary">Partilhar no WhatsApp</button>
      {msg && <p className="text-xs text-red-700">{msg}</p>}
    </>
  );
}
