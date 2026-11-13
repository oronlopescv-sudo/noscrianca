"use client";

import { useState } from "react";
import { whatsappNumber } from "@/lib/collection-rules";

/**
 * Abre o WhatsApp do número SEM mensagem na URL (só wa.me/<número>, que não
 * fica no histórico nem em referrers com nomes de crianças/dívidas) e copia a
 * mensagem para o teclado, para colar ao abrir a conversa.
 */
export function WhatsappButton({ phone, text }: { phone: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const number = whatsappNumber(phone);
  if (!number) return null;
  return (
    <a
      href={`https://wa.me/${number}`}
      target="_blank"
      rel="noopener"
      className="btn btn-secondary btn-sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 4000);
        } catch {
          // sem permissão de clipboard: a mensagem continua acessível em "Copiar mensagem"
        }
      }}
    >
      {copied ? "Mensagem copiada" : "WhatsApp"}
    </a>
  );
}
