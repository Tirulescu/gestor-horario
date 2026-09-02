import type { LucideIcon } from "lucide-react";

interface PageHeaderProps {
  icon: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}

export default function PageHeader({ icon: Icon, title, description, actions }: PageHeaderProps) {
  return (
    <div className="page-header">
      <div className="min-w-0 flex-1">
        <h1 className="section-title flex items-center gap-2 flex-wrap">
          <Icon className="text-blue-600 shrink-0" aria-hidden />
          {title}
        </h1>
        {description && <div className="page-description">{description}</div>}
      </div>
      {actions && <div className="page-header-actions shrink-0 w-full sm:w-auto">{actions}</div>}
    </div>
  );
}
