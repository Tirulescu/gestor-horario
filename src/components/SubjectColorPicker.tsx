"use client";

import { Label } from "@/components/ui/label";
import { SUBJECT_COLOR_PRESETS } from "@/lib/subjectColors";

interface SubjectColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  id?: string;
  label?: string;
}

export default function SubjectColorPicker({
  value,
  onChange,
  id = "subject-color",
  label = "Color de la asignatura",
}: SubjectColorPickerProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div
        className="subject-color-grid"
        role="radiogroup"
        aria-label={label}
      >
        {SUBJECT_COLOR_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            role="radio"
            aria-checked={value === preset}
            className={`subject-color-swatch ${value === preset ? "subject-color-swatch-active" : ""}`}
            style={{ backgroundColor: preset }}
            title={preset}
            onClick={() => onChange(preset)}
          />
        ))}
        <label className="subject-color-custom" title="Color personalizado">
          <input
            id={id}
            type="color"
            value={value.startsWith("#") ? value : SUBJECT_COLOR_PRESETS[0]}
            onChange={(e) => onChange(e.target.value.toLowerCase())}
            className="subject-color-custom-input"
            aria-label="Elegir color personalizado"
          />
          <span className="subject-color-custom-ring" style={{ borderColor: value }} aria-hidden />
        </label>
      </div>
    </div>
  );
}
