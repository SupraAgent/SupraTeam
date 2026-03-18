"use client";

import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { PipelineStage, Contact } from "@/lib/types";

type CreateDealModalProps = {
  open: boolean;
  onClose: () => void;
  stages: PipelineStage[];
  contacts: Contact[];
  onCreated: () => void;
};

export function CreateDealModal({ open, onClose, stages, contacts, onCreated }: CreateDealModalProps) {
  const [loading, setLoading] = React.useState(false);
  const [dealName, setDealName] = React.useState("");
  const [boardType, setBoardType] = React.useState("BD");
  const [stageId, setStageId] = React.useState("");
  const [contactId, setContactId] = React.useState("");
  const [value, setValue] = React.useState("");

  React.useEffect(() => {
    if (open && stages.length > 0 && !stageId) {
      setStageId(stages[0].id);
    }
  }, [open, stages, stageId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!dealName || !stageId) return;
    setLoading(true);

    try {
      const res = await fetch("/api/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deal_name: dealName,
          board_type: boardType,
          stage_id: stageId,
          contact_id: contactId || null,
          value: value ? Number(value) : null,
        }),
      });

      if (res.ok) {
        setDealName("");
        setBoardType("BD");
        setStageId(stages[0]?.id ?? "");
        setContactId("");
        setValue("");
        onCreated();
        onClose();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create Deal">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Deal Name *</label>
          <Input
            value={dealName}
            onChange={(e) => setDealName(e.target.value)}
            placeholder="e.g. Acme Inc Partnership"
            className="mt-1"
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Board *</label>
            <Select
              value={boardType}
              onChange={(e) => setBoardType(e.target.value)}
              options={[
                { value: "BD", label: "BD" },
                { value: "Marketing", label: "Marketing" },
                { value: "Admin", label: "Admin" },
              ]}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Stage *</label>
            <Select
              value={stageId}
              onChange={(e) => setStageId(e.target.value)}
              options={stages.map((s) => ({ value: s.id, label: s.name }))}
              className="mt-1"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Contact</label>
            <Select
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
              options={contacts.map((c) => ({ value: c.id, label: c.name }))}
              placeholder="None"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Value ($)</label>
            <Input
              type="number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="0"
              className="mt-1"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading || !dealName || !stageId}>
            {loading ? "Creating..." : "Create Deal"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
