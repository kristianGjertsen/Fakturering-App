import { XmlDocument, XsdValidator } from "libxml2-wasm";

export function validateSaftXml(xml: string, schema: string) {
  const schemaDoc = XmlDocument.fromString(schema);
  try {
    const validator = XsdValidator.fromDoc(schemaDoc);
    try {
      const document = XmlDocument.fromString(xml);
      try { validator.validate(document); }
      finally { document.dispose(); }
    } finally { validator.dispose(); }
  } finally { schemaDoc.dispose(); }
}
