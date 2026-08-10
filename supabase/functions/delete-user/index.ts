import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { jsonResponse, preflightResponse } from "../_shared/cors.ts";

serve(async (request) => {
  if (request.method === "OPTIONS") {
    return preflightResponse();
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse({ error: "Missing Supabase environment variables." }, 500);
    }

    if (!token) {
      return jsonResponse({ error: "Missing authorization token." }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser(token);

    if (userError || !user) {
      return jsonResponse({ error: "Unauthorized." }, 401);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const [invoices, schedules, companies] = await Promise.all([
      adminClient
        .from("invoices")
        .select("id, pdf_storage_path")
        .eq("owner_user_id", user.id),
      adminClient
        .from("invoice_schedules")
        .select("id")
        .eq("owner_user_id", user.id),
      adminClient
        .from("companies")
        .select("id")
        .eq("owner_user_id", user.id),
    ]);

    const ownerDataError = invoices.error ?? schedules.error ?? companies.error;

    if (ownerDataError) {
      return jsonResponse({ error: ownerDataError.message }, 500);
    }

    const invoiceIds = (invoices.data ?? []).map((invoice) => invoice.id as string);
    const scheduleIds = (schedules.data ?? []).map((schedule) => schedule.id as string);
    const companyIds = (companies.data ?? []).map((company) => company.id as string);
    const attachmentPaths: string[] = [];

    for (let offset = 0; offset < invoiceIds.length; offset += 100) {
      const { data, error } = await adminClient
        .from("invoice_attachments")
        .select("storage_path")
        .in("invoice_id", invoiceIds.slice(offset, offset + 100));

      if (error) {
        return jsonResponse({ error: error.message }, 500);
      }

      attachmentPaths.push(...(data ?? []).map((attachment) => attachment.storage_path as string));
    }

    for (let offset = 0; offset < scheduleIds.length; offset += 100) {
      const { data, error } = await adminClient
        .from("invoice_schedule_attachments")
        .select("storage_path")
        .in("schedule_id", scheduleIds.slice(offset, offset + 100));

      if (error) {
        return jsonResponse({ error: error.message }, 500);
      }

      attachmentPaths.push(...(data ?? []).map((attachment) => attachment.storage_path as string));
    }

    const pdfPaths = (invoices.data ?? [])
      .map((invoice) => invoice.pdf_storage_path as string | null)
      .filter((path): path is string => Boolean(path));

    const invoiceAttachmentPaths = [...new Set(attachmentPaths)];
    const invoicePdfPaths = [...new Set(pdfPaths)];
    const companyLogoPaths = companyIds.map((companyId) => `${user.id}/${companyId}/logo.png`);

    for (let offset = 0; offset < invoiceAttachmentPaths.length; offset += 100) {
      const { error: storageError } = await adminClient.storage
        .from("invoice-attachments")
        .remove(invoiceAttachmentPaths.slice(offset, offset + 100));

      if (storageError) {
        return jsonResponse({ error: storageError.message }, 500);
      }
    }

    for (let offset = 0; offset < invoicePdfPaths.length; offset += 100) {
      const { error: storageError } = await adminClient.storage
        .from("invoice-pdfs")
        .remove(invoicePdfPaths.slice(offset, offset + 100));

      if (storageError) {
        return jsonResponse({ error: storageError.message }, 500);
      }
    }

    for (let offset = 0; offset < companyLogoPaths.length; offset += 100) {
      const { error: storageError } = await adminClient.storage
        .from("company-logos")
        .remove(companyLogoPaths.slice(offset, offset + 100));

      if (storageError) {
        return jsonResponse({ error: storageError.message }, 500);
      }
    }

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);

    if (deleteError) {
      return jsonResponse({ error: deleteError.message }, 500);
    }

    return jsonResponse({ success: true });
  } catch (error) {
    console.error("delete-user failed", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown delete-user error." },
      500,
    );
  }
});
