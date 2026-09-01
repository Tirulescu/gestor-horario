"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Save, X } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { TableCardSkeleton } from "@/components/skeletons";
import { useToast } from "./Toast";

interface Field {
  placeholder?: string;
  name: string;
  label: string;
  type?: "text" | "number" | "select";
  options?: { value: string | number; label: string }[];
  required?: boolean;
}

interface Column {
  key: string;
  label: string;
  render?: (row: Record<string, unknown>) => React.ReactNode;
}

interface CrudListProps {
  endpoint: string;
  /** Optional separate endpoint for GET/list (e.g. with query filters). Defaults to `endpoint`. */
  listEndpoint?: string;
  title: string;
  fields: Field[];
  columns: Column[];
  getId: (row: Record<string, unknown>) => number;
  emptyText?: string;
  extraActions?: (row: Record<string, unknown>) => React.ReactNode;
}

const emptyForm = (fields: Field[]) => {
  const f: Record<string, string> = {};
  for (const field of fields) f[field.name] = "";
  return f;
};

export default function CrudList({ endpoint, listEndpoint, title, fields, columns, getId, emptyText = "No hay registros", extraActions }: CrudListProps) {
  const toast = useToast();
  const listUrl = listEndpoint ?? endpoint;
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [form, setForm] = useState<Record<string, string>>(emptyForm(fields));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  async function load() {
    const res = await fetch(listUrl);
    const data = await res.json();
    setRows(data);
  }

  useEffect(() => { load(); }, []);

  function openNew() {
    setEditing(null);
    setForm(emptyForm(fields));
    setError(null);
    setFormOpen(true);
  }

  function openEdit(row: Record<string, unknown>) {
    setEditing(row);
    const f: Record<string, string> = {};
    for (const field of fields) f[field.name] = String(row[field.name] ?? "");
    setForm(f);
    setError(null);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditing(null);
    setForm(emptyForm(fields));
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (editing) {
      const unchanged = fields.every((f) => form[f.name] === String(editing[f.name] ?? ""));
      if (unchanged) {
        closeForm();
        return;
      }
    }
    setLoading(true);
    const payload: Record<string, unknown> = {};
    for (const f of fields) {
      const v = form[f.name];
      if (f.type === "number") payload[f.name] = Number(v);
      else payload[f.name] = v;
    }
    if (editing) payload.id = getId(editing);
    const method = editing ? "PUT" : "POST";
    const res = await fetch(endpoint, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setLoading(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Error");
      toast("error", d.error || "Error al guardar");
      return;
    }
    toast("success", editing ? "Actualizado correctamente" : "Creado correctamente");
    closeForm();
    await load();
  }

  async function confirmDelete() {
    if (confirmId === null) return;
    const res = await fetch(`${endpoint}?id=${confirmId}`, { method: "DELETE" });
    setConfirmId(null);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast("error", d.error || "Error al borrar");
    } else {
      toast("success", "Borrado");
    }
    await load();
  }

  const itemLabel = title.toLowerCase().slice(0, -1);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="section-title">{title}</h1>
        <Button onClick={openNew}>
          <Plus size={16} />
          <span className="hidden sm:inline">Nuevo</span>
        </Button>
      </div>

      {rows === null ? (
        <TableCardSkeleton rows={4} />
      ) : (
      <Card className="p-5 overflow-x-auto">
        {rows.length === 0 ? (
          <div className="text-gray-500 text-sm">{emptyText}</div>
        ) : (
          <table className="w-full text-sm rtable">
            <thead>
              <tr className="text-left border-b border-gray-100">
                {columns.map((c) => <th key={c.key} className="py-2 pr-4 font-medium text-gray-600">{c.label}</th>)}
                <th className="py-2 font-medium text-gray-600 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={getId(row)} className="border-b border-gray-50">
                  {columns.map((c) => (
                    <td key={c.key} className="py-2 pr-4" data-label={c.label}>
                      {c.render ? c.render(row) : String(row[c.key] ?? "")}
                    </td>
                  ))}
                  <td className="py-2" data-actions>
                    <div className="flex gap-1.5 justify-end">
                      <Button size="iconSm" variant="outline" onClick={() => openEdit(row)} aria-label="Editar"><Pencil size={14} /></Button>
                      <Button size="iconSm" variant="destructive" onClick={() => setConfirmId(getId(row))} aria-label="Borrar"><Trash2 size={14} /></Button>
                      {extraActions?.(row)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      )}

      <Dialog open={formOpen} onOpenChange={(o) => { if (!o) closeForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? `Editar ${itemLabel}` : `Nuevo ${itemLabel}`}</DialogTitle>
          </DialogHeader>
          <form id="crud-form" onSubmit={submit} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {fields.map((f) => (
                <div key={f.name} className="grid gap-2">
                  <Label htmlFor={`crud-${f.name}`}>{f.label}</Label>
                  {f.type === "select" ? (
                    <select
                      id={`crud-${f.name}`}
                      className="input"
                      value={form[f.name] ?? ""}
                      onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}
                      required={f.required}
                    >
                      <option value="">{"Selecciona…"}</option>
                      {f.options?.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      id={`crud-${f.name}`}
                      type={f.type === "number" ? "number" : "text"}
                      value={form[f.name] ?? ""}
                      onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}
                      required={f.required}
                      placeholder={f.placeholder ?? "Escribe aquí…"}
                    />
                  )}
                </div>
              ))}
            </div>
            {error && <div className="text-red-600 text-sm">{error}</div>}
          </form>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={closeForm}><X size={14} /> Cancelar</Button>
            <Button type="submit" form="crud-form" disabled={loading}><Save size={14} /> {editing ? "Guardar" : "Crear"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmId !== null} onOpenChange={(o) => { if (!o) setConfirmId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar borrado</AlertDialogTitle>
            <AlertDialogDescription>¿Seguro que quieres borrar este registro? Esta acción es en cascada.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Borrar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}