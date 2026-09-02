"use client";

import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import type { Student, TargetMode } from "./types";

interface TargetPickerProps {
  targetMode: TargetMode;
  onTargetModeChange: (mode: TargetMode) => void;
  students: Student[];
  grades: string[];
  studentId: string;
  onStudentIdChange: (id: string) => void;
  grade: string;
  onGradeChange: (grade: string) => void;
  group: Set<number>;
  onGroupChange: (next: Set<number> | ((prev: Set<number>) => Set<number>)) => void;
  targets: Student[];
}

export default function TargetPicker({
  targetMode,
  onTargetModeChange,
  students,
  grades,
  studentId,
  onStudentIdChange,
  grade,
  onGradeChange,
  group,
  onGroupChange,
  targets,
}: TargetPickerProps) {
  return (
    <>
      <div>
        <Label>¿A quién afecta?</Label>
        <div className="flex flex-wrap gap-2 mt-1">
          <button type="button" onClick={() => onTargetModeChange("student")} className={`chip ${targetMode === "student" ? "chip-active" : ""}`}>Un alumno</button>
          <button type="button" onClick={() => onTargetModeChange("grade")} className={`chip ${targetMode === "grade" ? "chip-active" : ""}`}>Un curso</button>
          <button type="button" onClick={() => onTargetModeChange("multiple")} className={`chip ${targetMode === "multiple" ? "chip-active" : ""}`}>Varios alumnos</button>
        </div>
      </div>

      {targetMode === "student" && (
        <div>
          <Label htmlFor="sm-student">Alumno</Label>
          <Select value={studentId} onValueChange={onStudentIdChange}>
            <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
            <SelectContent>
              {students.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.name}{s.grade ? ` · ${s.grade}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {targetMode === "grade" && (
        <div>
          <Label htmlFor="sm-grade">Curso</Label>
          {grades.length === 0 ? (
            <p className="text-xs text-gray-500 mt-1">Ningún alumno con curso.</p>
          ) : (
            <Select value={grade} onValueChange={onGradeChange}>
              <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
              <SelectContent>
                {grades.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
      )}
      {targetMode === "multiple" && (
        <div>
          <Label>Alumnos</Label>
          <div className="space-y-1.5 mt-1 max-h-[28dvh] overflow-y-auto">
            {students.map((s) => (
              <label
                key={s.id}
                className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors ${
                  group.has(s.id)
                    ? "bg-[#eff6ff] border-[var(--accent)]/40"
                    : "bg-gray-50 border-gray-100"
                }`}
              >
                <Checkbox
                  checked={group.has(s.id)}
                  onChange={() => onGroupChange((prev) => {
                    const n = new Set(prev);
                    if (n.has(s.id)) n.delete(s.id);
                    else n.add(s.id);
                    return n;
                  })}
                />
                <span className="font-medium">{s.name}</span>
                {s.grade ? <span className="text-xs text-gray-500">· {s.grade}</span> : null}
              </label>
            ))}
          </div>
        </div>
      )}

      {targets.length > 0 && (
        <p className="text-xs text-gray-500">
          Afecta a <strong>{targets.length}</strong> alumno{targets.length !== 1 ? "s" : ""}
          {targets.length <= 3 ? `: ${targets.map((t) => t.name).join(", ")}` : ""}
        </p>
      )}
    </>
  );
}
