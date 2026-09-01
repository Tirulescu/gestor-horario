import type { LucideIcon } from "lucide-react";

interface PageHeaderProps {
  icon: LucideIcon;
  title: React.ReactNode;
  description?: string;
  actions?: React.ReactNode;
}

export default function PageHeader({ icon: Icon, title, description, actions }: PageHeaderProps) {
  return (
    <div className="page-header">
      <div className="min-w-0 flex-1">
        <h1 className="section-title flex items-center gap-2">
          <Icon className="text-blue-600 shrink-0" aria-hidden />
          {title}
        </h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {actions && <div className="page-header-actions shrink-0 w-full sm:w-auto">{actions}</div>}
    </div>
  );
}
