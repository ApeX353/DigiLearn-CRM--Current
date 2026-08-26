import type { LucideIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";

const PulsingAlert = ({
  title,
  icon,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  icon?: LucideIcon;
}) => {
  const Icon = icon || null;
  const Actions = actions || null;

  return (
    <Alert
      variant="destructive"
      className="animate-pulse-breach border-destructive/50 bg-destructive/10"
    >
      {Icon && <Icon className="h-4 w-4" />}
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="flex items-center justify-between">
        {description}
        {Actions}
      </AlertDescription>
    </Alert>
  );
};

export default PulsingAlert
