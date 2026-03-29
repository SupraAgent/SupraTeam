/**
 * Shared custom fields CRUD utility.
 * Used by deal, contact, and group custom field APIs.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

interface BulkUpdateFieldParams {
  supabase: SupabaseClient;
  fieldsTable: string;
  valuesTable: string;
  fields: Array<{
    id?: string;
    field_name: string;
    label: string;
    field_type: string;
    options?: unknown;
    required?: boolean;
    board_type?: string | null;
  }>;
  extraColumns?: (f: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * List custom field definitions from a table.
 */
export async function listFields(
  supabase: SupabaseClient,
  fieldsTable: string
) {
  const { data, error } = await supabase
    .from(fieldsTable)
    .select("*")
    .order("position");

  return { fields: data ?? [], error };
}

/**
 * List field values for an entity (deal, contact, group).
 */
export async function listFieldValues(
  supabase: SupabaseClient,
  valuesTable: string,
  entityColumn: string,
  entityId: string
): Promise<Record<string, string>> {
  const { data } = await supabase
    .from(valuesTable)
    .select("field_id, value")
    .eq(entityColumn, entityId);

  const values: Record<string, string> = {};
  for (const fv of data ?? []) {
    values[fv.field_id] = fv.value ?? "";
  }
  return values;
}

/**
 * Bulk update field definitions: upsert new/updated, delete removed.
 */
export async function bulkUpdateFields({
  supabase,
  fieldsTable,
  valuesTable,
  fields,
  extraColumns,
}: BulkUpdateFieldParams) {
  const { data: existing } = await supabase.from(fieldsTable).select("id");
  const existingIds = new Set((existing ?? []).map((f) => f.id));
  const incomingIds = new Set(
    fields.filter((f) => f.id).map((f) => f.id as string)
  );

  // Delete removed fields and their values
  const toDelete = [...existingIds].filter((id) => !incomingIds.has(id));
  if (toDelete.length > 0) {
    await supabase.from(valuesTable).delete().in("field_id", toDelete);
    await supabase.from(fieldsTable).delete().in("id", toDelete);
  }

  // Upsert each field
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    const data: Record<string, unknown> = {
      field_name: f.field_name,
      label: f.label,
      field_type: f.field_type,
      options: f.options || null,
      required: f.required || false,
      position: i + 1,
    };

    // Allow extra columns (e.g. board_type for deal fields)
    if (extraColumns) {
      Object.assign(data, extraColumns(f as Record<string, unknown>));
    }

    if (f.id && existingIds.has(f.id)) {
      await supabase.from(fieldsTable).update(data).eq("id", f.id);
    } else {
      await supabase.from(fieldsTable).insert(data);
    }
  }

  // Return fresh list
  const { data: updated } = await supabase
    .from(fieldsTable)
    .select("*")
    .order("position");

  return { fields: updated ?? [] };
}

/**
 * Save field values for an entity (upsert pattern).
 */
export async function saveFieldValues(
  supabase: SupabaseClient,
  valuesTable: string,
  entityColumn: string,
  entityId: string,
  values: Record<string, string>,
  conflictKey: string
) {
  for (const [fieldId, value] of Object.entries(values)) {
    await supabase.from(valuesTable).upsert(
      {
        [entityColumn]: entityId,
        field_id: fieldId,
        value: value || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: conflictKey }
    );
  }
}
