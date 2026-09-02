import { Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { collectSubjectDurationOptions } from "@/lib/hours";

interface SubjectDurationBadgesProps {
  subject: { defaultDurationMin: number; isCollective?: boolean };
  members?: { durationMin: number | null }[] | null;
  gradeDurations?: { durationMin: number }[] | null;
  className?: string;
}

export default function SubjectDurationBadges({
  subject,
  members,
  gradeDurations,
  className = "font-normal gap-1",
}: SubjectDurationBadgesProps) {
  const options = collectSubjectDurationOptions(subject, members, gradeDurations);
  return (
    <>
      {options.map((d) => (
        <Badge key={d} variant="gray" className={className}>
          <Clock size={11} />
          {d} min
        </Badge>
      ))}
    </>
  );
}
