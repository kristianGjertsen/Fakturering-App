import { FileText, Download, Trash2, Upload } from "@animateicons/react/lucide";
import { useEffect, useRef, useState } from "react";
import { AnimatedIconButton } from "../../../components/AnimatedIconButton";
import { Button } from "../../../components/Button";
import { Panel, PanelHeader } from "../../../components/layout/Panel";
import { formatFileSize } from "../../../lib/attachments";
import {
  deleteSaftImportFile,
  downloadSaftImportFile,
  fetchSaftImportFiles,
  SAFT_IMPORT_ACCEPT,
  uploadAndImportSaftFile,
  validateSaftImportFile,
} from "../../../lib/saftImportData";
import type { SaftImportFile } from "../../../types";
import type { ProfileFeedbackTone } from "./ProfileForm";

type SaftImportPanelProps = {
  userId: string;
  onFeedback: (message: string, tone: ProfileFeedbackTone) => void;
  onImported?: () => Promise<void>;
};

const statusLabel: Record<SaftImportFile["status"], string> = {
  uploaded: "Lastet opp",
  validating: "Validerer",
  validated: "Validert",
  imported: "Importert",
  failed: "Feilet",
};

export function SaftImportPanel({ userId, onFeedback, onImported }: SaftImportPanelProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<SaftImportFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [busyFileId, setBusyFileId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadFiles() {
      setLoading(true);
      try {
        const saftFiles = await fetchSaftImportFiles();
        if (!cancelled) {
          setFiles(saftFiles);
        }
      } catch (error) {
        if (!cancelled) {
          onFeedback(error instanceof Error ? error.message : "Kunne ikke hente SAF-T-filer.", "danger");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadFiles();

    return () => {
      cancelled = true;
    };
  }, [onFeedback]);

  async function handleFileSelection(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file || uploading) {
      return;
    }

    const validationError = validateSaftImportFile(file);
    if (validationError) {
      onFeedback(validationError, "danger");
      resetInput();
      return;
    }

    setUploading(true);
    onFeedback("", "info");

    try {
      const { file: uploadedFile, message } = await uploadAndImportSaftFile(userId, file);
      setFiles((current) => [uploadedFile, ...current]);
      await onImported?.();
      onFeedback(message, "info");
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : "Kunne ikke laste opp SAF-T-filen.", "danger");
    } finally {
      setUploading(false);
      resetInput();
    }
  }

  async function handleDownload(file: SaftImportFile) {
    setBusyFileId(file.id);
    try {
      await downloadSaftImportFile(file);
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : "Kunne ikke laste ned SAF-T-filen.", "danger");
    } finally {
      setBusyFileId(null);
    }
  }

  async function handleDelete(file: SaftImportFile) {
    setBusyFileId(file.id);
    try {
      await deleteSaftImportFile(file);
      setFiles((current) => current.filter((item) => item.id !== file.id));
      onFeedback("SAF-T-filen er slettet.", "info");
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : "Kunne ikke slette SAF-T-filen.", "danger");
    } finally {
      setBusyFileId(null);
    }
  }

  function resetInput() {
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  return (
    <Panel>
      <PanelHeader
        title="SAF-T"
        description="Last opp eksisterende SAF-T-fil som grunnlag for kontroll, import eller videre SAF-T-arbeid."
      />

      <div className="mt-5 rounded-md border border-dashed border-blue-200 bg-blue-50 p-4">
        <input
          ref={inputRef}
          className="sr-only"
          type="file"
          accept={SAFT_IMPORT_ACCEPT}
          onChange={(event) => void handleFileSelection(event.currentTarget.files)}
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-950">Importer SAF-T-fil</p>
            <p className="mt-1 text-sm text-slate-600">XML eller ZIP, maksimalt 50 MB.</p>
          </div>
          <Button
            type="button"
            className="w-full sm:w-auto"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            help="XML-filer importerer firma, kontoplan, kunder, leverandører, MVA-koder, åpningsbalanse og bilag. ZIP-filer lagres som originalfil til XML-en kan lastes opp."
          >
            <Upload size={16} />
            {uploading ? "Laster opp..." : "Last opp SAF-T"}
          </Button>
        </div>
      </div>

      <div className="mt-5">
        {loading ? (
          <p className="text-sm text-slate-500">Laster SAF-T-filer...</p>
        ) : files.length === 0 ? (
          <p className="text-sm text-slate-500">Ingen SAF-T-filer er lastet opp.</p>
        ) : (
          <ul className="divide-y divide-blue-100 rounded-md border border-blue-100">
            {files.map((file) => (
              <li key={file.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <FileText size={20} className="mt-0.5 shrink-0 text-blue-700" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-950">{file.original_name}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatFileSize(file.size_bytes)} · {statusLabel[file.status]} · {new Date(file.created_at).toLocaleString("nb-NO")}
                    </p>
                    {file.import_summary && Object.keys(file.import_summary).length > 0 && (
                      <p className="mt-1 text-xs text-slate-500">
                        {file.import_summary.accounts ?? 0} kontoer · {file.import_summary.taxCodes ?? 0} MVA-koder · {file.import_summary.journalEntries ?? 0} bilag
                        {file.import_summary.openingBalanceLines ? ` · ${file.import_summary.openingBalanceLines} åpningslinjer` : ""}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 self-end sm:self-auto">
                  <AnimatedIconButton
                    icon={Download}
                    variant="secondary"
                    size="xs"
                    disabled={busyFileId === file.id}
                    onClick={() => void handleDownload(file)}
                  >
                    <span className="sr-only">Last ned SAF-T-fil</span>
                  </AnimatedIconButton>
                  <AnimatedIconButton
                    icon={Trash2}
                    variant="danger"
                    size="xs"
                    disabled={busyFileId === file.id}
                    onClick={() => void handleDelete(file)}
                  >
                    <span className="sr-only">Slett SAF-T-fil</span>
                  </AnimatedIconButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}
