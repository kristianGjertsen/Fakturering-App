import { createElement, type ReactElement } from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { InvoicePdfTemplate, type InvoicePdfData } from "../src/pdf/InvoicePdfTemplate";

type VercelRequest = {
  method?: string;
  headers: { "x-pdf-secret"?: string | string[] };
  body?: { invoice?: InvoicePdfData };
};

type VercelResponse = {
  status(code: number): VercelResponse;
  json(body: unknown): VercelResponse;
};

declare const process: { env: Record<string, string | undefined> };

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== "POST") {
    return response.status(405).json({ error: "Method not allowed" });
  }

  const expectedSecret = process.env.PDF_GENERATOR_SECRET ?? process.env.CRON_SECRET;
  const providedSecret = request.headers["x-pdf-secret"];

  if (!expectedSecret || providedSecret !== expectedSecret) {
    return response.status(401).json({ error: "Unauthorized" });
  }

  if (!request.body?.invoice) {
    return response.status(400).json({ error: "Missing invoice" });
  }

  try {
    const document = createElement(InvoicePdfTemplate, { invoice: request.body.invoice }) as ReactElement<DocumentProps>;
    const buffer = await renderToBuffer(document);
    return response.status(200).json({ pdfBase64: bytesToBase64(buffer) });
  } catch (error) {
    console.error("PDF generation failed", error);
    return response.status(500).json({ error: error instanceof Error ? error.message : "PDF generation failed" });
  }
}

function bytesToBase64(bytes: Uint8Array) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";

  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    const value = (first << 16) | ((second ?? 0) << 8) | (third ?? 0);

    output += alphabet[(value >> 18) & 63];
    output += alphabet[(value >> 12) & 63];
    output += second === undefined ? "=" : alphabet[(value >> 6) & 63];
    output += third === undefined ? "=" : alphabet[value & 63];
  }

  return output;
}
