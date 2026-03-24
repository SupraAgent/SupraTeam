/**
 * Template variable substitution for outreach sequences.
 * Replaces {{var}} and {{var|default}} patterns in message templates.
 */

export function renderTemplate(
  template: string,
  vars: Record<string, string | null | undefined>
): string {
  return template.replace(/\{\{(\w+)(?:\|([^}]*))?\}\}/g, (_, key, fallback) => {
    const val = vars[key];
    if (val != null && val !== "") return val;
    if (fallback != null) return fallback;
    return "";
  });
}

/**
 * Build template variables from deal + contact data.
 */
export function buildOutreachVars(data: {
  contact_name?: string | null;
  contact_first_name?: string | null;
  deal_name?: string | null;
  stage?: string | null;
  company?: string | null;
  value?: number | null;
}): Record<string, string> {
  const vars: Record<string, string> = {};

  if (data.contact_name) vars.contact_name = data.contact_name;
  if (data.contact_first_name) {
    vars.contact_first_name = data.contact_first_name;
  } else if (data.contact_name) {
    vars.contact_first_name = data.contact_name.split(" ")[0];
  }
  if (data.deal_name) vars.deal_name = data.deal_name;
  if (data.stage) vars.stage = data.stage;
  if (data.company) vars.company = data.company;
  if (data.value != null) vars.value = `$${Number(data.value).toLocaleString()}`;

  return vars;
}
